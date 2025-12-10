const { UserCv, Program, Offer, User, Periods, Dispositive } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* =====================================================================================
   HELPERS
===================================================================================== */

// Usuarios contratados → número de CV con DNI que coincide con un empleado
const countHiredCv = async () => {
  const dnis = await User.distinct('dni');
  if (!dnis.length) return 0;
  return UserCv.countDocuments({ dni: { $in: dnis } });
};

/* =====================================================================================
   1. OVERVIEW
===================================================================================== */
const getCvOverview = async (req, res) => {
  const now = new Date();
  const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, month, hired, disability33] = await Promise.all([
    UserCv.estimatedDocumentCount(),
    UserCv.countDocuments({ createdAt: { $gte: firstDayMonth } }),
    countHiredCv(),
    UserCv.countDocuments({ disability: { $gte: 33 } })
  ]);

  response(res, 200, {
    total,
    thisMonth: month,
    hired,
    disabilityEqualOrAbove33: disability33
  });
};

/* =====================================================================================
   2. SERIE MENSUAL
===================================================================================== */
const getCvMonthly = async (req, res) => {
  const { year } = req.body;
  if (!year || isNaN(year)) {
    return response(res, 400, { error: 'Debes enviar un año válido.' });
  }

  const start = new Date(year, 0, 1);
  const end = new Date(+year + 1, 0, 1);

  const monthlyPipeline = [
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: 1 } } },
    { $sort: { '_id': 1 } }
  ];

  const yearsPipeline = [
    { $group: { _id: { $year: '$createdAt' } } },
    { $sort: { '_id': -1 } },
    { $project: { _id: 0, year: { $toString: '$_id' } } }
  ];

  const [rawMonthly, yearsRaw] = await Promise.all([
    UserCv.aggregate(monthlyPipeline),
    UserCv.aggregate(yearsPipeline)
  ]);

  const counts = rawMonthly.reduce((acc, { _id, total }) => {
    const [, m] = _id.split('-');
    acc[m] = total;
    return acc;
  }, {});

  response(res, 200, { [year]: counts, years: yearsRaw.map(y => y.year) });
};

/* =====================================================================================
   3. DISTRIBUCIÓN
===================================================================================== */

const getCvDistributionMeta = async (field) => {
  const allowed = ['provinces', 'jobs', 'studies', 'work_schedule'];
  if (!allowed.includes(field)) throw new ClientError(`Campo inválido: ${field}`, 400);

  const docs = await UserCv.aggregate([
    { $unwind: `$${field}` },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } } } },
    {
      $project: {
        _id: 0,
        year: { $toString: '$_id.year' },
        month: {
          $cond: [
            { $lt: ['$_id.month', 10] },
            { $concat: ['0', { $toString: '$_id.month' }] },
            { $toString: '$_id.month' }
          ]
        }
      }
    },
    { $sort: { year: 1, month: 1 } }
  ]);

  const years = [];
  const monthsByYear = {};

  docs.forEach(({ year, month }) => {
    if (!years.includes(year)) years.push(year);
    if (!monthsByYear[year]) monthsByYear[year] = new Set();
    monthsByYear[year].add(month);
  });

  years.sort();
  const monthsClean = {};
  years.forEach(y => monthsClean[y] = [...monthsByYear[y]].sort());

  return { years, monthsByYear: monthsClean };
};

const getCvDistribution = async (req, res) => {
  const { year, month, field, granularity = 'month' } = req.body || {};

  const allowed = ['provinces', 'jobs', 'studies', 'work_schedule'];
  if (!allowed.includes(field)) throw new ClientError('Campo no admitido.', 400);

  if (!year) throw new ClientError('Falta year', 400);
  if (granularity === 'month' && !month) throw new ClientError('Falta month', 400);

  const match = {
    createdAt: {
      $gte: new Date(`${year}-${month || '01'}-01T00:00:00Z`),
      $lt: granularity === 'year'
        ? new Date(`${+year + 1}-01-01T00:00:00Z`)
        : new Date(Date.UTC(year, +month, 1))
    }
  };

  const periods = granularity === 'year'
    ? { year: { $year: '$createdAt' } }
    : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };

  const pipeline = [
    { $match: match },
    { $unwind: `$${field}` },
    { $group: { _id: { period: periods, val: `$${field}` }, total: { $sum: 1 } } },
    { $group: { _id: '$_id.period', distr: { $push: { value: '$_id.val', total: '$total' } } } },
    { $set: { distr: { $sortArray: { input: '$distr', sortBy: { total: -1 } } } } },
    { $set: { distr: { $slice: ['$distr', 12] } } },
    {
      $project: {
        _id: 0,
        period:
          granularity === 'year'
            ? { $toString: '$_id.year' }
            : {
              $concat: [
                { $toString: '$_id.year' },
                '-',
                {
                  $cond: [
                    { $lt: ['$_id.month', 10] },
                    { $concat: ['0', { $toString: '$_id.month' }] },
                    { $toString: '$_id.month' }
                  ]
                }
              ]
            },
        distribution: '$distr'
      }
    },
    { $sort: { period: 1 } }
  ];

  const data = await UserCv.aggregate(pipeline);
  const meta = await getCvDistributionMeta(field);

  response(res, 200, { distribution: data, meta });
};

/* =====================================================================================
   4. CONVERSIÓN CV → CONTRATADO
===================================================================================== */
const getEmployeeDnis = async () => User.distinct('dni');

const getCvConversion = async (req, res) => {
  const { year } = req.body || {};
  if (!year) throw new ClientError('Falta year', 400);

  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${+year + 1}-01-01T00:00:00Z`);
  const hiredDnis = await getEmployeeDnis();

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        totalCv: { $sum: 1 },
        hiredCv: { $sum: { $cond: [{ $in: ['$dni', hiredDnis] }, 1, 0] } }
      }
    },
    { $sort: { '_id.month': 1 } },
    {
      $project: {
        _id: 0,
        period: {
          year,
          month: {
            $cond: [
              { $lt: ['$_id.month', 10] },
              { $concat: ['0', { $toString: '$_id.month' }] },
              { $toString: '$_id.month' }
            ]
          }
        },
        totalCv: 1,
        hiredCv: 1,
        conversionRate: {
          $cond: [{ $eq: ['$totalCv', 0] }, 0, { $divide: ['$hiredCv', '$totalCv'] }]
        }
      }
    }
  ];

  const yearsPipeline = [
    { $group: { _id: { $year: '$createdAt' } } },
    { $sort: { '_id': -1 } },
    { $project: { _id: 0, year: { $toString: '$_id' } } }
  ];

  const [data, yearsRaw] = await Promise.all([
    UserCv.aggregate(pipeline),
    UserCv.aggregate(yearsPipeline)
  ]);

  response(res, 200, { data, years: yearsRaw.map(y => y.year) });
};

/* =====================================================================================
   5. ESTADÍSTICAS DE TRABAJADORES (AUDIT + WORKERSSTATS)
===================================================================================== */

/* =====================================================================================
   🔥 6. ESTADÍSTICAS DE TRABAJADORES BASADAS EN PERIODS + DISPOSITIVE
===================================================================================== */

/* ------------------------------------------------------------
   1 · Construye el $match común en base a:
       - año, mes
       - programa
       - dispositivo
       - apafa
       - Periods (histórico)
       - dispositivo actual (via último Period)
------------------------------------------------------------ */
async function buildMatchStage({ year, month, programId, deviceId, apafa }) {

  if (month && !year)
    throw new ClientError('Si envías month debes enviar también year', 400);

  if (month && (month < 1 || month > 12))
    throw new ClientError('month debe estar entre 1-12', 400);

  if (programId && !mongoose.Types.ObjectId.isValid(programId))
    throw new ClientError('programId inválido', 400);

  if (deviceId && !mongoose.Types.ObjectId.isValid(deviceId))
    throw new ClientError('deviceId inválido', 400);

  let refDate = new Date();
  let periodDateMatch = null;

  if (year && month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or: [{ endDate: null }, { endDate: { $gte: start } }]
    };

    refDate = end;
  }
  else if (year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or: [{ endDate: null }, { endDate: { $gte: start } }]
    };

    refDate = end;
  }

  let deviceIdsFilter = [];

  if (programId) {
    const program = await Dispositive.find(
      { program: programId },
      { _id: 1 }
    ).lean();

    deviceIdsFilter = program.map(d => d._id.toString());
  }

  if (deviceId) {
    if (deviceIdsFilter.length && !deviceIdsFilter.includes(deviceId)) {
      deviceIdsFilter = ['000000000000000000000000'];
    } else {
      deviceIdsFilter = [deviceId];
    }
  }

  const match = { employmentStatus: 'activo' };

  if (apafa === 'si') match.apafa = true;
  else if (apafa === 'no') match.apafa = false;

  const periodsFilter = {};

  if (periodDateMatch) Object.assign(periodsFilter, periodDateMatch);

  if (deviceIdsFilter.length) {
    periodsFilter.deviceId = { $in: deviceIdsFilter.map(id => new mongoose.Types.ObjectId(id)) };
    periodsFilter.endDate = null;
  }

  return { match, periodsFilter, refDate };
}



/* =====================================================================================
   3 · AUDITADO BÁSICO (auditWorkersStats)
===================================================================================== */

const auditWorkersStats = async (req, res) => {
  const { month, year, programId, deviceId, apafa } = req.body;

  const { match, periodsFilter, refDate } = await buildMatchStage({
    month, year, programId, deviceId, apafa
  });

  const pipeline = [
    { $match: match },

    {
      $lookup: {
        from: "periods",
        localField: "_id",
        foreignField: "idUser",
        as: "periods"
      }
    },

    ...(Object.keys(periodsFilter).length > 0 ? [{
      $match: { periods: { $elemMatch: periodsFilter } }
    }] : []),

    {
      $addFields: {
        age: {
          $dateDiff: {
            startDate: "$birthday",
            endDate: refDate,
            unit: "year"
          }
        }
      }
    },

    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        disability: { $sum: { $cond: [{ $gt: ["$disability.percentage", 0] }, 1, 0] } },
        male: { $sum: { $cond: [{ $eq: ["$gender", "male"] }, 1, 0] } },
        female: { $sum: { $cond: [{ $eq: ["$gender", "female"] }, 1, 0] } },
        fostered: { $sum: { $cond: ["$fostered", 1, 0] } },
        over55: { $sum: { $cond: [{ $gte: ["$age", 55] }, 1, 0] } },
        under25: { $sum: { $cond: [{ $lt: ["$age", 25] }, 1, 0] } },
      }
    },

    { $project: { _id: 0 } }
  ];

  const stats = await User.aggregate(pipeline);

  response(res, 200, stats[0] || {
    total: 0, disability: 0, male: 0, female: 0,
    fostered: 0, over55: 0, under25: 0
  });
};




/* =====================================================================================
   4 · WORKERS-STATS (gráfico completo) - dinámico
===================================================================================== */

const getWorkersStats = async (req, res) => {
  const {
    year, month, programId, deviceId, apafa,
    stats = []
  } = req.body;

  const { match, periodsFilter, refDate } = await buildMatchStage({
    year, month, programId, deviceId, apafa
  });

  const wanted = new Set(stats);
  const facets = {};

  /* ---------------- AUDIT ---------------- */
  if (!stats.length || wanted.has("audit")) {
    facets.audit = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          disability: { $sum: { $cond: [{ $gt: ['$disability.percentage', 0] }, 1, 0] } },
          male: { $sum: { $cond: [{ $eq: ['$gender', 'male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } },
          fostered: { $sum: { $cond: ['$fostered', 1, 0] } },
          over55: { $sum: { $cond: [{ $gte: ['$age', 55] }, 1, 0] } },
          under25: { $sum: { $cond: [{ $lt: ['$age', 25] }, 1, 0] } }
        }
      },
      { $project: { _id: 0 } }
    ];
  }

  /* ---------------- PIRÁMIDE ---------------- */
  if (!stats.length || wanted.has("pyramid")) {
    facets.pyramid = [
      {
        $group: {
          _id: "$age",
          male: { $sum: { $cond: [{ $eq: ['$gender', 'male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } }
        }
      },
      { $project: { _id: 0, age: "$_id", male: 1, female: 1 } },
      { $sort: { age: 1 } }
    ];
  }

  /* ---------------- PIE CHARTS ---------------- */
  const pieFields = ["gender", "apafa", "fostered", "disability"];

  for (const fld of pieFields) {
    if (stats.length && !wanted.has(`pie:${fld}`)) continue;

    let expr;
    switch (fld) {
      case "disability":
        expr = { $cond: [{ $gt: ["$disability.percentage", 0] }, "disability", "no_disability"] };
        break;
      case "apafa":
        expr = { $cond: ["$apafa", "apafa", "engloba"] };
        break;
      case "fostered":
        expr = { $cond: ["$fostered", "fostered", "no_fostered"] };
        break;
      default:
        expr = "$gender";
    }

    facets[`pie_${fld}`] = [
      { $group: { _id: expr, value: { $sum: 1 } } },
      { $project: { _id: 0, key: "$_id", value: 1 } }
    ];
  }

  /* ---------------- ALTAS / BAJAS ---------------- */
  if (!stats.length || wanted.has("hiredEnded")) {
    facets.hiredEnded = [
      { $unwind: "$periods" },

      ...(Object.keys(periodsFilter).length > 0 ? [{
        $match: { periods: { $elemMatch: periodsFilter } }
      }] : []),

      {
        $project: {
          events: {
            $concatArrays: [
              [{ date: "$periods.startDate", type: "hired" }],
              {
                $cond: [
                  { $ne: ["$periods.endDate", null] },
                  [{ date: "$periods.endDate", type: "ended" }],
                  []
                ]
              }
            ]
          }
        }
      },

      { $unwind: "$events" },

      {
        $group: {
          _id: {
            y: { $year: "$events.date" },
            m: { $month: "$events.date" }
          },
          hired: { $sum: { $cond: [{ $eq: ["$events.type", "hired"] }, 1, 0] } },
          ended: { $sum: { $cond: [{ $eq: ["$events.type", "ended"] }, 1, 0] } }
        }
      },

      { $project: { _id: 0, year: "$_id.y", month: "$_id.m", hired: 1, ended: 1 } },
      { $sort: { year: 1, month: 1 } }
    ];
  }

  /* ---------------- JORNADA ---------------- */
  if (!stats.length || wanted.has("workShift")) {
    facets.workShift = [
      { $unwind: "$periods" },
      { $match: { "periods.endDate": null } },
      {
        $group: {
          _id: "$periods.workShift.type",
          total: { $sum: 1 }
        }
      },
      { $project: { _id: 0, type: "$_id", total: 1 } }
    ];
  }

  /* ---------------- TENURE ---------------- */
  if (!stats.length || wanted.has("tenure")) {
    facets.tenure = [
      { $unwind: "$periods" },
      { $match: { "periods.endDate": null } },
      {
        $addFields: {
          tenureYears: {
            $divide: [
              { $subtract: [refDate, "$periods.startDate"] },
              1000 * 60 * 60 * 24 * 365
            ]
          }
        }
      },
      {
        $addFields: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lt: ["$tenureYears", 1] }, then: "0-1" },
                { case: { $lt: ["$tenureYears", 3] }, then: "1-3" },
                { case: { $lt: ["$tenureYears", 5] }, then: "3-5" },
              ],
              default: "5+"
            }
          }
        }
      },
      {
        $group: {
          _id: "$bucket",
          total: { $sum: 1 }
        }
      },
      { $project: { _id: 0, bucket: "$_id", total: 1 } },
      { $sort: { bucket: 1 } }
    ];
  }

  /* ---------------- EJECUCIÓN ---------------- */
  const pipeline = [
    { $match: match },

    {
      $lookup: {
        from: "periods",
        localField: "_id",
        foreignField: "idUser",
        as: "periods"
      }
    },

    ...(Object.keys(periodsFilter).length > 0 ? [{
      $match: { periods: { $elemMatch: periodsFilter } }
    }] : []),

    {
      $addFields: {
        age: {
          $dateDiff: {
            startDate: "$birthday",
            endDate: refDate,
            unit: "year"
          }
        }
      }
    },

    { $facet: facets }
  ];

  const [raw] = await User.aggregate(pipeline);

  const responseData = {
    audit: raw.audit?.[0] ?? {
      total: 0, disability: 0, male: 0, female: 0,
      fostered: 0, over55: 0, under25: 0
    },
    pyramid: raw.pyramid ?? [],
    pie: {
      gender: raw.pie_gender ?? [],
      apafa: raw.pie_apafa ?? [],
      fostered: raw.pie_fostered ?? [],
      disability: raw.pie_disability ?? []
    },
    hiredEnded: raw.hiredEnded ?? [],
    workShift: raw.workShift ?? [],
    tenure: raw.tenure ?? []
  };

  response(res, 200, responseData);
};



/**
 * Devuelve la foto de la plantilla actual:
 * - total plantilla (headcount + FTE)
 * - por área de programa
 * - por programa
 * - por provincia
 * - por género
 */

const getCurrentHeadcountStats = async (req, res) => {
  const { year, apafa } = req.body || {};

  // 1) Fecha de referencia: ahora o fin de año seleccionado
  let refDate = new Date();
  if (year && !Number.isNaN(parseInt(year, 10))) {
    const y = parseInt(year, 10);
    // 31 diciembre del año indicado, 23:59:59.999 (UTC)
    refDate = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
  }

  const pipeline = [
    // 1) Solo periodos "vigentes" en la fecha de referencia
    {
      $match: {
        active: true,
        startDate: { $lte: refDate },
        $or: [
          { endDate: null },
          { endDate: { $gte: refDate } }
        ]
      }
    },
    // 2) Join con usuario (para género, apafa, etc.)
    {
      $lookup: {
        from: 'users',
        localField: 'idUser',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' }
  ];

  // 2.bis) Filtro APAFA
  if (apafa === 'true') {
    pipeline.push({ $match: { 'user.apafa': true } });
  } else if (apafa === 'false') {
    pipeline.push({ $match: { 'user.apafa': false } });
  }

  // 3) Join con dispositivo / programa
  pipeline.push(
    {
      $lookup: {
        from: 'dispositives',
        localField: 'dispositiveId',
        foreignField: '_id',
        as: 'dispositive'
      }
    },
    { $unwind: { path: '$dispositive', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'programs',
        localField: 'dispositive.program',
        foreignField: '_id',
        as: 'program'
      }
    },
    { $unwind: { path: '$program', preserveNullAndEmptyArrays: true } },

    // 4) Campos calculados (fte, ids planos, etc.)
    {
      $addFields: {
        fte: {
          $cond: [
            { $eq: ['$workShift.type', 'completa'] },
            1,
            0.5
          ]
        },
        gender: '$user.gender',

        programId: '$program._id',
        programName: '$program.name',
        programArea: '$program.area',

        // solo id, el nombre lo resuelves en el front con enumsData.provincesIndex
        provinceId: '$dispositive.province',

        dispositiveId: '$dispositive._id',
        dispositiveName: '$dispositive.name',

        // IMPORTANTE: jobId = position (ObjectId de Jobs)
        jobId: '$position'
      }
    },

    // 5) Facetas
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              headcount: 1,
              fte: 1
            }
          }
        ],

        byArea: [
          {
            $group: {
              _id: '$programArea',
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              area: '$_id',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { area: 1 } }
        ],

        byProgram: [
          {
            $group: {
              _id: {
                programId: '$programId',
                programName: '$programName',
                area: '$programArea'
              },
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              programId: '$_id.programId',
              programName: '$_id.programName',
              area: '$_id.area',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { programName: 1 } }
        ],

        byProvince: [
          {
            $group: {
              _id: '$provinceId',
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              provinceId: '$_id',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { headcount: -1 } }
        ],

        byGender: [
          {
            $group: {
              _id: '$gender',
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              gender: '$_id',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { gender: 1 } }
        ],

        byDispositive: [
          {
            $group: {
              _id: {
                dispositiveId: '$dispositiveId',
                dispositiveName: '$dispositiveName',
                programId: '$programId',
                programName: '$programName',
                area: '$programArea',
                provinceId: '$provinceId'
              },
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              dispositiveId: '$_id.dispositiveId',
              dispositiveName: '$_id.dispositiveName',
              programId: '$_id.programId',
              programName: '$_id.programName',
              area: '$_id.area',
              provinceId: '$_id.provinceId',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { programName: 1, dispositiveName: 1 } }
        ],

        byProgramGender: [
          {
            $group: {
              _id: {
                programId: '$programId',
                programName: '$programName',
                area: '$programArea',
                gender: '$gender'
              },
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              programId: '$_id.programId',
              programName: '$_id.programName',
              area: '$_id.area',
              gender: '$_id.gender',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { programName: 1, gender: 1 } }
        ],

        byJobDispositive: [
          {
            $group: {
              _id: {
                jobId: '$jobId',
                dispositiveId: '$dispositiveId',
                dispositiveName: '$dispositiveName',
                programId: '$programId',
                programName: '$programName',
                provinceId: '$provinceId'
              },
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              jobId: '$_id.jobId',
              dispositiveId: '$_id.dispositiveId',
              dispositiveName: '$_id.dispositiveName',
              programId: '$_id.programId',
              programName: '$_id.programName',
              provinceId: '$_id.provinceId',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { programName: 1, dispositiveName: 1 } }
        ],

        byDispositiveGender: [
          {
            $group: {
              _id: {
                dispositiveId: '$dispositiveId',
                dispositiveName: '$dispositiveName',
                programId: '$programId',
                programName: '$programName',
                area: '$programArea',
                provinceId: '$provinceId',
                gender: '$gender'
              },
              headcount: { $sum: 1 },
              fte: { $sum: '$fte' }
            }
          },
          {
            $project: {
              _id: 0,
              dispositiveId: '$_id.dispositiveId',
              dispositiveName: '$_id.dispositiveName',
              programId: '$_id.programId',
              programName: '$_id.programName',
              area: '$_id.area',
              provinceId: '$_id.provinceId',
              gender: '$_id.gender',
              headcount: 1,
              fte: 1
            }
          },
          { $sort: { programName: 1, dispositiveName: 1, gender: 1 } }
        ]
      }
    }
  );

  const aggArr = await Periods.aggregate(pipeline).exec();
  const agg = aggArr[0] || {
    totals: [],
    byArea: [],
    byProgram: [],
    byProvince: [],
    byGender: [],
    byDispositive: [],
    byProgramGender: [],
    byDispositiveGender: [],
    byJobDispositive: []
  };

  const totals = (agg.totals && agg.totals[0]) || { headcount: 0, fte: 0 };

  const respData = {
    generatedAt: new Date(),
    totals,
    byArea: agg.byArea || [],
    byProgram: agg.byProgram || [],
    byProvince: agg.byProvince || [],
    byGender: agg.byGender || [],
    byDispositive: agg.byDispositive || [],
    byProgramGender: agg.byProgramGender || [],
    byDispositiveGender: agg.byDispositiveGender || [],
    byJobDispositive: agg.byJobDispositive || []
  };

  response(res, 200, respData);
};


// Requiere tener Periods, User, Dispositive, Program importados arriba:
// const { Periods, User, Dispositive, Program } = require('../models/indexModels');

module.exports = {
  getCvOverview: catchAsync(getCvOverview),
  getCvMonthly: catchAsync(getCvMonthly),
  getCvDistribution: catchAsync(getCvDistribution),
  getCvConversion: catchAsync(getCvConversion),
  auditWorkersStats: catchAsync(auditWorkersStats),
  getWorkersStats: catchAsync(getWorkersStats),

  getCurrentHeadcountStats: catchAsync(getCurrentHeadcountStats)
};
