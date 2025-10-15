// controllers/leaveController.js (CommonJS)
const mongoose = require('mongoose');
const { Leaves, Periods } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);

// Reglas de creación:
// - Debe existir el Period y pertenecer al user.
// - No puede haber otra leave abierta en el mismo Period.
// - Si hay una leave cerrada, la nueva debe empezar > actualEndLeaveDate.
// - startLeaveDate dentro del rango del Period.
async function validateLeaveCreation({ idUser, idPeriod, startLeaveDate }) {
  const period = await Periods.findOne({ _id: toId(idPeriod), idUser: toId(idUser) }).lean();
  if (!period) throw new ClientError('Periodo no encontrado para el usuario', 404);

  if (startLeaveDate < period.startDate) {
    throw new ClientError('La Fecha de inicio no puede ser anterior al inicio del periodo', 400);
  }
  if (period.endDate && startLeaveDate > period.endDate) {
    throw new ClientError('La Fecha de inicio no puede ser posterior al fin del periodo', 400);
  }

  const open = await Leaves.findOne({
    idUser: toId(idUser),
    idPeriod: toId(idPeriod),
    active: { $ne: false },
    $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
  }).lean();
  if (open) throw new ClientError('Ya existe una baja/excedencia abierta para este periodo', 400);

  const last = await Leaves.findOne({ idUser: toId(idUser), idPeriod: toId(idPeriod) })
    .sort({ startLeaveDate: -1 })
    .lean();

  if (last?.actualEndLeaveDate) {
    if (startLeaveDate <= new Date(last.actualEndLeaveDate)) {
      throw new ClientError('La nueva baja debe iniciar después de la última baja cerrada', 400);
    }
  }
}

// Validaciones en update
async function validateLeaveUpdate(existing, patch) {
  const start = patch.startLeaveDate ? new Date(patch.startLeaveDate) : existing.startLeaveDate;
  const end   = patch.actualEndLeaveDate ? new Date(patch.actualEndLeaveDate) : existing.actualEndLeaveDate;

  if (patch.startLeaveDate !== undefined && Number.isNaN(new Date(start).getTime())) {
    throw new ClientError('Fecha de Inicio no válida', 400);
  }
  if (patch.actualEndLeaveDate !== undefined && end && Number.isNaN(end.getTime())) {
    throw new ClientError('Fecha de Fin no válida', 400);
  }

  if (end && start && end < start) {
    throw new ClientError('La Fecha de fin no puede ser anterior a la Fecha de Inicio', 400);
  }

  const willBeOpen =
    (patch.active !== undefined ? patch.active : existing.active) !== false &&
    (patch.actualEndLeaveDate !== undefined ? !patch.actualEndLeaveDate : !existing.actualEndLeaveDate);

  if (willBeOpen) {
    const anotherOpen = await Leaves.findOne({
      idUser: existing.idUser,
      idPeriod: existing.idPeriod,
      _id: { $ne: existing._id },
      active: { $ne: false },
      $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
    }).lean();

    if (anotherOpen) throw new ClientError('Ya hay otra baja/excedencia abierta en este periodo', 400);
  }
}

/* ---------------------------------------------------------
   CRUD (todo por body)
--------------------------------------------------------- */

// CREATE
async function createLeave(req, res) {
  const { idUser, idPeriod, leaveType, startLeaveDate, expectedEndLeaveDate, actualEndLeaveDate, active } = req.body;

  if (!idUser) throw new ClientError('idUser es requerido', 400);
  if (!idPeriod) throw new ClientError('idPeriod es requerido', 400);
  if (!leaveType) throw new ClientError('Tipo de Baja/Excedencia requerida', 400);
  if (!startLeaveDate) throw new ClientError('Fecha de inicio requerida', 400);

  const start = new Date(startLeaveDate);
  if (Number.isNaN(start.getTime())) throw new ClientError('Fecha de Inicio no válida', 400);

  await validateLeaveCreation({ idUser, idPeriod, startLeaveDate: start });

  const doc = await Leaves.create({
    idUser: toId(idUser),
    idPeriod: toId(idPeriod),
    leaveType: toId(leaveType),
    startLeaveDate: start,
    expectedEndLeaveDate: expectedEndLeaveDate ? new Date(expectedEndLeaveDate) : undefined,
    actualEndLeaveDate: actualEndLeaveDate ? new Date(actualEndLeaveDate) : undefined,
    active: active === false ? false : true,
  });

  return response(res, 201, doc);
}

// UPDATE
async function updateLeave(req, res) {
  const { leaveId } = req.body;
  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  const patch = {};
  if (req.body.leaveType !== undefined) patch.leaveType = req.body.leaveType ? toId(req.body.leaveType) : undefined;
  if (req.body.startLeaveDate !== undefined) patch.startLeaveDate = req.body.startLeaveDate ? new Date(req.body.startLeaveDate) : null;
  if (req.body.expectedEndLeaveDate !== undefined) patch.expectedEndLeaveDate = req.body.expectedEndLeaveDate ? new Date(req.body.expectedEndLeaveDate) : null;
  if (req.body.actualEndLeaveDate !== undefined) patch.actualEndLeaveDate = req.body.actualEndLeaveDate ? new Date(req.body.actualEndLeaveDate) : null;
  if (req.body.active !== undefined) patch.active = req.body.active;

  await validateLeaveUpdate(existing, patch);

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: patch },
    { new: true, runValidators: true }
  );

  return response(res, 200, updated);
}

// CLOSE
async function closeLeave(req, res) {
  const { leaveId, actualEndLeaveDate } = req.body;
  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  const end = actualEndLeaveDate ? new Date(actualEndLeaveDate) : new Date();
  if (Number.isNaN(end.getTime())) throw new ClientError('Fecha de fin no válida', 400);
  if (end < existing.startLeaveDate) throw new ClientError('La Fecha de fin no puede ser anterior a a la Fecha de Inicio', 400);

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: { actualEndLeaveDate: end, active: false } }, // 🔒 cerrar siempre => active: false
    { new: true }
  );

  return response(res, 200, updated);
}

// SOFT DELETE
async function softDeleteLeave(req, res) {
  const { leaveId } = req.body;
  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: { active: false } },
    { new: true }
  );
  if (!updated) throw new ClientError('Excedencia/baja no encontrada', 404);

  return response(res, 200, updated);
}

// HARD DELETE
async function hardDeleteLeave(req, res) {
  const { leaveId } = req.body;
  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const deleted = await Leaves.findByIdAndDelete(leaveId);
  if (!deleted) throw new ClientError('Excedencia/baja no encontrada', 404);

  return response(res, 200, { deleted: true });
}

// LIST (nombres canónicos: idUser, idPeriod)
// Mantiene compat: userId/periodId → idUser/idPeriod
async function listLeaves(req, res) {
  let {
    idUser,
    idPeriod,
    leaveType,
    active,
    openOnly,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    // compat:
    userId,
    periodId,
  } = req.body;

  // Back-compat mapeo
  if (!idUser && userId) idUser = userId;
  if (!idPeriod && periodId) idPeriod = periodId;

  const filters = {};
  if (idUser) filters.idUser = toId(idUser);
  if (idPeriod) filters.idPeriod = toId(idPeriod);
  if (leaveType) filters.leaveType = toId(leaveType);
  if (active !== undefined) filters.active = active;
  if (openOnly) filters.$or = [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }];

  if (dateFrom || dateTo) {
    filters.startLeaveDate = {};
    if (dateFrom) filters.startLeaveDate.$gte = new Date(dateFrom);
    if (dateTo)   filters.startLeaveDate.$lte = new Date(dateTo);
  }

  const total = await Leaves.countDocuments(filters);
  const docs = await Leaves.find(filters)
    .sort({ startLeaveDate: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));

  return response(res, 200, { total, page: Number(page), limit: Number(limit), docs });
}

// GET ONE
async function getLeaveById(req, res) {
  const { leaveId } = req.body;
  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const doc = await Leaves.findById(leaveId);
  if (!doc) throw new ClientError('Excedencia/baja no encontrada', 404);

  return response(res, 200, doc);
}

module.exports = {
  createLeave: catchAsync(createLeave),
  updateLeave: catchAsync(updateLeave),
  closeLeave: catchAsync(closeLeave),
  softDeleteLeave: catchAsync(softDeleteLeave),
  hardDeleteLeave: catchAsync(hardDeleteLeave),
  listLeaves: catchAsync(listLeaves),
  getLeaveById: catchAsync(getLeaveById),
};
