// services/periodMigration.js
import mongoose from 'mongoose';
import { User, Periods, Leaves, Offer, Jobs, Studies, Provinces, UserCv, Dispositive, Program } from '../models/indexModels.js';

/* =========================
   Utils básicos
========================== */
const n = v => (v === undefined ? null : v);
const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
const normDni = (dni) => String(dni || '').replace(/\s+/g, '').toUpperCase();
function normalize(s) {
  if (!s) return '';
  return s.toString().trim().toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}



/* =========================
   REPLACEMENT helpers
========================== */
async function resolveUserIdFromDni(dniRaw) {
  if (!dniRaw) return null;
  const dni = String(dniRaw).replace(/\s+/g, '').toUpperCase();
  const u = await User.findOne({ dni: { $regex: `^${dni}$`, $options: 'i' } }).select('_id');
  return u?._id ?? null;
}

async function getReplacementPayload(hp) {
  const out = { user: null, leave: null };
  if (!hp) return out;

  if (hp.replacement?.user) out.user = hp.replacement.user;
  else if (hp.reason?.user) out.user = hp.reason.user;
  else if (hp.reason?.dni) out.user = await resolveUserIdFromDni(hp.reason.dni);

  if (hp.replacement?.leave) {
    out.leave = hp.replacement.leave;
  } else if (out.user && hp.reason?.notes?.startLeaveDate) {
    const start = new Date(hp.reason.notes.startLeaveDate);
    if (!isNaN(start)) {
      const lv = await Leaves.findOne({ idUser: out.user, startLeaveDate: start }).select('_id');
      out.leave = lv?._id ?? null;
    }
  }
  return out;
}

/* =========================================================
   DISPOSITIVE: migración Program.devices -> Dispositive
========================================================= */
function toDispositivePayloadFromEmbedded(d, programId) {
  return {
    active: d?.active !== undefined ? d.active : true,
    name: d?.name,
    address: d?.address || undefined,
    email: d?.email || undefined,
    phone: d?.phone || undefined,
    responsible: Array.isArray(d?.responsible) ? d.responsible : [],
    province: d?.province || undefined,
    coordinators: Array.isArray(d?.coordinators) ? d.coordinators : [],
    files: Array.isArray(d?.files) ? d.files : [],
    groupWorkspace: d?.groupWorkspace || undefined,
    subGroupWorkspace: Array.isArray(d?.subGroupWorkspace) ? d.subGroupWorkspace : [],
    program: programId,
  };
}

export async function migrateDispositivesFromProgram(
  programId,
  { apply = false, removeEmbedded = false, updateExisting = false, idsField = 'devicesId', useTransaction = false } = {}
) {
  const proj = { name: 1, devices: 1, [idsField]: 1 };
  const p = await Program.findById(programId, proj).lean();
  if (!p) throw new Error(`Program ${programId} no encontrado`);

  const emb = Array.isArray(p.devices) ? p.devices : [];
  const existingIds = Array.isArray(p[idsField]) ? p[idsField].map(String) : [];

  const existingByName = new Map();
  if (existingIds.length) {
    const existingDocs = await Dispositive.find({ _id: { $in: existingIds } }, { _id: 1, name: 1 }).lean();
    for (const d of existingDocs) existingByName.set(normalize(d.name), String(d._id));
  }

  const toCreate = [];
  const toUpdate = [];
  const reusedIds = [];

  for (const d of emb) {
    if (!d?.name) continue;
    const key = normalize(d.name);
    const maybeId = existingByName.get(key);
    if (maybeId) {
      reusedIds.push(maybeId);
      if (updateExisting) toUpdate.push({ id: maybeId, $set: toDispositivePayloadFromEmbedded(d, p._id) });
      continue;
    }
    toCreate.push(toDispositivePayloadFromEmbedded(d, p._id));
  }

  const stats = {
    programId: String(p._id), programName: p.name || null,
    embeddedCount: emb.length, alreadyLinked: existingIds.length,
    willReuse: reusedIds.length, willCreate: toCreate.length,
    willUpdateExisting: updateExisting ? toUpdate.length : 0,
    created: 0, updated: 0, linkedAfter: null, removedEmbedded: false, dryRun: !apply,
  };

  if (!apply) return stats;

  let session = null;
  try {
    if (useTransaction) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    let createdDocs = [];
    if (toCreate.length) {
      createdDocs = await Dispositive.insertMany(toCreate, { session });
      stats.created = createdDocs.length;
    }
    if (updateExisting && toUpdate.length) {
      for (const up of toUpdate) {
        await Dispositive.updateOne({ _id: toId(up.id) }, { $set: up.$set }, { session });
      }
      stats.updated = toUpdate.length;
    }

    const newIds = createdDocs.map(d => d._id);
    const finalIds = Array.from(new Set([...existingIds, ...reusedIds, ...newIds.map(String)])).map(toId);

    const updateProgram = { $set: { [idsField]: finalIds } };
    if (removeEmbedded) { updateProgram.$set.devices = []; stats.removedEmbedded = true; }

    await Program.updateOne({ _id: p._id }, updateProgram, { session });
    stats.linkedAfter = finalIds.length;

    if (useTransaction) await session.commitTransaction();
  } catch (err) {
    if (useTransaction && session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }

  return stats;
}

export async function migrateAllProgramDispositives({
  apply = false, removeEmbedded = false, updateExisting = false, useTransaction = false,
  matchActive = '', limit = 0, idsField = 'devicesId',
} = {}) {
  const match = { 'devices.0': { $exists: true } };
  if (matchActive === 'true') match.active = true;
  if (matchActive === 'false') match.active = false;

  let q = Program.find(match, { _id: 1 }).lean();
  if (limit > 0) q = q.limit(limit);

  const cursor = q.cursor();
  const summary = {
    apply, removeEmbedded, updateExisting, idsField,
    totalProgramsScanned: 0, programsProcessed: 0,
    createdTotal: 0, updatedTotal: 0, errors: [],
  };

  for await (const row of cursor) {
    summary.totalProgramsScanned++;
    try {
      const res = await migrateDispositivesFromProgram(row._id, { apply, removeEmbedded, updateExisting, useTransaction, idsField });
      summary.programsProcessed++;
      summary.createdTotal += res.created;
      summary.updatedTotal += res.updated;
      if (summary.programsProcessed % 50 === 0) {
        console.log(`[Dispositivos] Procesados: ${summary.programsProcessed} | Creados: ${summary.createdTotal}`);
      }
    } catch (e) {
      summary.errors.push({ programId: String(row._id), message: e?.message || String(e) });
    }
  }

  console.log('==== RESUMEN MIGRACIÓN DISPOSITIVOS ====');
  console.table({
    apply, removeEmbedded, updateExisting, idsField,
    scanned: summary.totalProgramsScanned,
    processed: summary.programsProcessed,
    dispositivesCreated: summary.createdTotal,
    dispositivesUpdated: summary.updatedTotal,
    errors: summary.errors.length,
  });

  return summary;
}

/* =========================================================
   Índices para mapear DEVICE legacy <-> DISPOSITIVE nuevo
========================================================= */
let _newToLegacyDeviceIds = null;
const _cacheLegacyDeviceToDispositive = new Map();

async function buildNewToLegacyDeviceIndex() {
  if (_newToLegacyDeviceIds) return _newToLegacyDeviceIds;

  const map = new Map();

  const dispositives = await Dispositive.find({}, { _id: 1, program: 1, name: 1, email: 1, phone: 1, address: 1 }).lean();

  const byProgDisp = new Map(); // progId -> [dispositive...]
  for (const d of dispositives) {
    const progKey = String(d.program || 'null');
    if (!byProgDisp.has(progKey)) byProgDisp.set(progKey, []);
    byProgDisp.get(progKey).push(d);
  }

  const programs = await Program.find({}, { _id: 1, devices: { _id: 1, name: 1, email: 1, phone: 1, address: 1 } }).lean();

  for (const p of programs) {
    const progKey = String(p._id);
    const dispList = byProgDisp.get(progKey) || [];
    const devices = Array.isArray(p.devices) ? p.devices : [];

    for (const dev of devices) {
      const byName = dispList.find(d => normalize(d.name) === normalize(dev.name || ''));
      let match = byName;

      if (!match) {
        const hits = dispList.filter(d =>
          (dev.email && d.email && dev.email === d.email) ||
          (dev.phone && d.phone && dev.phone === d.phone) ||
          (dev.address && d.address && dev.address === d.address)
        );
        if (hits.length === 1) match = hits[0];
      }

      if (match) {
        const newId = String(match._id);
        const legacyId = String(dev._id);
        if (!map.has(newId)) map.set(newId, new Set());
        map.get(newId).add(legacyId);
      }
    }
  }

  _newToLegacyDeviceIds = map;
  return map;
}

/* =========================================================
   Resolver de DISPOSITIVO para un hiringPeriod legacy
========================================================= */
async function resolveDispositiveIdFromHP(hp) {
  if (!hp) return null;

  // Si ya trae un id válido nuevo:
  const directCandidates = [ hp.dispositiveId, hp.dispositive];
  for (const cand of directCandidates) {
    if (cand) {
      const ok = await Dispositive.exists({ _id: cand });
      if (ok) return cand;
    }
  }

  // Si hp.device ya es un ObjectId de Dispositive (migración parcial)
  if (hp.device) {
    if (_cacheLegacyDeviceToDispositive.has(String(hp.device))) {
      return _cacheLegacyDeviceToDispositive.get(String(hp.device));
    }
    const looksNew = await Dispositive.exists({ _id: hp.device });
    if (looksNew) {
      _cacheLegacyDeviceToDispositive.set(String(hp.device), hp.device);
      return hp.device;
    }

    // Buscar en Program.devices legacy y mapear al Dispositive del mismo programa
    const prog = await Program.findOne(
      { 'devices._id': hp.device },
      { _id: 1, devices: { $elemMatch: { _id: hp.device } } }
    ).lean();

    if (!prog || !Array.isArray(prog.devices) || !prog.devices[0]) {
      _cacheLegacyDeviceToDispositive.set(String(hp.device), null);
      return null;
    }

    const legacyDev = prog.devices[0];
    const normName = normalize(legacyDev.name || '');

    const dispDocs = await Dispositive.find({ program: prog._id }, { _id: 1, name: 1, email: 1, phone: 1, address: 1 }).lean();

    let match = dispDocs.find(d => normalize(d.name) === normName);
    if (!match) {
      const candidates = dispDocs.filter(d =>
        (legacyDev.email && d.email && d.email === legacyDev.email) ||
        (legacyDev.phone && d.phone && d.phone === legacyDev.phone) ||
        (legacyDev.address && d.address && d.address === legacyDev.address)
      );
      if (candidates.length === 1) match = candidates[0];
    }

    const resolved = match ? match._id : null;
    _cacheLegacyDeviceToDispositive.set(String(hp.device), resolved);
    return resolved;
  }

  return null;
}

/* =========================================================
   Resolver de selectionProcess (OFERTA) con filtro DEVICE
========================================================= */
function inSafeWindow(offerDoc, periodDoc) {
  // si quieres ventana temporal, ajusta aquí; por defecto desactivado
  return true;
}

/**
 * Devuelve la Offer más probable para el periodo:
 * - Misma persona (por DNI via UserCv)
 * - (si hay) mismo puesto (hp.position == offer.jobId)
 * - (si hay) mismo "device legacy" entre oferta y periodo (o mismo dispositive nuevo)
 * - la más cercana en fecha a hp.startDate
 */
async function resolveSelectionProcessId(userId, hp) {
  if (!userId || !hp) return null;

  // si ya viene y existe, respétalo
  if (hp.selectionProcess) {
    const ok = await Offer.exists({ _id: hp.selectionProcess });
    if (ok) return hp.selectionProcess;
  }

  // legacy/new acceptable devices
  let wantedLegacySet = null;         // Set de legacy ids aceptables
  let wantedNewDispositiveId = null;

  if (hp.device) {
    wantedLegacySet = new Set([String(hp.device)]);
  } else {
    const candNew = hp.dispositiveId || hp.dispositiveId || null;
    if (candNew) {
      wantedNewDispositiveId = String(candNew);
      const idx = await buildNewToLegacyDeviceIndex();
      if (idx.has(wantedNewDispositiveId)) {
        wantedLegacySet = idx.get(wantedNewDispositiveId); // Set de legacy ids
      }
    }
  }

  // persona por DNI -> sus CVs -> ofertas candidatas
  const user = await User.findById(userId, { dni: 1 }).lean();
  const dni = normDni(user?.dni);
  if (!dni) return null;

  const cvs = await UserCv.find(
    { dni: { $regex: `^${dni}$`, $options: 'i' } },
    { _id: 1, offer: 1, createdAt: 1, updatedAt: 1 }
  ).lean();
  if (!cvs.length) return null;

  const cvIds = cvs.map(c => c._id);
  const directOfferIds = cvs.map(c => c.offer).filter(Boolean);

  // 1) ofertas de cv.offer
  let offers = [];
  if (directOfferIds.length) {
    const docs = await Offer.find(
      { _id: { $in: directOfferIds } },
      { _id: 1, jobId: 1, device: 1, dispositiveId: 1, dispositiveId: 1, createdAt: 1, updatedAt: 1, datecreate: 1 }
    ).lean();
    offers.push(...docs);
  }

  // 2) ofertas que listan esos CVs
  const docsByCv = await Offer.find(
    { userCv: { $in: cvIds } },
    { _id: 1, jobId: 1, device: 1, dispositiveId: 1, dispositiveId: 1, createdAt: 1, updatedAt: 1, datecreate: 1 }
  ).lean();
  offers.push(...docsByCv);

  // dedupe
  const unique = new Map();
  for (const o of offers) unique.set(String(o._id), o);
  offers = [...unique.values()];
  if (!offers.length) return null;

  // puesto
  if (hp.position) {
    offers = offers.filter(o => String(o.jobId) === String(hp.position));
    if (!offers.length) return null;
  }

  // device filter
  if (wantedLegacySet && wantedLegacySet.size) {
    offers = offers.filter(o => o.device && wantedLegacySet.has(String(o.device)));
    if (!offers.length) return null;
  } else if (wantedNewDispositiveId) {
    offers = offers.filter(o => String(o.dispositiveId || o.dispositiveId || '') === wantedNewDispositiveId);
    if (!offers.length) return null;
  }

  // más cercana en fecha
  const baseDate = hp.startDate ? new Date(hp.startDate) : null;
  let best = null, bestDelta = Infinity;

  for (const o of offers) {
    const ref = o.createdAt || o.datecreate || o.updatedAt || null;
    const d = ref ? new Date(ref) : null;
    const delta = (baseDate && d) ? Math.abs(baseDate - d) : Number.MAX_SAFE_INTEGER;
    if (delta < bestDelta) { bestDelta = delta; best = o; }
  }

  return best?._id || null;
}

/* =========================================================
   PERIODS + LEAVES (PATCHED para resolver antes de guardar)
========================================================= */
export async function createPeriodIfMissing(userId, hp) {
  const filter = {
    idUser: userId,
    startDate: n(hp.startDate),
    endDate: n(hp.endDate),
    position: n(hp.position),
  };

  let exists = await Periods.findOne(filter);
  if (exists) return { doc: exists, created: false };

  const [dispositiveId, selectionProc, replacement] = await Promise.all([
    resolveDispositiveIdFromHP(hp),
    resolveSelectionProcessId(userId, hp),
    getReplacementPayload(hp),
  ]);

  const doc = await Periods.create({
    ...filter,
    dispositiveId: n(dispositiveId),
    workShift: hp.workShift || undefined,
    selectionProcess: n(selectionProc),
    active: hp.active !== undefined ? hp.active : true,
    replacement,
  });

  return { doc, created: true };
}

export async function upsertPeriod(userId, hp) {
  const filter = {
    idUser: userId,
    startDate: n(hp.startDate),
    endDate: n(hp.endDate),
    position: n(hp.position),
  };

  const [dispositiveId, selectionProc, replacement] = await Promise.all([
    resolveDispositiveIdFromHP(hp),
    resolveSelectionProcessId(userId, hp),
    getReplacementPayload(hp),
  ]);

  const update = {
    $set: {
      dispositiveId: n(dispositiveId),
      workShift: hp.workShift || undefined,
      selectionProcess: n(selectionProc),
      active: hp.active !== undefined ? hp.active : true,
      replacement,
    },
    $unset: { device: "" }, // limpia legacy
  };

  const before = await Periods.findOne(filter).lean();
  const doc = await Periods.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { doc, created: !before, updated: !!before };
}

export async function createLeaveIfMissing(userId, periodId, lv) {
  const filter = {
    idUser: userId,
    idPeriod: periodId,
    startLeaveDate: n(lv.startLeaveDate),
    leaveType: n(lv.leaveType),
  };

  const exists = await Leaves.findOne(filter);
  if (exists) return { created: false };

  await Leaves.create({
    ...filter,
    expectedEndLeaveDate: n(lv.expectedEndLeaveDate),
    actualEndLeaveDate: n(lv.actualEndLeaveDate),
    active: lv.active,
  });

  return { created: true };
}

/* =========================================================
   BULK desde User.hiringPeriods (CREATE)
========================================================= */
export async function createFromUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('Usuario no encontrado');

  let periodsCreated = 0;
  let leavesCreated = 0;

  for (const hp of user.hiringPeriods || []) {
    const { doc: periodDoc, created } = await createPeriodIfMissing(user._id, hp);
    if (created) periodsCreated++;

    for (const lv of hp.leavePeriods || []) {
      const res = await createLeaveIfMissing(user._id, periodDoc._id, lv);
      if (res.created) leavesCreated++;
    }
  }

  return { userId, periodsCreated, leavesCreated };
}

/* =========================================================
   REPARACIÓN final (por si quedó algo sin enlazar)
========================================================= */
export async function repairExistingPeriods({ apply = false, limit = 0 } = {}) {
  let q = Periods.find(
    {
      $or: [
        { dispositiveId: { $exists: false } },
        { dispositiveId: null },
        { selectionProcess: { $exists: false } },
        { selectionProcess: null },
      ],
    },
    { _id: 1, idUser: 1, startDate: 1, endDate: 1, position: 1, workShift: 1, selectionProcess: 1, dispositiveId: 1, device: 1 }
  ).lean();

  if (limit > 0) q = q.limit(limit);
  const cursor = q.cursor();

  const stats = { dryRun: !apply, scanned: 0, updated: 0, errors: 0 };

  for await (const p of cursor) {
    stats.scanned++;

    try {
      const hp = {
        startDate: p.startDate,
        endDate: p.endDate,
        position: p.position,
        workShift: p.workShift,
        selectionProcess: p.selectionProcess,
        dispositiveId: p.dispositiveId,
        device: p.device, // legacy
      };

      const [dispId, selProc] = await Promise.all([
        p.dispositiveId ? p.dispositiveId : resolveDispositiveIdFromHP(hp),
        p.selectionProcess ? p.selectionProcess : resolveSelectionProcessId(p.idUser, hp),
      ]);

      const $set = {};
      if (!p.dispositiveId && dispId) $set.dispositiveId = dispId;
      if (!p.selectionProcess && selProc) $set.selectionProcess = selProc;

      if (Object.keys($set).length) {
        if (apply) await Periods.updateOne({ _id: p._id }, { $set, $unset: { device: "" } });
        stats.updated++;
      }
    } catch (err) {
      stats.errors++;
      console.log(`Error reparando Period ${p._id}:`, err?.message || err);
    }

    if (stats.scanned % 500 === 0) {
      console.log(`[Repair] Scanned=${stats.scanned} Updated=${stats.updated}`);
    }
  }

  console.log('==== REPARACIÓN PERIODS ====');
  console.table(stats);
  return stats;
}

/* =========================================================
   ORQUESTADOR: TODO el flujo, con logs
========================================================= */
export async function fullFreshMigration({
  apply = true,
  idsField = 'devicesId',
  removeEmbedded = false,
  updateExisting = false,
  programLimit = 0,   // 0 = sin límite
  userLimit = 0,      // 0 = sin límite
} = {}) {
  console.log('\n==============================');
  console.log(' INICIO MIGRACIÓN COMPLETA');
  console.log('==============================');

  // 0) Estado inicial
  const [cProg, cDisp, cPer, cLev] = await Promise.all([
    Program.countDocuments({}),
    Dispositive.countDocuments({}),
    Periods.countDocuments({}),
    Leaves.countDocuments({}),
  ]);
  console.log(`[Estado inicial] Programs=${cProg} Dispositives=${cDisp} Periods=${cPer} Leaves=${cLev}`);

  // 1) DISPOSITIVOS
  console.log('\n[1/4] Migrando dispositivos (Program.devices -> Dispositive)…');
  const dispSummary = await migrateAllProgramDispositives({
    apply, removeEmbedded, updateExisting, idsField, limit: programLimit,
  });

  // Pre-construir índice reverse para el filtrado por device en selectionProcess
  console.log('[1b] Construyendo índice newDispositive -> legacyDevices…');
  await buildNewToLegacyDeviceIndex();
  console.log('[1b] Índice de dispositivos listo.');

  // 2) PERIODOS + BAJAS
  console.log('\n[2/4] Creando periodos y bajas desde User.hiringPeriods…');
  let totalUsersScanned = 0, usersProcessed = 0, periodsCreated = 0, leavesCreated = 0, errors = 0;

  // Cursor de usuarios con hiringPeriods
  let uq = User.find({ hiringPeriods: { $exists: true, $ne: [] } }, { _id: 1 }).lean();
  if (userLimit > 0) uq = uq.limit(userLimit);
  const ucur = uq.cursor();

  for await (const u of ucur) {
    totalUsersScanned++;
    try {
      const res = await createFromUser(u._id);
      usersProcessed++;
      periodsCreated += res.periodsCreated;
      leavesCreated  += res.leavesCreated;

      if (usersProcessed % 200 === 0) {
        console.log(`[Periodos] Usuarios proc=${usersProcessed} | Periodos creados=${periodsCreated} | Bajas creadas=${leavesCreated}`);
      }
    } catch (e) {
      errors++;
      console.log(`[ERROR usuario ${String(u._id)}]`, e?.message || e);
    }
  }

  console.log('---- RESUMEN PERIODOS/BAJAS ----');
  console.table({ totalUsersScanned, usersProcessed, periodsCreated, leavesCreated, errors });

  // 3) REPAIR
  console.log('\n[3/4] Reparación final (dispositiveId / selectionProcess)…');
  const rep = await repairExistingPeriods({ apply });
  console.log('[Repair] Hecho.');

  // 4) Estado final
  const [fcDisp, fcPer, fcLev] = await Promise.all([
    Dispositive.countDocuments({}),
    Periods.countDocuments({}),
    Leaves.countDocuments({}),
  ]);
  console.log('\n==============================');
  console.log(' FIN MIGRACIÓN COMPLETA');
  console.log('==============================');
  console.table({
    dispositivesCreated: dispSummary.createdTotal,
    dispositivesUpdated: dispSummary.updatedTotal,
    usersProcessed,
    periodsCreated,
    leavesCreated,
    repairedUpdated: rep.updated,
    totals_Dispositive: fcDisp,
    totals_Periods: fcPer,
    totals_Leaves: fcLev,
  });

  return {
    dispositives: dispSummary,
    users: { totalUsersScanned, usersProcessed, periodsCreated, leavesCreated, errors },
    repair: rep,
    totals: { dispositives: fcDisp, periods: fcPer, leaves: fcLev },
  };
}





/* =========================================================
   OFERTAS: migración legacy device -> dispositive.newDispositiveId
========================================================= */

let _legacyToNewDeviceIds = null;
let _byProgramProvinceCache = null;

async function buildLegacyToNewDeviceIndex() {
  // Inverso del índice existente: Map(newId -> Set(legacyId)) -> Map(legacyId -> Set(newId))
  if (_legacyToNewDeviceIds) return _legacyToNewDeviceIds;
  const forward = await buildNewToLegacyDeviceIndex();
  const inverse = new Map();

  for (const [newId, legacySet] of forward.entries()) {
    for (const legacyId of legacySet) {
      const key = String(legacyId);
      if (!inverse.has(key)) inverse.set(key, new Set());
      inverse.get(key).add(String(newId));
    }
  }
  _legacyToNewDeviceIds = inverse;
  return inverse;
}

async function buildDispositiveByProgramProvinceIndex() {
  if (_byProgramProvinceCache) return _byProgramProvinceCache;

  const docs = await Dispositive.find({}, { _id: 1, program: 1, province: 1, name: 1 }).lean();
  const byPP = new Map();      // "programId:provinceId" -> [dispositiveId...]
  const byProgram = new Map(); // "programId" -> [dispositiveId...]

  for (const d of docs) {
    const pid = String(d.program || '');
    const pr  = String(d.province || '');
    const kPP = `${pid}:${pr}`;
    if (!byPP.has(kPP)) byPP.set(kPP, []);
    byPP.get(kPP).push(String(d._id));

    if (!byProgram.has(pid)) byProgram.set(pid, []);
    byProgram.get(pid).push(String(d._id));
  }

  _byProgramProvinceCache = { byPP, byProgram };
  return _byProgramProvinceCache;
}

// ---- helpers tolerantes a legacy ----
function getLegacyDeviceIdFromOffer(offer) {
  const id =
    offer?.dispositive?.dispositiveId || // legacy actual
    offer?.device ||                     // por si hay restos legacy
    offer?.dispositiveId ||              // por si alguna quedó a nivel raíz
    null;

  return id ? String(id) : null;
}

function getProgramProvinceFromOffer(offer) {
  const programId  = offer?.dispositive?.programId ? String(offer.dispositive.programId) : null;
  const provinceId = offer?.provinceId ? String(offer.provinceId) : null;
  return { programId, provinceId };
}

/**
 * Migrar ofertas para establecer dispositive.newDispositiveId.
 *
 * @param {Object} opts
 * @param {boolean} [opts.apply=false]       DRY RUN si false (no escribe)
 * @param {boolean} [opts.overwrite=false]   Reescribir aunque ya exista newDispositiveId
 * @param {boolean} [opts.unsetLegacy=false] Hacer $unset de 'dispositive.dispositiveId' tras migrar
 * @param {boolean|null} [opts.onlyActive=null] true/false para filtrar por active; null = sin filtro
 * @param {number} [opts.limit=0]            Límite de docs (debug)
 * @param {Object} [opts.manualMap={}]       Overrides: { legacyId: newDispositiveId } o { offerId: newDispositiveId }
 */
export async function migrateOffersNewDispositiveId({
  apply = false,
  overwrite = false,
  unsetLegacy = false,
  onlyActive = null,
  limit = 0,
  manualMap = {},
} = {}) {

  // Índices necesarios
  const [legacy2new, dispIdx] = await Promise.all([
    buildLegacyToNewDeviceIndex(),           // Map(legacyId -> Set(newId))
    buildDispositiveByProgramProvinceIndex() // { byPP, byProgram }
  ]);

  // Query base
  const match = {};
  if (!overwrite) {
    match.$or = [
      { 'dispositive.newDispositiveId': { $exists: false } },
      { 'dispositive.newDispositiveId': null }
    ];
  }
  if (onlyActive === true) match.active = true;
  if (onlyActive === false) match.active = false;

  let q = Offer.find(
    match,
    {
      _id: 1,
      active: 1,
      jobId: 1,
      provinceId: 1,
      // nested
      'dispositive.programId': 1,
      'dispositive.dispositiveId': 1,
      'dispositive.newDispositiveId': 1,
      // tolerancia legacy
      device: 1,
      dispositiveId: 1,
      functions: 1,
    }
  ).lean();
  if (limit > 0) q = q.limit(limit);

  const cursor = q.cursor();

  const updates = [];
  const stats = {
    dryRun: !apply,
    scanned: 0,
    alreadySet: 0,
    updated: 0,
    viaManualOfferId: 0,
    viaManualLegacyId: 0,
    viaLegacyMap: 0,
    viaProgramProvince: 0,
    viaProgramOnly: 0,
    ambiguousLegacy: 0,
    unresolved: 0,
    samplesAmbiguous: [],
    samplesUnresolved: [],
  };

  const samplePush = (arr, item, max = 10) => {
    if (arr.length < max) arr.push(item);
  };

  for await (const offer of cursor) {
    stats.scanned++;

    if (!overwrite && offer?.dispositive?.newDispositiveId) {
      stats.alreadySet++;
      continue;
    }

    let chosenNewId = null;
    const legacyId = getLegacyDeviceIdFromOffer(offer);
    const { programId, provinceId } = getProgramProvinceFromOffer(offer);

    // 0) Manual por offerId
    if (!chosenNewId && offer?._id && manualMap[String(offer._id)]) {
      chosenNewId = String(manualMap[String(offer._id)]);
      stats.viaManualOfferId++;
    }

    // 1) Manual por legacyId
    if (!chosenNewId && legacyId && manualMap[legacyId]) {
      chosenNewId = String(manualMap[legacyId]);
      stats.viaManualLegacyId++;
    }

    // 2) Mapa inverso legacy -> new
    if (!chosenNewId && legacyId && legacy2new.has(legacyId)) {
      const candidates = Array.from(legacy2new.get(legacyId));
      if (candidates.length === 1) {
        chosenNewId = candidates[0];
        stats.viaLegacyMap++;
      } else if (candidates.length > 1) {
        stats.ambiguousLegacy++;
        samplePush(stats.samplesAmbiguous, {
          offerId: String(offer._id),
          legacyId,
          candidateNewIds: candidates,
        });
      }
    }

    // 3) (programId, provinceId) -> único dispositive
    if (!chosenNewId && programId && provinceId) {
      const key = `${programId}:${provinceId}`;
      const arr = dispIdx.byPP.get(key) || [];
      if (arr.length === 1) {
        chosenNewId = arr[0];
        stats.viaProgramProvince++;
      }
    }

    // 4) Solo programId -> único dispositive en programa
    if (!chosenNewId && programId) {
      const arr = dispIdx.byProgram.get(String(programId)) || [];
      if (arr.length === 1) {
        chosenNewId = arr[0];
        stats.viaProgramOnly++;
      }
    }

    if (!chosenNewId) {
      stats.unresolved++;
      samplePush(stats.samplesUnresolved, {
        offerId: String(offer._id),
        legacyId: legacyId || null,
        programId: programId || null,
        provinceId: provinceId || null,
        reason: legacyId ? 'legacy sin match unívoco' : 'faltan datos (program/province)',
      });
      continue;
    }

    updates.push({
      updateOne: {
        filter: { _id: offer._id },
        update: {
          $set: { 'dispositive.newDispositiveId': toId(chosenNewId) },
          ...(unsetLegacy ? { $unset: { 'dispositive.dispositiveId': "" } } : {}),
        },
      },
    });
  }

  console.log('---- RESUMEN migrateOffersNewDispositiveId ----');
  console.table({
    dryRun: stats.dryRun,
    scanned: stats.scanned,
    alreadySet: stats.alreadySet,
    toUpdate: updates.length,
    viaManualOfferId: stats.viaManualOfferId,
    viaManualLegacyId: stats.viaManualLegacyId,
    viaLegacyMap: stats.viaLegacyMap,
    viaProgramProvince: stats.viaProgramProvince,
    viaProgramOnly: stats.viaProgramOnly,
    ambiguousLegacy: stats.ambiguousLegacy,
    unresolved: stats.unresolved,
  });

  if (stats.samplesAmbiguous.length) {
    console.log('Ejemplos AMBIGUOS (legacy -> múltiples new):', stats.samplesAmbiguous.slice(0, 10));
  }
  if (stats.samplesUnresolved.length) {
    console.log('Ejemplos SIN RESOLVER:', stats.samplesUnresolved.slice(0, 10));
  }

  if (!updates.length) return { ...stats, updated: 0 };

  if (!apply) {
    console.log(`DRY_RUN activo. Se harían ${updates.length} updates en Offer, pero no se aplican.`);
    return { ...stats, updated: 0 };
  }

  const res = await Offer.bulkWrite(updates, { ordered: false });
  const modified = res?.modifiedCount ?? res?.result?.nModified ?? 0;
  stats.updated = modified;
  console.log(`[Offers] Cambios aplicados: ${modified}`);
  return stats;
}

// Sustituye normalizeTwo por un canonizador estricto (no derriba norte/sur)
const GENDER_SLASH = /(\p{L}+?)\/[ao]s?\b/giu;

// Reemplaza tus normalizadores por este:
function canon(s) {
  return (s ?? '')
    .toString()
    .trim()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // quita acentos
    .toLowerCase()
    .replace(/[\/\-_,.()]/g, ' ') // separadores → espacio
    .replace(/\s+/g, ' ')         // colapsa espacios
    .trim();
}
// NUEVO: aplanamos subcategorías (siempre) y opcionalmente añadimos el padre (para Provinces).
async function buildFlatIndex(Model, { includeParent = false } = {}) {
  const docs = await Model.find({}, { _id: 1, name: 1, subcategories: 1 }).lean();

  const idx = new Map();   // keyCanon -> _id
  const dupes = new Set(); // keys con más de un id

  const pushKey = (key, id) => {
    if (!key) return;
    const k = canon(key);
    if (!k) return;
    if (idx.has(k) && String(idx.get(k)) !== String(id)) dupes.add(k);
    idx.set(k, id);
  };

  for (const d of docs) {
    // subcategorías primero (clave para jobs y studies)
    if (Array.isArray(d.subcategories) && d.subcategories.length) {
      for (const sub of d.subcategories) {
        pushKey(sub.name, sub._id);
      }
      // Para Provinces, además indexamos el padre por su propio nombre
      if (includeParent) pushKey(d.name, d._id);
    } else {
      // Sin subcategorías → indexa el propio doc
      pushKey(d.name, d._id);
    }
  }

  return { idx, dupes };
}

function mapNamesToIds(names, idx, dupes) {
  const out = new Set();
  const unknown = [];
  const ambiguous = [];

  for (const raw of names || []) {
    const key = canon(raw);
    if (!key) continue;

    if (!idx.has(key)) {
      unknown.push(raw);
      continue;
    }
    if (dupes.has(key)) {
      ambiguous.push(raw);
      continue;
    }
    out.add(idx.get(key).toString());
  }

  return {
    ids: Array.from(out).map((id) => new mongoose.Types.ObjectId(id)),
    unknown,
    ambiguous,
  };
}


export async function migrateUserCvNameFieldsToRefs({
  apply = false,
  unsetLegacy = false,
  limit = 0,
  useNative = false, // ← por defecto, usa Mongoose (no driver nativo)
} = {}) {
  // Jobs y Studies: SIEMPRE subcategorías.
  // Provinces: subcategorías si existen + (opcional) padre (útil para provincias sin subcats).
  const [
    { idx: jobsIdx,    dupes: jobsDup },
    { idx: studiesIdx, dupes: studiesDup },
    { idx: provIdx,    dupes: provDup },
  ] = await Promise.all([
    buildFlatIndex(Jobs,    { includeParent: false }),
    buildFlatIndex(Studies, { includeParent: false }),
    buildFlatIndex(Provinces, { includeParent: true }), // ej. "Granada" sin subcats
  ]);

  let q = UserCv.find(
    {},
    { _id: 1, jobs: 1, studies: 1, provinces: 1, jobsId: 1, studiesId: 1, provincesId: 1 }
  ).lean();
  if (limit > 0) q = q.limit(limit);

  const cursor = q.cursor();

  const stats = {
    dryRun: !apply,
    scanned: 0,
    toUpdate: 0,
    updated: 0,
    unknown: { jobs: 0, studies: 0, provinces: 0 },
    ambiguous: { jobs: 0, studies: 0, provinces: 0 },
    examplesUnknown: { jobs: new Set(), studies: new Set(), provinces: new Set() },
    examplesAmbiguous: { jobs: new Set(), studies: new Set(), provinces: new Set() },
  };

  // Si prefieres Mongoose, mantenemos ambas rutas (set por defecto a Mongoose):
  const col = mongoose.connection.collection('usercvs');

  for await (const doc of cursor) {
    stats.scanned++;

    const { ids: jobsId,    unknown: uJ, ambiguous: aJ } = mapNamesToIds(doc.jobs,     jobsIdx,    jobsDup);
    const { ids: studiesId, unknown: uS, ambiguous: aS } = mapNamesToIds(doc.studies,  studiesIdx, studiesDup);
    const { ids: provincesId, unknown: uP, ambiguous: aP } = mapNamesToIds(doc.provinces, provIdx,   provDup);

    stats.unknown.jobs += uJ.length;        uJ.slice(0, 5).forEach(x => stats.examplesUnknown.jobs.add(x));
    stats.unknown.studies += uS.length;     uS.slice(0, 5).forEach(x => stats.examplesUnknown.studies.add(x));
    stats.unknown.provinces += uP.length;   uP.slice(0, 5).forEach(x => stats.examplesUnknown.provinces.add(x));

    stats.ambiguous.jobs += aJ.length;      aJ.slice(0, 5).forEach(x => stats.examplesAmbiguous.jobs.add(x));
    stats.ambiguous.studies += aS.length;   aS.slice(0, 5).forEach(x => stats.examplesAmbiguous.studies.add(x));
    stats.ambiguous.provinces += aP.length; aP.slice(0, 5).forEach(x => stats.examplesAmbiguous.provinces.add(x));

    const needUpdate =
      (jobsId.length      && (!doc.jobsId      || doc.jobsId.length      !== jobsId.length)) ||
      (studiesId.length   && (!doc.studiesId   || doc.studiesId.length   !== studiesId.length)) ||
      (provincesId.length && (!doc.provincesId || doc.provincesId.length !== provincesId.length));

    if (!needUpdate) continue;
    stats.toUpdate++;

    const update = { $set: { jobsId, studiesId, provincesId } };

    if (apply) {
      if (useNative) {
        await col.updateOne({ _id: doc._id }, update);
      } else {
        // Con Mongoose. Si tus campos jobsId/studiesId/provincesId aún no están en el schema,
        // añade { strict: false } o declara temporalmente esos paths en el schema.
        await UserCv.updateOne({ _id: doc._id }, update, { strict: false });
      }
      stats.updated++;
    }
  }

  console.log('==== MIGRACIÓN UserCv (names -> refs) ====');
  console.table({
    dryRun: stats.dryRun,
    scanned: stats.scanned,
    toUpdate: stats.toUpdate,
    updated: stats.updated,
    unknownJobs: stats.unknown.jobs,
    unknownStudies: stats.unknown.studies,
    unknownProvinces: stats.unknown.provinces,
    ambiguousJobs: stats.ambiguous.jobs,
    ambiguousStudies: stats.ambiguous.studies,
    ambiguousProvinces: stats.ambiguous.provinces,
  });

  const showSet = (s) => Array.from(s).slice(0, 10);
  console.log('Ejemplos UNKNOWN:', {
    jobs: showSet(stats.examplesUnknown.jobs),
    studies: showSet(stats.examplesUnknown.studies),
    provinces: showSet(stats.examplesUnknown.provinces),
  });
  console.log('Ejemplos AMBIGUOUS:', {
    jobs: showSet(stats.examplesAmbiguous.jobs),
    studies: showSet(stats.examplesAmbiguous.studies),
    provinces: showSet(stats.examplesAmbiguous.provinces),
  });

  if (apply && unsetLegacy) {
    const unsetUpdate = { $unset: { jobs: "", studies: "", provinces: "" } };
    if (useNative) {
      const res = await col.updateMany({}, unsetUpdate);
      console.log(`[CLEANUP] Legacy fields removed:`, res.modifiedCount);
    } else {
      await UserCv.updateMany({}, unsetUpdate, { strict: false });
      console.log(`[CLEANUP] Legacy string fields removed`);
    }
  }

  return stats;
}
