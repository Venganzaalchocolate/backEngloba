// controllers/leaveController.js (CommonJS)
const mongoose = require('mongoose');
const { Leaves, Periods, User, Dispositive } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const {
  disableSesameEmployeeForUser,
  ensureSesameEmployeeForUser,
  syncSesameEmployeeForUser
} = require('./sesameController');
const { notifyCurrentResponsibleManagersOfLeave, notifyCurrentResponsibleManagersOfExpectedLeaveEnd } = require('./emailControllerGoogle');

/* ---------------------------------------------------------
   Constantes y utilidades mínimas
--------------------------------------------------------- */

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
const MADRID_TZ = 'Europe/Madrid';

const unclosedLeaveFilter = {
  active: { $ne: false },
  $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
};

const dateKeyMadrid = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

/* ---------------------------------------------------------
   Helpers de negocio
--------------------------------------------------------- */

/**
 * Sincroniza el estado del trabajador en Sesame según su situación real:
 * - Si el usuario no está "activo" en Engloba, delega en la lógica general de Sesame.
 * - Si tiene una baja vigente ahora mismo, lo desactiva en Sesame.
 * - Si no tiene una baja vigente ahora mismo, lo activa en Sesame.
 */
async function syncSesameEmployeeStatusFromLeaves(userId) {
  if (!userId) throw new ClientError('Falta userId', 400);

  const user = await User.findById(userId).select('_id employmentStatus userIdSesame').lean();
  if (!user) throw new ClientError('Usuario no encontrado', 404);

  if (user.employmentStatus !== 'activo') {
    return syncSesameEmployeeForUser(userId);
  }

  const todayMadrid = dateKeyMadrid(new Date());

  const candidateLeaves = await Leaves.find({
    idUser: toId(userId),
    active: { $ne: false },
    startLeaveDate: { $exists: true, $ne: null }
  }).lean();

  const currentLeave = candidateLeaves.find((leave) => {
    const startKey = dateKeyMadrid(leave.startLeaveDate);
    const endKey = leave.actualEndLeaveDate ? dateKeyMadrid(leave.actualEndLeaveDate) : '';

    if (!startKey || startKey > todayMadrid) return false;
    if (endKey && endKey < todayMadrid) return false;
    return true;
  });

  if (currentLeave) return disableSesameEmployeeForUser(userId);
  return ensureSesameEmployeeForUser(userId, { status: 'active' });
}

/**
 * Envía el email a responsables solo si la baja/excedencia está vigente ahora mismo.
 * No bloquea el flujo principal si falla el correo.
 */
async function notifyManagersForCurrentLeave(leaveDoc) {
  try {
    if (!leaveDoc?._id) return;
    if (leaveDoc.active === false) return;
    if (!leaveDoc.startLeaveDate) return;

    const todayMadrid = dateKeyMadrid(new Date());
    const startKey = dateKeyMadrid(leaveDoc.startLeaveDate);
    const endKey = leaveDoc.actualEndLeaveDate ? dateKeyMadrid(leaveDoc.actualEndLeaveDate) : '';

    if (!startKey || startKey > todayMadrid) return;
    if (endKey && endKey < todayMadrid) return;

    const leave = await Leaves.findById(leaveDoc._id)
      .populate({ path: 'leaveType', select: 'name' })
      .lean();

    if (!leave) return;

    const user = await User.findById(leave.idUser)
      .select('firstName lastName dni email')
      .lean();

    if (!user) return;

    await notifyCurrentResponsibleManagersOfLeave({ user, leave });
  } catch (err) {
    console.warn('[notifyManagersForCurrentLeave] Error enviando email:', err?.message || err);
  }
}

/**
 * Valida la creación de una baja/excedencia:
 * - El periodo debe existir y pertenecer al usuario.
 * - La fecha de inicio debe quedar dentro del rango del periodo.
 * - No puede existir otra baja no cerrada en el mismo periodo.
 * - Si hubo una baja previa cerrada, la nueva debe empezar después.
 */
async function validateLeaveCreation({ idUser, idPeriod, startLeaveDate }) {
  const period = await Periods.findOne({
    _id: toId(idPeriod),
    idUser: toId(idUser),
  }).lean();

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
    ...unclosedLeaveFilter,
  }).lean();

  if (open) {
    throw new ClientError('Ya existe una baja/excedencia abierta para este periodo', 400);
  }

  const last = await Leaves.findOne({
    idUser: toId(idUser),
    idPeriod: toId(idPeriod),
  })
    .sort({ startLeaveDate: -1 })
    .lean();

  if (last?.actualEndLeaveDate && startLeaveDate <= new Date(last.actualEndLeaveDate)) {
    throw new ClientError('La nueva baja debe iniciar después de la última baja cerrada', 400);
  }
}

/**
 * Valida una modificación sobre una baja/excedencia:
 * - Fechas válidas.
 * - La fecha fin no puede ser anterior a la de inicio.
 * - Si tras el update sigue "no cerrada", no puede coexistir con otra no cerrada del mismo periodo.
 */
async function validateLeaveUpdate(existing, patch) {
  const start = patch.startLeaveDate !== undefined ? patch.startLeaveDate : existing.startLeaveDate;
  const end = patch.actualEndLeaveDate !== undefined ? patch.actualEndLeaveDate : existing.actualEndLeaveDate;

  if (patch.startLeaveDate !== undefined && start && Number.isNaN(new Date(start).getTime())) {
    throw new ClientError('Fecha de Inicio no válida', 400);
  }

  if (patch.actualEndLeaveDate !== undefined && end && Number.isNaN(new Date(end).getTime())) {
    throw new ClientError('Fecha de Fin no válida', 400);
  }

  if (start && end && new Date(end) < new Date(start)) {
    throw new ClientError('La Fecha de fin no puede ser anterior a la Fecha de Inicio', 400);
  }

  const willBeUnclosed =
    (patch.active !== undefined ? patch.active : existing.active) !== false &&
    !(patch.actualEndLeaveDate !== undefined ? patch.actualEndLeaveDate : existing.actualEndLeaveDate);

  if (!willBeUnclosed) return;

  const anotherOpen = await Leaves.findOne({
    idUser: existing.idUser,
    idPeriod: existing.idPeriod,
    _id: { $ne: existing._id },
    ...unclosedLeaveFilter,
  }).lean();

  if (anotherOpen) {
    throw new ClientError('Ya hay otra baja/excedencia abierta en este periodo', 400);
  }
}

/**
 * Revisa diariamente qué bajas/excedencias empiezan hoy y cuáles terminaron ayer.
 * Con Regla B:
 * - startLeaveDate = primer día de baja
 * - actualEndLeaveDate = último día de baja
 * - la reactivación en Sesame se hace al día siguiente del actualEndLeaveDate
 */
async function processDailyLeaveStatusChanges({ logger = console } = {}) {
  const log = logger?.log || console.log;
  const warn = logger?.warn || console.log;
  const error = logger?.error || console.log;

  const today = new Date();
  const todayMadrid = dateKeyMadrid(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayMadrid = dateKeyMadrid(yesterday);

  log(`[processDailyLeaveStatusChanges] Inicio para ${todayMadrid}`);

  const leaves = await Leaves.find({
    active: { $ne: false },
    $or: [
      { startLeaveDate: { $exists: true, $ne: null } },
      { actualEndLeaveDate: { $exists: true, $ne: null } },
    ],
  }).lean();

  const startsToday = leaves.filter(
    (leave) => leave.startLeaveDate && dateKeyMadrid(leave.startLeaveDate) === todayMadrid
  );

  const endedYesterday = leaves.filter(
    (leave) => leave.actualEndLeaveDate && dateKeyMadrid(leave.actualEndLeaveDate) === yesterdayMadrid
  );

  const affectedUserIds = Array.from(
    new Set(
      [...startsToday, ...endedYesterday]
        .map((leave) => String(leave.idUser || ''))
        .filter(Boolean)
    )
  );

  const result = {
    todayMadrid,
    startsToday: startsToday.length,
    endedYesterday: endedYesterday.length,
    affectedUsers: affectedUserIds.length,
    synced: [],
    syncErrors: [],
    emailed: [],
    emailErrors: [],
  };

  for (const userId of affectedUserIds) {
    try {
      await syncSesameEmployeeStatusFromLeaves(userId);
      result.synced.push(userId);
    } catch (err) {
      result.syncErrors.push({
        userId,
        error: err?.message || String(err),
      });
      error(`[processDailyLeaveStatusChanges] Error sincronizando user ${userId}: ${err?.message || err}`);
    }
  }

  for (const leave of startsToday) {
    try {
      await notifyManagersForCurrentLeave(leave);
      result.emailed.push(String(leave._id));
    } catch (err) {
      result.emailErrors.push({
        leaveId: String(leave._id),
        error: err?.message || String(err),
      });
      warn(`[processDailyLeaveStatusChanges] Error notificando leave ${leave._id}: ${err?.message || err}`);
    }
  }

  log('[processDailyLeaveStatusChanges] Fin', {
    startsToday: result.startsToday,
    endedYesterday: result.endedYesterday,
    affectedUsers: result.affectedUsers,
    synced: result.synced.length,
    syncErrors: result.syncErrors.length,
    emailed: result.emailed.length,
    emailErrors: result.emailErrors.length,
  });

  return result;
}

/* ---------------------------------------------------------
   CRUD
--------------------------------------------------------- */

/**
 * Crea una baja/excedencia.
 * Después de crearla:
 * - sincroniza Sesame según si ya está vigente o no,
 * - y notifica a responsables si la baja ya ha comenzado.
 */
async function createLeave(req, res) {
  const {
    idUser,
    idPeriod,
    leaveType,
    startLeaveDate,
    expectedEndLeaveDate,
    actualEndLeaveDate,
    active
  } = req.body;

  if (!idUser) throw new ClientError('idUser es requerido', 400);
  if (!idPeriod) throw new ClientError('idPeriod es requerido', 400);
  if (!leaveType) throw new ClientError('Tipo de Baja/Excedencia requerida', 400);
  if (!startLeaveDate) throw new ClientError('Fecha de inicio requerida', 400);

  const start = new Date(startLeaveDate);
  if (Number.isNaN(start.getTime())) throw new ClientError('Fecha de Inicio no válida', 400);

  const expectedEnd = expectedEndLeaveDate ? new Date(expectedEndLeaveDate) : null;
  const actualEnd = actualEndLeaveDate ? new Date(actualEndLeaveDate) : null;

  if (expectedEnd && Number.isNaN(expectedEnd.getTime())) {
    throw new ClientError('Fecha prevista de fin no válida', 400);
  }

  if (actualEnd && Number.isNaN(actualEnd.getTime())) {
    throw new ClientError('Fecha de Fin no válida', 400);
  }

  if (actualEnd && actualEnd < start) {
    throw new ClientError('La Fecha de fin no puede ser anterior a la Fecha de Inicio', 400);
  }

  await validateLeaveCreation({ idUser, idPeriod, startLeaveDate: start });

  const doc = await Leaves.create({
    idUser: toId(idUser),
    idPeriod: toId(idPeriod),
    leaveType: toId(leaveType),
    startLeaveDate: start,
    expectedEndLeaveDate: expectedEnd || undefined,
    actualEndLeaveDate: actualEnd || undefined,
    active: actualEnd ? false : active === false ? false : true,
  });

  await syncSesameEmployeeStatusFromLeaves(idUser);
  await notifyManagersForCurrentLeave(doc);

  return response(res, 201, doc);
}

/**
 * Actualiza una baja/excedencia.
 * Después del cambio:
 * - normaliza active si se ha informado fecha fin real,
 * - sincroniza Sesame,
 * - y notifica a responsables si la baja queda vigente ahora mismo.
 */
async function updateLeave(req, res) {
  const { leaveId } = req.body;

  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  const patch = {};

  if (req.body.leaveType !== undefined) {
    patch.leaveType = req.body.leaveType ? toId(req.body.leaveType) : undefined;
  }

  if (req.body.startLeaveDate !== undefined) {
    patch.startLeaveDate = req.body.startLeaveDate ? new Date(req.body.startLeaveDate) : null;
  }

  if (req.body.expectedEndLeaveDate !== undefined) {
    patch.expectedEndLeaveDate = req.body.expectedEndLeaveDate ? new Date(req.body.expectedEndLeaveDate) : null;
  }

  if (req.body.actualEndLeaveDate !== undefined) {
    patch.actualEndLeaveDate = req.body.actualEndLeaveDate ? new Date(req.body.actualEndLeaveDate) : null;
  }

  if (req.body.active !== undefined) {
    patch.active = req.body.active;
  }

  await validateLeaveUpdate(existing, patch);

  if (req.body.actualEndLeaveDate !== undefined) {
    patch.active = req.body.actualEndLeaveDate ? false : req.body.active === false ? false : true;
  }

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: patch },
    { new: true, runValidators: true }
  );

  await syncSesameEmployeeStatusFromLeaves(existing.idUser);
  await notifyManagersForCurrentLeave(updated);

  return response(res, 200, updated);
}

/**
 * Cierra manualmente una baja/excedencia:
 * - fija la fecha fin real,
 * - la marca como inactive,
 * - y vuelve a sincronizar Sesame.
 */
async function closeLeave(req, res) {
  const { leaveId, actualEndLeaveDate } = req.body;

  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  const end = actualEndLeaveDate ? new Date(actualEndLeaveDate) : new Date();

  if (Number.isNaN(end.getTime())) {
    throw new ClientError('Fecha de fin no válida', 400);
  }

  if (end < existing.startLeaveDate) {
    throw new ClientError('La Fecha de fin no puede ser anterior a la Fecha de Inicio', 400);
  }

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: { actualEndLeaveDate: end, active: false } },
    { new: true }
  );

  await syncSesameEmployeeStatusFromLeaves(existing.idUser);

  return response(res, 200, updated);
}

/**
 * Desactiva lógicamente una baja/excedencia sin borrarla.
 * Después sincroniza Sesame.
 */
async function softDeleteLeave(req, res) {
  const { leaveId } = req.body;

  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  const updated = await Leaves.findByIdAndUpdate(
    leaveId,
    { $set: { active: false } },
    { new: true }
  );

  await syncSesameEmployeeStatusFromLeaves(existing.idUser);

  return response(res, 200, updated);
}

/**
 * Borra físicamente una baja/excedencia.
 * Después sincroniza Sesame.
 */
async function hardDeleteLeave(req, res) {
  const { leaveId } = req.body;

  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const existing = await Leaves.findById(leaveId);
  if (!existing) throw new ClientError('Excedencia/baja no encontrada', 404);

  await Leaves.findByIdAndDelete(leaveId);
  await syncSesameEmployeeStatusFromLeaves(existing.idUser);

  return response(res, 200, { deleted: true });
}

/**
 * Lista bajas/excedencias con filtros por usuario, periodo, tipo, estado y rango de fechas.
 * openOnly devuelve las no cerradas administrativamente, aunque todavía no hayan comenzado.
 */
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
    userId,
    periodId,
  } = req.body;

  if (!idUser && userId) idUser = userId;
  if (!idPeriod && periodId) idPeriod = periodId;

  const filters = {};

  if (idUser) filters.idUser = toId(idUser);
  if (idPeriod) filters.idPeriod = toId(idPeriod);
  if (leaveType) filters.leaveType = toId(leaveType);
  if (active !== undefined) filters.active = active;
  if (openOnly) Object.assign(filters, unclosedLeaveFilter);

  if (dateFrom || dateTo) {
    filters.startLeaveDate = {};
    if (dateFrom) filters.startLeaveDate.$gte = new Date(dateFrom);
    if (dateTo) filters.startLeaveDate.$lte = new Date(dateTo);
  }

  const total = await Leaves.countDocuments(filters);

  const docs = await Leaves.find(filters)
    .sort({ startLeaveDate: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));

  return response(res, 200, {
    total,
    page: Number(page),
    limit: Number(limit),
    docs
  });
}

/**
 * Devuelve una baja/excedencia concreta por id.
 */
async function getLeaveById(req, res) {
  const { leaveId } = req.body;

  if (!leaveId || !mongoose.Types.ObjectId.isValid(leaveId)) {
    throw new ClientError('leaveId inválido', 400);
  }

  const doc = await Leaves.findById(leaveId);
  if (!doc) throw new ClientError('Excedencia/baja no encontrada', 404);

  return response(res, 200, doc);
}

/**
 * Envía cada día recordatorios a responsables cuando una baja/excedencia:
 * - termina previsiblemente mañana,
 * - termina hoy,
 * - o ya debería haber terminado según la fecha prevista,
 * siempre que siga sin fecha de fin efectiva registrada.
 */
async function processDailyExpectedLeaveEndReminders({ logger = console, testEmail = 'comunicacion@engloba.org.es' } = {}) {
  const log = logger?.log || console.log;
  const warn = logger?.warn || console.log;
  const error = logger?.error || console.log;

  const today = new Date();
  const todayMadrid = dateKeyMadrid(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowMadrid = dateKeyMadrid(tomorrow);

  log(`[processDailyExpectedLeaveEndReminders] Inicio para ${todayMadrid}`);

  const leaves = await Leaves.find({
    active: { $ne: false },
    expectedEndLeaveDate: { $exists: true, $ne: null },
    $or: [
      { actualEndLeaveDate: { $exists: false } },
      { actualEndLeaveDate: null }
    ],
  })
    .populate({ path: 'leaveType', select: 'name' })
    .lean();

  const candidates = leaves.filter((leave) => {
    const expectedEndKey = dateKeyMadrid(leave.expectedEndLeaveDate);
    return expectedEndKey && expectedEndKey <= tomorrowMadrid;
  });

  const result = {
    todayMadrid,
    tomorrowMadrid,
    reminders: candidates.length,
    emailed: [],
    emailErrors: [],
    skipped: [],
  };

  for (const leave of candidates) {
    try {
      const user = await User.findById(leave.idUser)
        .select('firstName lastName dni email')
        .lean();

      if (!user) {
        warn(`[processDailyExpectedLeaveEndReminders] Usuario no encontrado para leave ${leave._id}`);
        result.skipped.push({ leaveId: String(leave._id), reason: 'user_not_found' });
        continue;
      }

      const sendResult = await notifyCurrentResponsibleManagersOfExpectedLeaveEnd({
        user,
        leave,
        testEmail
      });

      if (sendResult?.ok) {
        result.emailed.push({
          leaveId: String(leave._id),
          recipients: sendResult.recipients || []
        });
      } else {
        result.skipped.push({
          leaveId: String(leave._id),
          reason: sendResult?.reason || sendResult?.error || 'not_sent'
        });
      }
    } catch (err) {
      result.emailErrors.push({
        leaveId: String(leave._id),
        error: err?.message || String(err),
      });
      error(`[processDailyExpectedLeaveEndReminders] Error notificando leave ${leave._id}: ${err?.message || err}`);
    }
  }

  log('[processDailyExpectedLeaveEndReminders] Fin', {
    reminders: result.reminders,
    emailed: result.emailed.length,
    skipped: result.skipped.length,
    emailErrors: result.emailErrors.length,
  });

  return result;
}




module.exports = {
  createLeave: catchAsync(createLeave),
  updateLeave: catchAsync(updateLeave),
  closeLeave: catchAsync(closeLeave),
  softDeleteLeave: catchAsync(softDeleteLeave),
  hardDeleteLeave: catchAsync(hardDeleteLeave),
  listLeaves: catchAsync(listLeaves),
  getLeaveById: catchAsync(getLeaveById),

  syncSesameEmployeeStatusFromLeaves,
  processDailyLeaveStatusChanges,
  processDailyExpectedLeaveEndReminders
};