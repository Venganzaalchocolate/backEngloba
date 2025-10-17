// controllers/hiringController.js (CommonJS)
const mongoose = require('mongoose');
const { User, Periods, Leaves, Preferents, Dispositive } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { actualizacionHiringyLeave, backfillSelectionProcessFromOffers, repairExistingPeriods, fullFreshMigration, migrateOffersNewdispositiveId, migrateUserCvNameFieldsToRefs, backfillPeriodsFromEmbedded, getAllManagerEmails } = require('./periodoTransicionController');
// Opcional si lo usas en un script aparte:
// const { backfillSelectionProcessFromOffers, backfillPeriodsdispositiveId } = require('./periodoTransicionController');

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
const isOpen = (p) => p.active !== false && (p.endDate === null || p.endDate === undefined);

// === Provincias desde Dispositive ===
async function getProvinceIdsFromDispositive(dispositiveId) {
  if (!dispositiveId) return [];
  const d = await Dispositive.findById(toId(dispositiveId), { province: 1 }).lean();
  if (!d?.province) return [];
  return [toId(d.province)];
}

// === Cerrar Preferents coincidentes (post) ===
async function closeMatchingPreferentsForPeriod(periodLike) {
  const userId = periodLike?.idUser ? toId(periodLike.idUser) : null;
  const jobId = periodLike?.position ? toId(periodLike.position) : null;
  // ⚠️ ahora usamos dispositiveId
  const dispId = periodLike?.dispositiveId ? toId(periodLike.dispositiveId) : null;

  if (!userId || !jobId || !dispId) return;

  const provinceIds = await getProvinceIdsFromDispositive(dispId);
  if (!provinceIds.length) return;

  await Preferents.updateMany(
    {
      user: userId,
      active: true,
      jobs: jobId,
      provinces: { $in: provinceIds }
    },
    { $set: { active: false, moveDone: true } }
  );
}

// === Libera espacio cerrando periodos de Preferents antes de validar ===
async function ensureSpaceWithPreferents(periodLike, { excludePeriodId = null } = {}) {
  const userId = toId(periodLike?.idUser);
  const jobId = toId(periodLike?.position);
  // ⚠️ ahora usamos dispositiveId
  const dispId = toId(periodLike?.dispositiveId);

  if (!userId || !jobId || !dispId) return { closedCount: 0 };

  const provinceIds = await getProvinceIdsFromDispositive(dispId);
  if (!provinceIds.length) return { closedCount: 0 };

  // Preferents activos que coincidan
  const preferents = await Preferents.find({
    user: userId,
    active: true,
    jobs: jobId,
    provinces: { $in: provinceIds }
  }, { hiringsId: 1 }).lean();

  if (!preferents.length) return { closedCount: 0 };

  // Reunir hiringsId y filtrar abiertos
  const ids = [...new Set(preferents.flatMap(p => Array.isArray(p.hiringsId) ? p.hiringsId : []).map(toId))]
    .filter(Boolean);

  if (!ids.length) return { closedCount: 0 };

  const openTargets = await Periods.find({
    _id: { $in: ids },
    ...(excludePeriodId ? { _id: { $ne: toId(excludePeriodId) } } : {}),
    active: { $ne: false },
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  }, { _id: 1 }).lean();

  if (!openTargets.length) return { closedCount: 0 };

  // Cierra esos periodos con endDate = startDate propuesto (o hoy si no hubiera)
  const endDateSafe = periodLike?.startDate instanceof Date
    ? periodLike.startDate
    : new Date();

  const res = await Periods.updateMany(
    { _id: { $in: openTargets.map(p => p._id) } },
    { $set: { endDate: endDateSafe } }
  );

  // Nota: el Preferent en sí se marcará como moveDone/active:false después de crear/editar
  return { closedCount: res.modifiedCount || 0 };
}

// Reglas de aperturas simultáneas
async function validateOpenConstraints(idUser, candidate, excludeId = null) {
  const openNow = await Periods.find({
    idUser: toId(idUser),
    active: { $ne: false },
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  }).lean();

  const list = openNow.filter(p => String(p._id) !== String(excludeId || ''));
  if (isOpen(candidate)) list.push(candidate);

  const ftCount = list.filter(p => p?.workShift?.type === 'completa').length;
  const ptCount = list.filter(p => p?.workShift?.type === 'parcial').length;

  if (ftCount > 1) throw new ClientError('Máximo 1 periodo abierto a jornada completa', 400);
  if (ftCount === 1 && ptCount > 0) throw new ClientError('No se puede mezclar jornada completa con parciales abiertos', 400);
  if (ptCount > 2) throw new ClientError('Máximo 2 periodos abiertos a jornada parcial', 400);
}

/**
 * Dado un objeto "replacement" (o legacy "reason"), resuelve:
 *  - replacement.user a partir de dni (si llega dni)
 *  - replacement.leave: si no llega, intenta localizar la última baja abierta del usuario
 * Devuelve { user: ObjectId, leave: ObjectId|null } o undefined si no hay datos.
 */
async function buildReplacementFromInput(input) {
  const repl = input?.replacement || input?.reason || input;
  if (!repl) return undefined;

  let userId = repl.user ? toId(repl.user) : null;
  if (!userId && repl.dni) {
    const dni = String(repl.dni).replace(/\s+/g, '').toUpperCase();
    const user = await User.findOne({ dni: { $regex: `^${dni}$`, $options: 'i' } }, { _id: 1 }).lean();
    if (!user) throw new ClientError('El trabajador al que sustituye no existe', 400);
    userId = user._id;
  }
  if (!userId) return undefined;

  let leaveId = repl.leave ? toId(repl.leave) : null;
  if (!leaveId) {
    const openPeriods = await Periods.find(
      { idUser: userId, active: { $ne: false }, $or: [{ endDate: { $exists: false } }, { endDate: null }] },
      { _id: 1 }
    ).lean();
    const openIds = openPeriods.map(p => p._id);

    let activeLeave = null;
    if (openIds.length) {
      activeLeave = await Leaves.findOne({
        idUser: userId,
        idPeriod: { $in: openIds },
        active: { $ne: false },
        $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
      }).sort({ startLeaveDate: -1 }).lean();
    }
    if (!activeLeave) {
      activeLeave = await Leaves.findOne({
        idUser: userId,
        active: { $ne: false },
        $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
      }).sort({ startLeaveDate: -1 }).lean();
    }
    if (activeLeave) leaveId = activeLeave._id;
  }

  return { user: userId, leave: leaveId || null };
}

// Construye payload base del Period (⚠️ ahora requiere dispositiveId)
function buildPeriodPayload(body) {
  const {
    idUser,              // canónico
    position,
    startDate,
    endDate,
    // device,           // legacy ignorado aquí
    dispositiveId,       // ← NUEVO nombre en body
    workShift,           // { type: 'completa'|'parcial', nota? }
    selectionProcess,    // opcional
    active,              // default true
    replacement,         // NUEVO
    reason,              // legacy compat: mapeado internamente a replacement
  } = body;

  if (!idUser) throw new ClientError('idUser es requerido', 400);
  if (!position) throw new ClientError('position es requerido', 400);
  if (!dispositiveId) throw new ClientError('dispositiveId es requerido', 400);
  if (!workShift?.type || !['completa', 'parcial'].includes(workShift.type)) {
    throw new ClientError('workShift.type es requerido y debe ser "completa" o "parcial"', 400);
  }
  if (!startDate) throw new ClientError('startDate es requerido', 400);

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (Number.isNaN(start.getTime())) throw new ClientError('startDate no válida', 400);
  if (end && Number.isNaN(end.getTime())) throw new ClientError('endDate no válida', 400);
  if (end && start > end) throw new ClientError('startDate no puede ser posterior a endDate', 400);

  return {
    idUser: toId(idUser),
    position: toId(position),
    startDate: start,
    endDate: end ?? undefined,
    dispositiveId: toId(dispositiveId),                 // ← guardamos aquí
    workShift: { type: workShift.type, nota: workShift.nota ?? undefined },
    selectionProcess: selectionProcess ? toId(selectionProcess) : undefined,
    active: active === false ? false : true,
    // replacement se resuelve aparte (buildReplacementFromInput)
    replacement: replacement ?? reason ?? undefined,
  };
}

// Población y serialización de replacement para salida
const replacementPopulate = [
  { path: 'replacement.user', select: 'firstName lastName dni' },
  {
    path: 'replacement.leave',
    select: 'leaveType startLeaveDate expectedEndLeaveDate actualEndLeaveDate',
    populate: { path: 'leaveType', select: 'name' }
  }
];

function serializePeriod(doc) {
  const p = doc.toObject ? doc.toObject() : doc;
  if (p.replacement && (p.replacement.user || p.replacement.leave)) {
    const u = p.replacement.user || {};
    const l = p.replacement.leave || null;

    const personName = (u.firstName || u.lastName)
      ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
      : undefined;
    const personDni = u.dni ? String(u.dni).replace(/\s+/g, '') : undefined;

    let leave = undefined;
    if (l) {
      leave = {
        typeName: (l.leaveType && l.leaveType.name) ? l.leaveType.name : undefined,
        startLeaveDate: l.startLeaveDate || undefined,
        expectedEndLeaveDate: l.expectedEndLeaveDate || undefined,
        finished: !!l.actualEndLeaveDate,
      };
    }

    p.replacement = {
      personName,
      personDni,
      ...(leave ? { leave } : {}),
    };
  } else {
    delete p.replacement;
  }
  return p;
}

async function loadAndSerializeById(id) {
  const doc = await Periods.findById(id).populate(replacementPopulate);
  return serializePeriod(doc);
}

/* ---------------------------------------------------------
   CRUD
--------------------------------------------------------- */

// CREATE
async function createHiring(req, res) {
  const payloadBase = buildPeriodPayload(req.body);

  // resolver replacement si llega
  const resolvedRepl = await buildReplacementFromInput({ replacement: payloadBase.replacement });
  if (resolvedRepl) payloadBase.replacement = resolvedRepl;
  else delete payloadBase.replacement;

  // 1) libera espacio cerrando periodos vinculados a Preferent coincidente
  await ensureSpaceWithPreferents(payloadBase);

  // 2) valida reglas de solape
  await validateOpenConstraints(payloadBase.idUser, payloadBase);

  // 3) crea
  const created = await Periods.create(payloadBase);

  // 4) cierra Preferents coincidentes
  await closeMatchingPreferentsForPeriod(created);

  const out = await loadAndSerializeById(created._id);
  response(res, 201, out);
}

// UPDATE
async function updateHiring(req, res) {
  const { hiringId } = req.body;
  if (!hiringId || !mongoose.Types.ObjectId.isValid(hiringId)) {
    throw new ClientError('hiringId inválido', 400);
  }

  const current = await Periods.findById(hiringId);
  if (!current) throw new ClientError('Periodo no encontrado', 404);

  const patch = {};
  if (req.body.position !== undefined)          patch.position = req.body.position ? toId(req.body.position) : undefined;
  if (req.body.startDate !== undefined)         patch.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
  if (req.body.endDate !== undefined)           patch.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
  // ⚠️ nuevo campo
  if (req.body.dispositiveId !== undefined)     patch.dispositiveId = req.body.dispositiveId ? toId(req.body.dispositiveId) : undefined;
  if (req.body.selectionProcess !== undefined)  patch.selectionProcess = req.body.selectionProcess ? toId(req.body.selectionProcess) : undefined;
  if (req.body.active !== undefined)            patch.active = req.body.active;

  if (req.body.replacement !== undefined || req.body.reason !== undefined) {
    const resolved = await buildReplacementFromInput(req.body);
    patch.replacement = resolved ? resolved : undefined;
  }

  if (req.body.workShift) {
    const t = req.body.workShift?.type;
    if (!t || !['completa', 'parcial'].includes(t)) {
      throw new ClientError('workShift.type debe ser "completa" o "parcial"', 400);
    }
    patch.workShift = { type: t, nota: req.body.workShift?.nota ?? undefined };
  }

  const merged = { ...current.toObject(), ...patch };

  if (merged.startDate && merged.endDate && merged.startDate > merged.endDate) {
    throw new ClientError('startDate no puede ser posterior a endDate', 400);
  }

  // si el update NO cierra el periodo, intenta liberar espacio
  const isClosingUpdate = (req.body.endDate !== undefined) || (req.body.active === false);
  if (!isClosingUpdate) {
    await ensureSpaceWithPreferents(merged, { excludePeriodId: current._id });
  }

  // Valida con el espacio liberado
  await validateOpenConstraints(current.idUser, merged, current._id);

  await Periods.findByIdAndUpdate(
    hiringId,
    { $set: patch },
    { new: false, runValidators: true }
  );

  // Si sigue abierto, cierra Preferents coincidentes
  if (!isClosingUpdate) {
    await closeMatchingPreferentsForPeriod(merged);
  }

  const out = await loadAndSerializeById(hiringId);
  response(res, 200, out);
}

// SOFT DELETE
async function softDeleteHiring(req, res) {
  const { hiringId } = req.body;
  if (!hiringId || !mongoose.Types.ObjectId.isValid(hiringId)) {
    throw new ClientError('hiringId inválido', 400);
  }

  const updated = await Periods.findByIdAndUpdate(
    hiringId,
    { $set: { active: false } },
    { new: true }
  ).populate(replacementPopulate);

  if (!updated) throw new ClientError('Periodo no encontrado', 404);
  response(res, 200, serializePeriod(updated));
}

// HARD DELETE
async function hardDeleteHiring(req, res) {
  const { hiringId } = req.body;
  if (!hiringId || !mongoose.Types.ObjectId.isValid(hiringId)) {
    throw new ClientError('hiringId inválido', 400);
  }

  const doc = await Periods.findById(hiringId).lean();
  if (!doc) throw new ClientError('Periodo no encontrado', 404);

  await Leaves.deleteMany({ idPeriod: doc._id });
  await Periods.deleteOne({ _id: doc._id });

  response(res, 200, { deleted: true });
}

// LIST
async function listHirings(req, res) {
  let {
    idUser,       // canónico
    dispositiveId,         // ← NUEVO filtro
    position,
    openOnly,
    active,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    userId,               // legacy compat
    selectionProcess,     // ← NUEVO
  } = req.body;

  if (!idUser && userId) idUser = userId;

  const filters = {};

  if (idUser)    filters.idUser = toId(idUser);
  if (position)  filters.position = toId(position);
  if (active !== undefined) filters.active = active;

  if (dispositiveId) filters.dispositiveId = toId(dispositiveId);

  if (openOnly) {
    filters.$or = [{ endDate: { $exists: false } }, { endDate: null }];
  }

  // Filtro por selectionProcess
  if (selectionProcess !== undefined && selectionProcess !== null && selectionProcess !== '') {
    if (Array.isArray(selectionProcess)) {
      const arr = selectionProcess.filter(Boolean).map(v => toId(v));
      if (arr.length) filters.selectionProcess = { $in: arr };
    } else {
      filters.selectionProcess = toId(selectionProcess);
    }
  }

  if (dateFrom || dateTo) {
    filters.startDate = {};
    if (dateFrom) filters.startDate.$gte = new Date(dateFrom);
    if (dateTo)   filters.startDate.$lte = new Date(dateTo);
  }

  const total = await Periods.countDocuments(filters);

  const docs = await Periods.find(filters)
    .sort({ startDate: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate(replacementPopulate);

  const out = docs.map(serializePeriod);
  response(res, 200, {
    total,
    page: Number(page),
    limit: Number(limit),
    docs: out
  });
}

// GET ONE
async function getHiringById(req, res) {
  const { hiringId } = req.body;
  if (!hiringId || !mongoose.Types.ObjectId.isValid(hiringId)) {
    throw new ClientError('hiringId inválido', 400);
  }

  const doc = await Periods.findById(hiringId).populate(replacementPopulate);
  if (!doc) throw new ClientError('Periodo no encontrado', 404);

  response(res, 200, serializePeriod(doc));
}

// Helper reutilizable
async function findLastHiringForUser(idUser, { includeInactive = false } = {}) {
  const filter = { idUser: toId(idUser) };
  if (!includeInactive) filter.active = { $ne: false };

  const doc = await Periods.findOne(filter)
    .sort({ startDate: -1, _id: -1 })
    .populate(replacementPopulate);

  return doc ? serializePeriod(doc) : null;
}

// Endpoint: GET LAST BY USER
async function getLastHiringForUser(req, res) {
  const { idUser, includeInactive = true } = req.body;

  if (!idUser || !mongoose.Types.ObjectId.isValid(idUser)) {
    throw new ClientError('idUser inválido', 400);
  }

  const last = await findLastHiringForUser(idUser, { includeInactive });
  if (!last) throw new ClientError('El usuario no tiene periodos', 404);

  response(res, 200, last);
}

// CLOSE
async function closeHiring(req, res) {
  const { hiringId, endDate, active } = req.body;
  if (!hiringId || !mongoose.Types.ObjectId.isValid(hiringId)) {
    throw new ClientError('hiringId inválido', 400);
  }

  const current = await Periods.findById(hiringId);
  if (!current) throw new ClientError('Periodo no encontrado', 404);

  const end = endDate ? new Date(endDate) : new Date();
  if (Number.isNaN(end.getTime())) throw new ClientError('endDate no válida', 400);
  if (current.startDate > end) {
    throw new ClientError('endDate no puede ser anterior a startDate', 400);
  }

  await Periods.findByIdAndUpdate(
    hiringId,
    { $set: { endDate: end, active: active === false ? false : current.active } },
    { new: false }
  );

  const out = await loadAndSerializeById(hiringId);
  return response(res, 200, out);
}

const prueba=async()=>{
  // await backfillPeriodsFromEmbedded({ apply: true});
  //await migrateOffersNewdispositiveId({ apply:true })
  //await migrateUserCvNameFieldsToRefs({ apply: true });


}
//   await actualizacionHiringyLeave({
//   mode: 'sync',
// });
//  await backfillSelectionProcessFromOffers({ apply : true})

// await fullFreshMigration({
//   apply: true,           // ejecuta cambios (no dry-run)
//   idsField: 'devicesId', // si tu Program usa otro campo, cámbialo aquí
//   removeEmbedded: false, // deja Program.devices legacy intacto (recomendado para trazabilidad)
//   updateExisting: false, // no sobreescribe datos de Dispositive si ya existían
//   programLimit: 0,       // 0 = todos los programas
//   userLimit: 0,          // 0 = todos los usuarios con hiringPeriods
// });
 
prueba();
module.exports = {
  createHiring: catchAsync(createHiring),
  updateHiring: catchAsync(updateHiring),
  closeHiring: catchAsync(closeHiring),
  softDeleteHiring: catchAsync(softDeleteHiring),
  hardDeleteHiring: catchAsync(hardDeleteHiring),
  listHirings: catchAsync(listHirings),
  getHiringById: catchAsync(getHiringById),
  getLastHiringForUser: catchAsync(getLastHiringForUser)
};
