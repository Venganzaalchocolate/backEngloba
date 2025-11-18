// controllers/auditInfo.controller.js
const mongoose = require('mongoose');
const {
  User,
  Program,
  Dispositive,
  Periods,
  Leaves
} = require('../models/indexModels');

const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* =========================================================
   HELPERS
========================================================= */

function buildEmploymentFilter(status) {
  if (!status || status === 'todos') return {};

  if (status === 'activos') {
    return { employmentStatus: { $in: ['activo', 'en proceso de contratación'] } };
  }

  if (status === 'inactivos') {
    return { employmentStatus: 'ya no trabaja con nosotros' };
  }

  return {};
}

/* =========================================================
   1. AUDITORÍA DE USUARIOS — INFORMACIÓN
   (OPTIMIZADO CON AGGREGATE + LOOKUP A PERIODS/DISPOSITIVE/PROGRAM)
========================================================= */

const auditInfoUsers = async (req, res) => {
  const { fields = [], apafa = null, employmentStatus = 'activos' } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío en body.fields', 400);
  }

  const userSchemaPaths = User.schema.paths;
  const orMissing = [];

  for (const f of fields) {
    // no existe / null / string vacío
    orMissing.push({ [f]: { $exists: false } });
    orMissing.push({ [f]: null });
    orMissing.push({ [f]: '' });

    // solo añadir $size si es Array
    const schemaType = userSchemaPaths[f];
    if (schemaType && schemaType.instance === 'Array') {
      orMissing.push({ [f]: { $size: 0 } });
    }
  }

  const empFilter = buildEmploymentFilter(employmentStatus);
  const apafaFilter =
    apafa === null ? {} : { apafa: apafa === 'si' ? true : apafa === 'no' ? false : undefined };
  if (apafaFilter.apafa === undefined) delete apafaFilter.apafa;

  const now = new Date();

  const pipeline = [
    {
      $match: {
        $or: orMissing,
        ...empFilter,
        ...apafaFilter
      }
    },
    {
      // Periodos ACTUALES del usuario + info de dispositivo y programa
      $lookup: {
        from: 'periods',
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$idUser', '$$userId'] },
                  { $lte: ['$startDate', now] },
                  {
                    $or: [
                      { $eq: ['$endDate', null] },
                      { $gte: ['$endDate', now] }
                    ]
                  }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'dispositives',
              localField: 'dispositiveId',
              foreignField: '_id',
              as: 'device'
            }
          },
          {
            $unwind: {
              path: '$device',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'programs',
              localField: 'device.program',
              foreignField: '_id',
              as: 'program'
            }
          },
          {
            $unwind: {
              path: '$program',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 1,
              startDate: 1,
              endDate: 1,
              position: 1,
              category: 1,
              workShift: 1,
              dispositiveId: 1,
              deviceName: '$device.name',
              programId: '$program._id',
              programName: '$program.name'
            }
          }
        ],
        as: 'currentHiring'
      }
    },
    {
      $project: {
        firstName: 1,
        lastName: 1,
        dni: 1,
        email: 1,
        phone: 1,
        apafa: 1,
        employmentStatus: 1,
        currentHiring: 1
      }
    }
  ];

  const users = await User.aggregate(pipeline);

  response(res, 200, users);
};

/* =========================================================
   2. AUDITORÍA DE PROGRAMAS — INFORMACIÓN
   (TIPO-AWARE PARA $size, SIN BUCLES LENTOS)
========================================================= */

const auditInfoPrograms = async (req, res) => {
  const { fields = [] } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío en fields', 400);
  }

  const programSchemaPaths = Program.schema.paths;
  const orMissing = [];

  for (const f of fields) {
    orMissing.push({ [f]: { $exists: false } });
    orMissing.push({ [f]: null });
    orMissing.push({ [f]: '' });

    const schemaType = programSchemaPaths[f];
    if (schemaType && schemaType.instance === 'Array') {
      orMissing.push({ [f]: { $size: 0 } });
    }
  }

  const programs = await Program.find({
    active: true,
    $or: orMissing
  })
    .select('name acronym active responsible province finantial groupWorkspace')
    .lean();

  response(res, 200, programs);
};

/* =========================================================
   3. AUDITORÍA DE DISPOSITIVOS — INFORMACIÓN
   (TIPO-AWARE PARA $size, SIN BUCLES LENTOS)
========================================================= */

const auditInfoDevices = async (req, res) => {
  const { fields = [] } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío', 400);
  }

  const deviceSchemaPaths = Dispositive.schema.paths;
  const orMissing = [];

  for (const f of fields) {
    orMissing.push({ [f]: { $exists: false } });
    orMissing.push({ [f]: null });
    orMissing.push({ [f]: '' });

    const schemaType = deviceSchemaPaths[f];
    if (schemaType && schemaType.instance === 'Array') {
      orMissing.push({ [f]: { $size: 0 } });
    }
  }

  const devices = await Dispositive.find({
    active: true,
    $or: orMissing
  })
    .populate({ path: 'program', select: 'name acronym active' })
    .select('name active responsible coordinators email phone program')
    .lean();

  response(res, 200, devices);
};

/* =========================================================
   4. AUDITORÍA DE BAJAS ACTIVAS
      (aggregate con filtros opcionales y periodos + dispositivo)
========================================================= */

const auditActiveLeaves = async (req, res) => {
  const {
    apafa = 'todos',
    employmentStatus = 'activos',
    leaveTypes = []
  } = req.body;

  const now = new Date();

  // --------- filtros para Leaves ----------
  const leavesMatch = {
    active: true,
    $or: [
      { actualEndLeaveDate: null },
      { actualEndLeaveDate: { $exists: false } }
    ]
  };

  if (Array.isArray(leaveTypes) && leaveTypes.length > 0) {
    leavesMatch.leaveType = {
      $in: leaveTypes.map(id => new mongoose.Types.ObjectId(id))
    };
  }

  // --------- filtros para Usuario (APAFA + estado) ----------
  const userStatusFilter = buildEmploymentFilter(employmentStatus);
  const userApafaFilter =
    apafa === 'si'
      ? { apafa: true }
      : apafa === 'no'
      ? { apafa: false }
      : {};

  const pipeline = [
    { $match: leavesMatch },
    {
      $lookup: {
        from: 'users',
        localField: 'idUser',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $match: {
        ...Object.keys(userStatusFilter).length ? { 'user.employmentStatus': userStatusFilter.employmentStatus } : {},
        ...Object.keys(userApafaFilter).length ? { 'user.apafa': userApafaFilter.apafa } : {}
      }
    },
    // Periodos activos del usuario + dispositivo + programa
    {
      $lookup: {
        from: 'periods',
        let: { userId: '$user._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$idUser', '$$userId'] },
                  { $lte: ['$startDate', now] },
                  {
                    $or: [
                      { $eq: ['$endDate', null] },
                      { $gte: ['$endDate', now] }
                    ]
                  }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'dispositives',
              localField: 'dispositiveId',
              foreignField: '_id',
              as: 'device'
            }
          },
          {
            $unwind: {
              path: '$device',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'programs',
              localField: 'device.program',
              foreignField: '_id',
              as: 'program'
            }
          },
          {
            $unwind: {
              path: '$program',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 1,
              startDate: 1,
              endDate: 1,
              position: 1,
              category: 1,
              workShift: 1,
              dispositiveId: 1,
              deviceName: '$device.name',
              programId: '$program._id',
              programName: '$program.name'
            }
          }
        ],
        as: 'currentPeriods'
      }
    },
    {
      $project: {
        _id: 0,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          dni: '$user.dni',
          email: '$user.email',
          phone: '$user.phone',
          apafa: '$user.apafa',
          employmentStatus: '$user.employmentStatus'
        },
        leave: {
          _id: '$_id',
          leaveType: '$leaveType',
          startLeaveDate: '$startLeaveDate',
          expectedEndLeaveDate: '$expectedEndLeaveDate',
          actualEndLeaveDate: '$actualEndLeaveDate'
        },
        currentPeriods: '$currentPeriods'
      }
    }
  ];

  const results = await Leaves.aggregate(pipeline);
  response(res, 200, results);
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  auditInfoUsers: catchAsync(auditInfoUsers),
  auditInfoPrograms: catchAsync(auditInfoPrograms),
  auditInfoDevices: catchAsync(auditInfoDevices),
  auditActiveLeaves: catchAsync(auditActiveLeaves)
};
