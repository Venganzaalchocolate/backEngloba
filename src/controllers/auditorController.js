// auditorController.js
const { mongoose } = require('mongoose');
const { User, Program, Dispositive, Filedrive, Documentation, Periods, Leaves } = require('../models/indexModels'); // ← añade Dispositive
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

const auditMissingFieldsInfoUser = async (req, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío en body.fields', 400);
  }
  const booleanFields = ['fostered', 'consetmentDataProtection'];
  const arrayFields = ['studies'];

  const orConditions = [];
  for (const field of fields) {
    orConditions.push({ [field]: { $exists: false } });
    orConditions.push({ [field]: null });
    if (booleanFields.includes(field)) continue;
    if (arrayFields.includes(field)) {
      orConditions.push({ [field]: { $size: 0 } });
    } else {
      orConditions.push({ [field]: '' });
    }
  }

  const apafaValue = !!req.body.apafa;

  const users = await User.find({
    $and: [
      { $or: orConditions },
      { apafa: apafaValue },
      { employmentStatus: 'activo' }
    ]
  });

  response(res, 200, users);
};

const auditMissingFieldsProgram = async (req, res) => {
  const { programFields = [] } = req.body;
  if (!Array.isArray(programFields) || programFields.length === 0) {
    throw new ClientError('Debes enviar al menos un campo en programFields', 400);
  }

  const booleanProgramFields = ['isActive', 'public'];
  const arrayProgramFields = ['responsible', 'finantial'];

  const buildOrConditions = (fields, booleanList, arrayList) =>
    fields.flatMap(f => {
      const ors = [{ [f]: { $exists: false } }, { [f]: null }];
      if (arrayList.includes(f)) ors.push({ [f]: { $size: 0 } });
      else if (!booleanList.includes(f)) ors.push({ [f]: '' });
      return ors;
    });

  const programOr = buildOrConditions(programFields, booleanProgramFields, arrayProgramFields);

  const query = { $and: [{ $or: programOr }, { active: true }] };

  const programs = await Program.find(query);
  response(res, 200, programs);
};

/* =========================================================
   DISPOSITIVE (antes “device” embebido en Program.devices)
   Auditar campos faltantes de Dispositive
========================================================= */
const auditMissingFieldsDevice = async (req, res) => {
  const { deviceFields = [] } = req.body;
  if (!Array.isArray(deviceFields) || deviceFields.length === 0) {
    throw new ClientError('Debes enviar al menos un campo en deviceFields', 400);
  }

  const booleanDeviceFields = []; // si tienes booleanos en Dispositive añádelos aquí
  const arrayDeviceFields = ['responsible', 'coordinators'];

  // Construir OR de carencias para Dispositive
  const buildOrConditions = (fields, booleanList, arrayList) => {
    const ors = [];
    for (const f of fields) {
      ors.push({ [f]: { $exists: false } });
      ors.push({ [f]: null });
      if (booleanList.includes(f)) continue;
      if (arrayList.includes(f)) ors.push({ [f]: { $size: 0 } });
      else ors.push({ [f]: '' });
    }
    return ors;
  };

  const dispositiveOr = buildOrConditions(deviceFields, booleanDeviceFields, arrayDeviceFields);

  // Limitar a programas activos
  const activeProgramIds = await Program.find({ active: true }).distinct('_id');

  // Dispositivos activos con carencias + programa activo
  const dispositives = await Dispositive.find({
    active: true,
    program: { $in: activeProgramIds },
    $or: dispositiveOr
  })
    .populate({ path: 'program', select: 'name acronym active' })
    .lean();

  // Agrupar por programa para mantener el shape anterior [{...program, devices:[...incompletos]}]
  const grouped = new Map();
  for (const d of dispositives) {
    const p = d.program || {};
    const pid = String(p?._id || d.program);
    if (!grouped.has(pid)) {
      grouped.set(pid, {
        _id: p?._id || d.program,
        name: p?.name || '—',
        acronym: p?.acronym || '',
        active: p?.active ?? true,
        devices: []
      });
    }
    // añade sólo los dispositivos incompletos
    grouped.get(pid).devices.push({
      _id: d._id,
      name: d.name,
      responsible: d.responsible,
      coordinators: d.coordinators,
      active: d.active
    });
  }

  response(res, 200, Array.from(grouped.values()));
};

/* =========================================================
   Documentación faltante/caducada por PROGRAMA
   (sin cambios sustanciales)
========================================================= */
const auditMissingFieldsDocumentationUser = async (req, res) => {
  const { docIds } = req.body;
  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  const apafaValue = !!req.body.apafa;

  const haveSomeDocs = await Filedrive.aggregate([
    { $match: { originModel: 'User', originDocumentation: { $in: docs } } },
    { $group: { _id: '$idModel' } }
  ]);
  const usersWithSomeIds = haveSomeDocs.map(g => g._id);

  const usersWithoutAny = await User.find({
    _id: { $nin: usersWithSomeIds },
    employmentStatus: 'activo',
    apafa: apafaValue
  })
    .select('firstName lastName dni email phone dispositiveNow')
    .lean();

  const haveSomeMissing = await Filedrive.aggregate([
    { $match: { originModel: 'User', originDocumentation: { $in: docs } } },
    { $group: { _id: '$idModel', present: { $addToSet: '$originDocumentation' } } },
    { $project: { present: 1, missing: { $setDifference: [docs, '$present'] } } },
    { $match: { 'missing.0': { $exists: true } } },
    {
      $lookup: {
        from: User.collection.name,
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$userId'] },
              employmentStatus: 'activo',
              apafa: apafaValue
            }
          }
        ],
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: '$user._id',
        firstName: '$user.firstName',
        lastName: '$user.lastName',
        dni: '$user.dni',
        email: '$user.email',
        phone: '$user.phone',
        dispositiveNow: '$user.dispositiveNow',
        missingDocs: '$missing'
      }
    }
  ]);

  const noneAtAll = usersWithoutAny.map(u => ({
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    dni: u.dni,
    dispositiveNow: u.dispositiveNow,
    email: u.email,
    phone: u.phone,
    missingDocs: docs
  }));

  const result = [...haveSomeMissing, ...noneAtAll];
  response(res, 200, result);
};

const auditMissingFieldsDocumentationProgram = async (req, res) => {
  const { docIds } = req.body;

  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  const programs = await Program.find({
    essentialDocumentationProgram: { $in: docs },
    active: true
  });

  const documentationWithTime = await Documentation.find({
    _id: { $in: docs },
    duration: { $exists: true }
  });

  const results = [];

  // Si tu Program tiene 'files' (array de Filedrive), esto se mantiene
  for (const program of programs) {
    const comunes = program.essentialDocumentationProgram
      .map(id => id.toString())
      .filter(id => docIds.includes(id));

    const missingDocs = comunes.filter(docId =>
      !(program.files || []).some(file => file.originDocumentation?.toString() === docId)
    );

    const expiredDocs = [];

    for (const doc of documentationWithTime) {
      if (!comunes.includes(doc._id.toString())) continue;

      const relevantFiles = (program.files || []).filter(
        file => file.originDocumentation?.toString() === doc._id.toString()
      );

      const latestFile = relevantFiles.reduce(
        (latest, file) =>
          !latest || new Date(file.createdAt) > new Date(latest.createdAt) ? file : latest,
        null
      );

      if (!latestFile) continue;

      const expirationDate = new Date(latestFile.createdAt);
      expirationDate.setDate(expirationDate.getDate() + doc.duration);

      if (expirationDate < new Date()) expiredDocs.push(doc._id.toString());
    }

    if (missingDocs.length > 0 || expiredDocs.length > 0) {
      results.push({
        _id: program._id,
        name: program.name,
        acronym: program.acronym,
        responsible: program.responsible,
        missingDocs,
        expiredDocs
      });
    }
  }

  response(res, 200, results);
};

/* =========================================================
   Documentación faltante/caducada por DISPOSITIVE
   (antes “device” embebido)
========================================================= */
const auditMissingFieldsDocumentationDevice = async (req, res) => {
  const { docIds } = req.body;
  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  // Programas activos que exigen alguno de esos docs para dispositivo
  const programs = await Program.find({
    essentialDocumentationDevice: { $in: docs },
    active: true
  }).select('_id name acronym essentialDocumentationDevice');

  if (!programs.length) return response(res, 200, []);

  const programIds = programs.map(p => p._id);
  const programsById = new Map(programs.map(p => [String(p._id), p]));

  // Dispositivos activos de esos programas + archivos
  const dispositives = await Dispositive.find({
    program: { $in: programIds },
    active: true
  })
    .populate('files') // asumiendo Dispositive.files -> Filedrive[]
    .lean();

  // Documentos con duración
  const documentationWithTime = await Documentation.find({
    _id: { $in: docs },
    duration: { $exists: true }
  }).lean();

  const results = [];

  for (const d of dispositives) {
    const program = programsById.get(String(d.program));
    if (!program) continue;

    // Documentos comunes aplicables a dispositivos de ese programa
    const comunes = (program.essentialDocumentationDevice || [])
      .map(id => id.toString())
      .filter(id => docIds.includes(id));

    const files = Array.isArray(d.files) ? d.files : [];

    // Faltantes
    const missingDocs = comunes.filter(docId =>
      !files.some(file => file.originDocumentation?.toString() === docId)
    );

    // Caducados
    const expiredDocs = [];
    for (const doc of documentationWithTime) {
      if (!comunes.includes(doc._id.toString())) continue;

      const relevantFiles = files.filter(
        f => f.originDocumentation?.toString() === doc._id.toString()
      );

      const latestFile = relevantFiles.reduce(
        (latest, f) =>
          !latest || new Date(f.createdAt) > new Date(latest.createdAt) ? f : latest,
        null
      );
      if (!latestFile) continue;

      const expirationDate = new Date(latestFile.createdAt);
      expirationDate.setDate(expirationDate.getDate() + doc.duration);
      if (expirationDate < new Date()) expiredDocs.push(doc._id.toString());
    }

    if (missingDocs.length || expiredDocs.length) {
      results.push({
        _id: d._id,
        name: d.name,
        responsible: d.responsible,
        coordinators: d.coordinators,
        programId: program._id,
        programName: program.name,
        missingDocs,
        expiredDocs
      });
    }
  }

  response(res, 200, results);
};

/* =========================================================
   Leaves (ajuste: periodo usa dispositiveId/dispositiveID)
========================================================= */
const auditMissingFieldsLeaveOnly = async (req, res) => {
  const { leaveFields = [], apafa = false } = req.body;
  if (!Array.isArray(leaveFields) || !leaveFields.length) {
    throw new ClientError('leaveFields vacío', 400);
  }

  // Campo sintético: “sin fecha de fin real” pero NO de tipo indefinida
  const SPECIAL_END_FIELD = 'actualEndLeaveDateSin';

  // Ajusta este id si cambia el tipo de baja “indefinida”
  const INDEF_LEAVE_ID = new mongoose.Types.ObjectId('673dba22eb7280f56e22b504');

  const booleanF = new Set(['active']);
  const arrayF   = new Set([]);

  const normalFields = leaveFields.filter(f => f !== SPECIAL_END_FIELD);

  const orMissing = normalFields.flatMap(f => [
    { [f]: { $exists: false } },
    { [f]: null }
  ]);

  const baseMatch = {
    active: true,
    $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }]
  };
  if (leaveFields.includes(SPECIAL_END_FIELD)) {
    baseMatch.leaveType = { $ne: INDEF_LEAVE_ID };
  }
  if (orMissing.length) {
    baseMatch.$or = (baseMatch.$or || []).concat(orMissing);
  }

  const leaves = await Leaves.find(baseMatch, {
    _id: 1,
    idUser: 1,
    idPeriod: 1,
    leaveType: 1,
    startLeaveDate: 1,
    expectedEndLeaveDate: 1,
    actualEndLeaveDate: 1,
    active: 1
  }).lean();

  if (!leaves.length) return response(res, 200, []);

  const userIds = [...new Set(leaves.map(l => l?.idUser).filter(Boolean).map(id => id.toString()))];
  const users = await User.find(
    { _id: { $in: userIds }, employmentStatus: 'activo', apafa: !!apafa },
    { firstName: 1, lastName: 1, dni: 1, email: 1, phone: 1, employmentStatus: 1 }
  ).lean();
  const validUserIdSet = new Set(users.map(u => u._id.toString()));
  const byUser = new Map(users.map(u => [u._id.toString(), { ...u, hiringPeriods: [], dispositiveNow: [] }]));

  // OJO: ahora traemos dispositiveId/dispositiveID (y mantenemos 'device' en la salida por compatibilidad)
  const periodIds = [...new Set(leaves.map(l => l?.idPeriod).filter(Boolean).map(id => id.toString()))];
  const periods = await Periods.find(
    { _id: { $in: periodIds } },
    { startDate: 1, endDate: 1, position: 1, category: 1, workShift: 1, dispositiveId: 1, dispositiveID: 1 }
  ).lean();
  const periodMap = new Map(periods.map(p => [p._id.toString(), p]));

  for (const lv of leaves) {
    const uid = lv?.idUser?.toString();
    if (!uid || !validUserIdSet.has(uid)) continue;

    const p = periodMap.get(lv?.idPeriod?.toString());
    if (!p) continue;

    const userObj = byUser.get(uid);
    let periodEntry = userObj.hiringPeriods.find(hp => hp._id.toString() === p._id.toString());
    if (!periodEntry) {
      const deviceId = p.dispositiveId || p.dispositiveID || null;
      periodEntry = {
        _id: p._id,
        startDate: p.startDate,
        endDate: p.endDate ?? null,
        position: p.position,
        category: p.category,
        workShift: p.workShift,
        device: deviceId,           // ← mantenemos la clave 'device' (contiene el ID del Dispositive)
        dispositiveId: deviceId     // ← añadimos también el alias explícito
      };
      userObj.hiringPeriods.push(periodEntry);
    }

    const missing = [];
    for (const f of normalFields) {
      const v = lv[f];
      if (v === undefined || v === null) { missing.push(f); continue; }
      if (arrayF.has(f) && Array.isArray(v) && v.length === 0) missing.push(f);
    }
    if (
      leaveFields.includes(SPECIAL_END_FIELD) &&
      (lv.actualEndLeaveDate === undefined || lv.actualEndLeaveDate === null) &&
      lv.leaveType?.toString() !== INDEF_LEAVE_ID.toString()
    ) {
      missing.push(SPECIAL_END_FIELD);
    }

    periodEntry.leavePeriods = periodEntry.leavePeriods || [];
    periodEntry.leavePeriods.push({
      _id: lv._id,
      leaveType: lv.leaveType,
      startLeaveDate: lv.startLeaveDate,
      expectedEndLeaveDate: lv.expectedEndLeaveDate ?? null,
      actualEndLeaveDate: lv.actualEndLeaveDate ?? null,
      active: lv.active,
      missingLeaveFields: missing
    });
  }

  const result = [];
  for (const u of byUser.values()) {
    u.hiringPeriods = u.hiringPeriods.filter(p => Array.isArray(p.leavePeriods) && p.leavePeriods.length > 0);
    if (!u.hiringPeriods.length) continue;

    u.hiringPeriods.forEach(p => p.leavePeriods.sort((a, b) =>
      new Date(b.startLeaveDate || 0) - new Date(a.startLeaveDate || 0)
    ));
    u.hiringPeriods.sort((a, b) => {
      const aDate = a.leavePeriods[0]?.startLeaveDate || a.startDate;
      const bDate = b.leavePeriods[0]?.startLeaveDate || b.startDate;
      return new Date(bDate || 0) - new Date(aDate || 0);
    });

    const latest = u.hiringPeriods[0];
    if (latest?.device) {
      // Por compatibilidad con el front actual:
      u.dispositiveNow = [{ device: latest.device }];
    } else {
      u.dispositiveNow = [];
    }

    result.push(u);
  }

  response(res, 200, result);
};

module.exports = {
  auditMissingFieldsInfoUser: catchAsync(auditMissingFieldsInfoUser),
  auditMissingFieldsProgram: catchAsync(auditMissingFieldsProgram),
  auditMissingFieldsDevice: catchAsync(auditMissingFieldsDevice), // ahora usa Dispositive
  auditMissingFieldsDocumentationUser: catchAsync(auditMissingFieldsDocumentationUser),
  auditMissingFieldsDocumentationProgram: catchAsync(auditMissingFieldsDocumentationProgram),
  auditMissingFieldsDocumentationDevice: catchAsync(auditMissingFieldsDocumentationDevice), // ahora usa Dispositive
  auditMissingFieldsContractAndLeave: catchAsync(auditMissingFieldsLeaveOnly)
};
