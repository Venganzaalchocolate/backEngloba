// controllers/hiringController.js (CommonJS)
const mongoose = require('mongoose');
const { User, Periods, Leaves, Preferents, Dispositive, Jobs, PeriodEndReason } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { moveUserBetweenDevicesWS, syncWorkspaceOrgUnitForUser } = require('./workspaceController');

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
const PERIOD_END_REASON_TRANSFER_ID = '6a2fd354f8de01705621fe93';
const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
const isOpen = (p) => p.active !== false && (p.endDate === null || p.endDate === undefined);

async function validateEndReason(endReason) {
  if (!endReason || !mongoose.Types.ObjectId.isValid(endReason)) {
    throw new ClientError('Debes indicar una razón válida para cerrar el periodo', 400);
  }

  const exists = await PeriodEndReason.exists({ _id: toId(endReason), active: { $ne: false } });
  if (!exists) throw new ClientError('La razón de fin del periodo no existe o no está activa', 400);

  return true;
}

// === Provincias desde Dispositive ===
async function getProvinceIdsFromDispositive(dispositiveId) {
  if (!dispositiveId) return [];
  const d = await Dispositive.findById(toId(dispositiveId), { province: 1 }).lean();
  if (!d?.province) return [];
  return [toId(d.province)];
}

async function safeSyncWorkspaceOrgUnitForHiringUser(userId) {
  if (!userId) return;

  try {
    await syncWorkspaceOrgUnitForUser(userId);
  } catch (err) {
    console.warn(
      `⚠️ Error sincronizando OU Workspace para user ${userId}:`,
      err.message
    );
  }
}

// === Cerrar Preferents coincidentes (post) ===
async function closeMatchingPreferentsForPeriod(periodLike, session = null) {
  const userId = periodLike?.idUser ? toId(periodLike.idUser) : null;
  const jobId = periodLike?.position ? toId(periodLike.position) : null;
  const dispId = periodLike?.dispositiveId ? toId(periodLike.dispositiveId) : null;

  if (!userId || !jobId || !dispId) return;

  const provinceIds = await getProvinceIdsFromDispositive(dispId);
  if (!provinceIds.length) return;

  const query = {
    user: userId,
    active: true,
    jobs: jobId,
    provinces: { $in: provinceIds },
  };

  const update = { $set: { active: false, moveDone: true } };
  const options = session ? { session } : {};

  await Preferents.updateMany(query, update, options);
}

// === Libera espacio cerrando periodos de Preferents antes de validar ===
async function ensureSpaceWithPreferents(periodLike, { excludePeriodId = null } = {}) {
  const userId = toId(periodLike?.idUser);
  const jobId = toId(periodLike?.position);
  const dispId = toId(periodLike?.dispositiveId);

  if (!userId || !jobId || !dispId) return { closedCount: 0 };

  const provinceIds = await getProvinceIdsFromDispositive(dispId);
  if (!provinceIds.length) return { closedCount: 0 };

  const preferents = await Preferents.find({
    user: userId,
    active: true,
    jobs: jobId,
    provinces: { $in: provinceIds }
  }, { hiringsId: 1 }).lean();

  if (!preferents.length) return { closedCount: 0 };

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

  const endDateSafe = periodLike?.startDate instanceof Date
    ? periodLike.startDate
    : new Date();

  const defaultEndReason = await PeriodEndReason.findOne({
    active: { $ne: false },
    $or: [
      { name: /^cambio de dispositivo$/i },
      { name: /^traslado$/i },
      { name: /^otros$/i }
    ]
  }, { _id: 1 }).lean();

  const setData = { endDate: endDateSafe };
  if (defaultEndReason?._id) setData.endReason = defaultEndReason._id;

  const res = await Periods.updateMany(
    { _id: { $in: openTargets.map(p => p._id) } },
    { $set: setData }
  );

  return { closedCount: res.modifiedCount || 0 };
}

// Reglas de aperturas simultáneas
async function validateOpenConstraints(idUser, candidate, excludeId = null) {
  const userId = new mongoose.Types.ObjectId(idUser);

  const openNow = await Periods.find({
    idUser: userId,
    active: { $ne: false },
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  }).lean();

  const openList = openNow.filter(p => String(p._id) !== String(excludeId || ''));

  const willBeOpen =
    candidate.active !== false &&
    (candidate.endDate === null || candidate.endDate === undefined);

  if (willBeOpen) openList.push(candidate);

  const fullOpens = openList.filter(p => p?.workShift?.type === 'completa').length;
  const partOpens = openList.filter(p => p?.workShift?.type === 'parcial').length;

  if (fullOpens > 1) {
    throw new ClientError(
      'Máximo 1 periodo abierto a jornada completa por usuario',
      400
    );
  }

  if (fullOpens === 1 && partOpens > 0) {
    throw new ClientError(
      'No se puede mezclar un periodo abierto a jornada completa con periodos abiertos a jornada parcial',
      400
    );
  }

  if (partOpens > 2) {
    throw new ClientError(
      'Máximo 2 periodos abiertos de jornada parcial por usuario',
      400
    );
  }

  return true;
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

// Construye payload base del Period
async function buildPeriodPayload(body) {
  const {
    idUser,
    position,
    startDate,
    endDate,
    endReason,
    dispositiveId,
    workShift,
    selectionProcess,
    active,
    replacement,
    reason,
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

  if (end) await validateEndReason(endReason);
  if (!end && endReason) throw new ClientError('No puedes indicar una razón de fin si el periodo no tiene fecha de fin', 400);

  return {
    idUser: toId(idUser),
    position: toId(position),
    startDate: start,
    endDate: end ?? undefined,
    endReason: endReason ? toId(endReason) : undefined,
    dispositiveId: toId(dispositiveId),
    workShift: { type: workShift.type, nota: workShift.nota ?? undefined },
    selectionProcess: selectionProcess ? toId(selectionProcess) : undefined,
    active: active === false ? false : true,
    replacement: replacement ?? reason ?? undefined,
  };
}

// Población y serialización de replacement para salida
const periodPopulate = [
  { path: 'endReason', select: 'name description' },
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
  const doc = await Periods.findById(id).populate(periodPopulate);
  return serializePeriod(doc);
}

/* ---------------------------------------------------------
   CRUD
--------------------------------------------------------- */

// CREATE
async function createHiring(req, res) {
  const payloadBase = await buildPeriodPayload(req.body);

  const resolvedRepl = await buildReplacementFromInput({ replacement: payloadBase.replacement });
  if (resolvedRepl) payloadBase.replacement = resolvedRepl;
  else delete payloadBase.replacement;

  await ensureSpaceWithPreferents(payloadBase);
  await validateOpenConstraints(payloadBase.idUser, payloadBase);

  const created = await Periods.create(payloadBase);

  await closeMatchingPreferentsForPeriod(created);
  await safeSyncWorkspaceOrgUnitForHiringUser(created.idUser);

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

  if (req.body.position !== undefined) patch.position = req.body.position ? toId(req.body.position) : undefined;
  if (req.body.startDate !== undefined) patch.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
  if (req.body.endDate !== undefined) patch.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  if (req.body.endReason !== undefined) patch.endReason = req.body.endReason ? toId(req.body.endReason) : null;
  if (req.body.dispositiveId !== undefined) patch.dispositiveId = req.body.dispositiveId ? toId(req.body.dispositiveId) : undefined;
  if (req.body.selectionProcess !== undefined) patch.selectionProcess = req.body.selectionProcess ? toId(req.body.selectionProcess) : undefined;
  if (req.body.active !== undefined) patch.active = req.body.active;

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

  if (merged.startDate && Number.isNaN(new Date(merged.startDate).getTime())) {
    throw new ClientError('startDate no válida', 400);
  }

  if (merged.endDate && Number.isNaN(new Date(merged.endDate).getTime())) {
    throw new ClientError('endDate no válida', 400);
  }

  if (merged.startDate && merged.endDate && new Date(merged.startDate) > new Date(merged.endDate)) {
    throw new ClientError('startDate no puede ser posterior a endDate', 400);
  }

  if (merged.endDate) await validateEndReason(merged.endReason);

  if (!merged.endDate && merged.endReason) {
    throw new ClientError('No puedes indicar una razón de fin si el periodo no tiene fecha de fin', 400);
  }

  const isClosingUpdate = (req.body.endDate !== undefined && req.body.endDate) || req.body.active === false;

  if (!isClosingUpdate) {
    await ensureSpaceWithPreferents(merged, { excludePeriodId: current._id });
  }

  await validateOpenConstraints(current.idUser, merged, current._id);

  await Periods.findByIdAndUpdate(
    hiringId,
    { $set: patch },
    { new: false, runValidators: true }
  );

  if (!isClosingUpdate) {
    await closeMatchingPreferentsForPeriod(merged);
  }

  await safeSyncWorkspaceOrgUnitForHiringUser(current.idUser);

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
  ).populate(periodPopulate);

  if (!updated) throw new ClientError('Periodo no encontrado', 404);

  await safeSyncWorkspaceOrgUnitForHiringUser(updated.idUser);

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
  await safeSyncWorkspaceOrgUnitForHiringUser(doc.idUser);

  response(res, 200, { deleted: true });
}

// LIST
async function listHirings(req, res) {
  let {
    idUser,
    dispositiveId,
    position,
    endReason,
    openOnly,
    active,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    userId,
    selectionProcess,
  } = req.body;

  if (!idUser && userId) idUser = userId;

  const filters = {};

  if (idUser) filters.idUser = toId(idUser);
  if (position) filters.position = toId(position);
  if (endReason) filters.endReason = toId(endReason);
  if (active !== undefined) filters.active = active;

  if (dispositiveId !== undefined && dispositiveId !== null && dispositiveId !== '') {
    filters.dispositiveId = toId(dispositiveId);
  }

  if (openOnly) {
    filters.$or = [{ endDate: { $exists: false } }, { endDate: null }];
  }

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
    if (dateTo) filters.startDate.$lte = new Date(dateTo);
  }

  const total = await Periods.countDocuments(filters);

  const docs = await Periods.find(filters)
    .sort({ startDate: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate(periodPopulate);

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

  const doc = await Periods.findById(hiringId).populate(periodPopulate);
  if (!doc) throw new ClientError('Periodo no encontrado', 404);

  response(res, 200, serializePeriod(doc));
}

// Helper reutilizable
async function findLastHiringForUser(idUser, { includeInactive = false } = {}) {
  const userId = toId(idUser);

  if (includeInactive === false) {
    const docs = await Periods.find({
      idUser: userId,
      active: { $ne: false },
      $or: [{ endDate: { $exists: false } }, { endDate: null }],
    })
      .sort({ startDate: -1, _id: -1 })
      .populate(periodPopulate);

    return docs.map(serializePeriod);
  }

  const doc = await Periods.findOne({ idUser: userId })
    .sort({ startDate: -1, _id: -1 })
    .populate(periodPopulate);

  return doc ? serializePeriod(doc) : null;
}

// Endpoint: GET LAST BY USER
async function getLastHiringForUser(req, res) {
  const { idUser } = req.body;

  const includeInactive =
    req.body.includeInactive === false ||
    String(req.body.includeInactive).toLowerCase() === "false"
      ? false
      : true;

  if (!idUser || !mongoose.Types.ObjectId.isValid(idUser)) {
    throw new ClientError("idUser inválido", 400);
  }

  const result = await findLastHiringForUser(idUser, { includeInactive });

  if (includeInactive === false) {
    return response(res, 200, result || []);
  }

  if (!result) {
    throw new ClientError("El usuario no tiene periodos", 404);
  }

  response(res, 200, result);
}

// CLOSE
async function closeHiring(req, res) {
  const { hiringId, endDate, endReason, active } = req.body;

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

  await validateEndReason(endReason);

  await Periods.findByIdAndUpdate(
    hiringId,
    {
      $set: {
        endDate: end,
        endReason: toId(endReason),
        active: active === false ? false : current.active
      }
    },
    { new: false }
  );

  await safeSyncWorkspaceOrgUnitForHiringUser(current.idUser);

  const out = await loadAndSerializeById(hiringId);
  return response(res, 200, out);
}

// REUBICAR PERSONAL (mass transfer)
async function relocateHirings(req, res) {
  const { originDispositiveId, targetDispositiveId, startDateNewPeriod } = req.body;

  if (!originDispositiveId || !targetDispositiveId) {
    throw new ClientError('originDispositiveId y targetDispositiveId son requeridos', 400);
  }

  const originId = toId(originDispositiveId);
  const targetId = toId(targetDispositiveId);

  if (String(originId) === String(targetId)) {
    throw new ClientError('originDispositiveId y targetDispositiveId no pueden ser iguales', 400);
  }

  const startNew = startDateNewPeriod
    ? new Date(startDateNewPeriod)
    : new Date();

  if (Number.isNaN(startNew.getTime())) {
    throw new ClientError('startDateNewPeriod no válida', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(PERIOD_END_REASON_TRANSFER_ID)) {
    throw new ClientError('PERIOD_END_REASON_TRANSFER_ID inválido', 500);
  }

  const endReasonId = toId(PERIOD_END_REASON_TRANSFER_ID);

  const openPeriods = await Periods.find({
    dispositiveId: originId,
    active: { $ne: false },
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  }).lean();

  if (!openPeriods.length) {
    return response(res, 200, {
      moved: 0,
      created: [],
      msg: 'No había periodos abiertos en el dispositivo origen.',
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const createdList = [];
    const affectedUsers = new Set();

    for (const p of openPeriods) {
      const periodId = p._id;

      await Periods.findByIdAndUpdate(
        periodId,
        { $set: { endDate: startNew, endReason: endReasonId } },
        { new: false, session }
      );

      const newPayload = {
        idUser: p.idUser,
        position: p.position,
        startDate: startNew,
        endDate: null,
        dispositiveId: targetId,
        workShift: p.workShift,
        selectionProcess: p.selectionProcess ?? undefined,
        active: true,
        replacement: p.replacement
          ? {
            user: p.replacement.user ?? undefined,
            leave: p.replacement.leave ?? undefined,
          }
          : undefined,
      };

      const createdArr = await Periods.create([newPayload], { session });
      const created = Array.isArray(createdArr) ? createdArr[0] : createdArr;

      createdList.push(created._id);
      affectedUsers.add(String(p.idUser));

      await closeMatchingPreferentsForPeriod(newPayload, session);
    }

    await session.commitTransaction();

    void (async () => {
      try {
        const users = await User.find({
          _id: { $in: Array.from(affectedUsers).map(toId) },
        })
          .select('_id email')
          .lean();

        for (const u of users) {
          try {
            if (u.email) {
              await moveUserBetweenDevicesWS({
                email: u.email,
                originDispositiveId: originId,
                targetDispositiveId: targetId,
              });
            }

            await syncWorkspaceOrgUnitForUser(u._id);
          } catch (err) {
            console.warn(
              `⚠️ Error sincronizando Workspace para ${u.email || u._id}:`,
              err.message
            );
          }
        }
      } catch (err) {
        console.error(
          '⚠️ Error inesperado en sincronización masiva de Workspace:',
          err.message
        );
      }
    })();

    return response(res, 200, {
      moved: openPeriods.length,
      created: createdList,
      msg: 'Reubicación completada',
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}




module.exports = {
  createHiring: catchAsync(createHiring),
  updateHiring: catchAsync(updateHiring),
  closeHiring: catchAsync(closeHiring),
  softDeleteHiring: catchAsync(softDeleteHiring),
  hardDeleteHiring: catchAsync(hardDeleteHiring),
  listHirings: catchAsync(listHirings),
  getHiringById: catchAsync(getHiringById),
  getLastHiringForUser: catchAsync(getLastHiringForUser),
  relocateHirings: catchAsync(relocateHirings)
};