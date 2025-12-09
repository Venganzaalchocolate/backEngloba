// controllers/userChangeRequestController.js
"use strict";

/**
 * Controlador: UserChangeRequest (datos de usuario + documentos complementarios)
 * -----------------------------------------------------------------------------
 * Endpoints (sugeridos):
 *  POST /createchangerequest       -> postCreateChangeRequest (trabajador)
 *  POST /getmychangerequest        -> getMyChangeRequests (trabajador)
 *  POST /getpendingrequest         -> getPendingChangeRequests (supervisor)
 *  POST /approvechangerequest      -> postApproveChangeRequest (supervisor)
 *  POST /rejectchangerequest       -> postRejectChangeRequest  (supervisor)
 *  POST /cancelchangerequest       -> postCancelChangeRequest  (trabajador)
 *
 * Notas:
 * - Para /createchangerequest usa multer .array('uploads', 10) para recibir PDFs opcionales.
 * - Los ficheros subidos quedan en una carpeta temporal de Drive. Al aprobar, se “adoptan”
 *   creando su Filedrive y enlazándolos al User. En este controlador NO se mueven de carpeta;
 *   si necesitas mover/renombrar en Drive, expón un helper y añádelo (ver comentarios).
 */

const mongoose = require("mongoose");
const { User, UserChangeRequest, Filedrive } = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const { validateRequiredFields } = require("../utils/utils");

// Helpers de Drive disponibles en tu googleController:
const {
  uploadFileToDrive,   // (file, folderId, driveName, resumable?) => { id }
  deleteFileById,      // (fileId) => { success: true/false }
  // Si más adelante expones helpers para mover/renombrar o “adoptar”:
  // moveDriveFile,
  // adoptDriveFileIntoFiledrive,
} = require("./googleController");
const { notifyDeviceManagersOfChangeRequest } = require("./emailControllerGoogle");

// Carpetas de Drive (env)
const PENDING_FOLDER = process.env.GOOGLE_DRIVE_FILES_TEMPORALES;
// Opcional si luego mueves a definitiva:
// const FINAL_FOLDER   = process.env.GOOGLE_DRIVE_FILES;

/* ============================================================================
 * UTILIDADES (paths, validaciones y normalización)
 * ==========================================================================*/

// Campos auto-editables por el trabajador (lado servidor)
const SELF_EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "dni",
  "birthday",
  "email_personal",
  "socialSecurityNumber",
  "bankAccountNumber",
  "phone",
  "phoneJob.number",
  "phoneJob.extension",
  "gender",
  "fostered",
  "apafa",
  "consetmentDataProtection",
  "disability.percentage",
  "disability.notes",
  "studies",
];

// ⬇️ SUSTITUYE estas constantes por estas (evita el hardcode y añade log)
const CR_EMAILS_ENABLED = (process.env.CR_EMAILS_ENABLED ?? '1') !== '0'; // ON por defecto
const MAIL_TEST_TO      =  process.env.MAIL_TEST_TO || null;
const APP_BASE_URL      = process.env.APP_BASE_URL || 'https://app.engloba.org.es';

const toObjectId = (id, fieldName) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ClientError(`"${fieldName}" no es un ObjectId válido`, 400);
  }
  return new mongoose.Types.ObjectId(id);
};

const normalizeTimeOffEntry = (raw) => {
  if (!raw || !raw.date) {
    throw new ClientError('Cada entrada debe incluir "date" y "hours"', 400);
  }

  const d = new Date(raw.date);
  if (Number.isNaN(d.getTime())) {
    throw new ClientError("Fecha de día no válida", 400);
  }

  const h = Number(raw.hours);
  if (Number.isNaN(h) || h < 0) {
    throw new ClientError("Las horas deben ser un número mayor o igual que 0", 400);
  }

  return { date: d, hours: h };
};

const normalizeDni = (dni) =>
  String(dni).replace(/\s+/g, "").trim().toUpperCase();

const toTitleCase = (str = "") =>
  String(str)
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

    const toYMD = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  // siempre comparamos por YYYY-MM-DD en UTC
  return dt.toISOString().slice(0, 10);
};
// get/set de rutas con dot-notation (sin lodash)
const getByPath = (obj, path) => {
  if (!path) return undefined;
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
};
const setByPath = (obj, path, value) => {
  const keys = path.split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cursor[k] || typeof cursor[k] !== "object") cursor[k] = {};
    cursor = cursor[k];
  }
  cursor[keys[keys.length - 1]] = value;
};

// Normalización de valores propuestos coherente con tu UserSchema
const normalizeValue = (path, value) => {
  if (path === "birthday") {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
      throw new ClientError("Fecha de nacimiento no válida", 400);
    return d;
  }

  if (["fostered", "apafa", "consetmentDataProtection"].includes(path)) {
    if (value === "si") return true;
    if (value === "no") return false;
    return !!value;
  }

  if (path === "dni") return normalizeDni(value);
  if (path === "firstName") return toTitleCase(value);
  if (path === "lastName") return toTitleCase(value);
  if (path === "email_personal") return String(value || "").toLowerCase();

  if (path === "disability.percentage") {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    if (Number.isNaN(n)) throw new ClientError("% Discapacidad no numérico", 400);
    return n;
  }

  if (path === "studies") {
    if (!Array.isArray(value)) return [];
    return value.map((v) => toObjectId(v, "studies[]"));
  }

  return value;
};

const inferType = (path, v) => {
  if (path === "birthday") return "date";
  if (path === "studies") return "objectId[]";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (Array.isArray(v)) return "array";
  return "string";
};

// Construye cambios seguros: from (servidor) + to (normalizado)
const buildSafeChanges = (userDoc, rawChanges) => {
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    throw new ClientError(
      'El array "changes" es requerido y no puede estar vacío',
      400
    );
  }

  return rawChanges.map((c) => {
    if (!c?.path) throw new ClientError("Cada cambio debe incluir 'path'", 400);
    if (!SELF_EDITABLE_FIELDS.includes(c.path)) {
      throw new ClientError(`Campo no permitido: ${c.path}`, 400);
    }
    const from = getByPath(userDoc, c.path);
    const to = normalizeValue(c.path, c.to);
    const type = c.type || inferType(c.path, to);
    return { path: c.path, from, to, type };
  });
};

// Construir objeto $set con dot-paths
const buildSetObject = (changes) => {
  const $set = {};
  for (const c of changes) setByPath($set, c.path, c.to);
  return $set;
};

/* ============================================================================
 * CONTROLADORES
 * ==========================================================================*/

/**
 * Crear solicitud con cambios y/o ficheros
 * body:  { userId, approverId?, note?, changes?: [{path,to}], uploadsMeta?: [{category,date,description}] }
 * files: req.files[] (campo 'uploads')
 *
 * IMPORTANTE en rutas:
 *   router.post('/createchangerequest', upload.array('uploads', 10), postCreateChangeRequest);
 */
const postCreateChangeRequest = async (req, res) => {

  const rawChanges = typeof req.body.changes === 'string'
    ? JSON.parse(req.body.changes)
    : (Array.isArray(req.body.changes) ? req.body.changes : []);

  const uploadsMeta = typeof req.body.uploadsMeta === 'string'
    ? JSON.parse(req.body.uploadsMeta)
    : (Array.isArray(req.body.uploadsMeta) ? req.body.uploadsMeta : []);

  validateRequiredFields(req.body, ["userId"]);

  const userId = toObjectId(req.body.userId, "userId");
  const approverId = req.body.approverId
    ? toObjectId(req.body.approverId, "approverId")
    : null;
  const note = req.body.note || "";


  const metaList = Array.isArray(req.body.uploadsMeta) ? req.body.uploadsMeta : [];
  const files = Array.isArray(req.files) ? req.files : [];
  if (rawChanges.length === 0 && files.length === 0) {
    throw new ClientError("Debes enviar al menos un cambio o un archivo", 400);
  }

  // Snapshot seguro para 'from'
  const userDoc = await User.findById(userId).lean();
  if (!userDoc) throw new ClientError("Usuario no encontrado", 404);
  const safeChanges = rawChanges.length ? buildSafeChanges(userDoc, rawChanges) : [];


  // Subir archivos a carpeta temporal y construir uploads[]
  const uploads = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const meta = uploadsMeta[i] || {};
    const driveName = `${userId}-${Date.now()}-${i}`;
    const up = await uploadFileToDrive(f, PENDING_FOLDER, driveName, false);
    if (!up?.id) throw new ClientError("Error subiendo archivo temporal a Drive", 500);

    const isOfficial = !!meta.originDocumentation;

    uploads.push({
      type: isOfficial ? "user-official-doc" : "user-extra-doc",
      originDocumentation: isOfficial ? new mongoose.Types.ObjectId(meta.originDocumentation) : undefined,

      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,

      category: meta.category || (isOfficial ? "Oficial" : "Varios"),
      date: meta.date ? new Date(meta.date) : undefined,

      // ⬇️ Para oficiales, ignoramos cualquier label/description aportado por el cliente
      description: isOfficial ? undefined : (meta.description || meta.labelFile || f.originalname),
      labelFile: isOfficial ? "" : (meta.labelFile || ""),

      tempDriveId: up.id,
      tempFolderId: PENDING_FOLDER,
    });
  }

  const created = await UserChangeRequest.create({
    userId,
    submittedBy: userId,
    approverId,
    status: "pending",
    changes: safeChanges,
    uploads,
    note,
    submittedAt: new Date(),
  });

  
if (CR_EMAILS_ENABLED && typeof notifyDeviceManagersOfChangeRequest === 'function') {

  setImmediate(() => {
    notifyDeviceManagersOfChangeRequest({
      requestId: created._id,
      actionUrl: `${APP_BASE_URL}`,
      testEmail: MAIL_TEST_TO || undefined,  // si existe, solo envía ahí
      throwOnError: false,                   // nunca rompe el flujo
      logger: console,
    })
    .catch(err => console.error('[CR_EMAILS] notify UNHANDLED error:', err));
  });
} else {
  console.log('[CR_EMAILS] notify SKIPPED. Enabled?', CR_EMAILS_ENABLED,
              'function?', typeof notifyDeviceManagersOfChangeRequest);
}

  response(res, 200, created);

};

/**
 * Listar solicitudes del trabajador
 * body: { userId, status? }
 */
const getMyChangeRequests = async (req, res) => {
  validateRequiredFields(req.body, ["userId"]);
  const userId = toObjectId(req.body.userId, "userId");

  const filter = { userId };
  if (req.body.status) filter.status = req.body.status;

  const data = await UserChangeRequest.find(filter)
    .sort({ submittedAt: -1 })
    .lean();

  response(res, 200, { data });
};

/**
 * Listar pendientes (bandeja del responsable)
 * body: { approverId? }
 */
const getPendingChangeRequests = async (req, res) => {
  const filter = { status: "pending" };
  if (req.body.approverId) {
    filter.approverId = toObjectId(req.body.approverId, "approverId");
  }

  const data = await UserChangeRequest.find(filter)
    .sort({ submittedAt: 1 })
    .lean();

  response(res, 200, { data });
};

/**
 * Aprobar solicitud:
 * - Check de conflicto (si enabled)
 * - Aplica cambios al User (TX)
 * - “Adopta” uploads creando Filedrive y enlazando a User (TX)
 *
 * body: { requestId, approverId, note? }
 *
 * NOTA: Aquí no movemos los archivos de la carpeta temporal.
 * Si quieres mover/renombrar también en Drive:
 *   1) expón moveDriveFile() en tu googleController
 *   2) llámalo antes/ después de crear el Filedrive (no fallar toda la aprobación si el move falla).
 */


/**
 * Rechazar solicitud
 * - Elimina archivos temporales en Drive
 * - Marca status + decision
 *
 * body: { requestId, approverId, note? }
 */
const postRejectChangeRequest = async (req, res) => {
  validateRequiredFields(req.body, ["requestId", "approverId"]);
  const requestId = toObjectId(req.body.requestId, "requestId");
  const approverId = toObjectId(req.body.approverId, "approverId");
  const note = req.body.note || "";

  const reqDoc = await UserChangeRequest.findById(requestId);
  if (!reqDoc) throw new ClientError("Solicitud no encontrada", 404);
  if (reqDoc.status !== "pending") {
    throw new ClientError("La solicitud no está pendiente", 400);
  }
  if (reqDoc.approverId && String(reqDoc.approverId) !== String(approverId)) {
    throw new ClientError("No autorizado para rechazar esta solicitud", 403);
  }

  // Limpiar temporales en Drive (best-effort)
  for (const up of reqDoc.uploads || []) {
    if (up.tempDriveId) {
      await deleteFileById(up.tempDriveId).catch(() => { });
    }
  }

  reqDoc.status = "rejected";
  reqDoc.decision = {
    decidedBy: approverId,
    decidedAt: new Date(),
    note,
  };
  await reqDoc.save();
  const updatedUser = await User.findById(reqDoc.userId)
    .populate("files.filesId")
    .lean();
  response(res, 200, updatedUser);
};

/**
 * Cancelar solicitud (propietario):
 * - Elimina archivos temporales en Drive
 * - Marca como cancelled
 *
 * body: { requestId, userId }
 */
const postCancelChangeRequest = async (req, res) => {
  validateRequiredFields(req.body, ["requestId", "userId"]);
  const requestId = toObjectId(req.body.requestId, "requestId");
  const userId = toObjectId(req.body.userId, "userId");

  const reqDoc = await UserChangeRequest.findById(requestId);
  if (!reqDoc) throw new ClientError("Solicitud no encontrada", 404);
  if (String(reqDoc.userId) !== String(userId)) {
    throw new ClientError("No autorizado para cancelar esta solicitud", 403);
  }
  if (reqDoc.status !== "pending") {
    throw new ClientError("Solo se pueden cancelar solicitudes pendientes", 400);
  }

  for (const up of reqDoc.uploads || []) {
    if (up.tempDriveId) {
      await deleteFileById(up.tempDriveId).catch(() => { });
    }
  }

  reqDoc.status = "cancelled";
  await reqDoc.save();

  response(res, 200, { ok: true });
};

//vacaciones y asuntos propios
/**
 * Crear solicitud de vacaciones / asuntos propios
 * body: { userId, approverId?, type, entries: [{ date, hours }], note? }
 *    type: "vacation" | "personal"
 */
const postCreateTimeOffChangeRequest = async (req, res) => {
  validateRequiredFields(req.body, ["userId", "type", "entries"]);

  const userId = toObjectId(req.body.userId, "userId");
  const approverId = req.body.approverId
    ? toObjectId(req.body.approverId, "approverId")
    : null;
  const type = req.body.type;
  const note = req.body.note || "";

  if (!["vacation", "personal"].includes(type)) {
    throw new ClientError('El tipo debe ser "vacation" o "personal"', 400);
  }

  const rawEntries =
    typeof req.body.entries === "string"
      ? JSON.parse(req.body.entries)
      : req.body.entries;

  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new ClientError(
      'El array "entries" es requerido y no puede estar vacío',
      400
    );
  }

  const entries = rawEntries.map(normalizeTimeOffEntry);

  // ====== BLOQUEO DE SOLAPES SOLO CON PENDIENTES ======
  const newDays = new Set(
    entries
      .map((e) => toYMD(e.date))
      .filter(Boolean)
  );

  const existingReqs = await UserChangeRequest.find({
    userId,
    status: "pending",               // 👈 solo pendientes
    "timeOff.entries.0": { $exists: true },
  }).lean();

  const takenDays = new Set();
  for (const r of existingReqs) {
    for (const e of r.timeOff?.entries || []) {
      const d = toYMD(e.date);
      if (d) takenDays.add(d);
    }
  }

  const conflicts = [];
  for (const d of newDays) {
    if (takenDays.has(d)) conflicts.push(d);
  }

  if (conflicts.length) {
    const first = conflicts[0];
    const firstEs = new Date(first).toLocaleDateString("es-ES");
    throw new ClientError(
      `Ya tienes una solicitud pendiente de días (vacaciones o asuntos propios) que incluye el ${firstEs}. ` +
        `Debes cancelar o modificar esa solicitud antes de volver a pedir ese día.`,
      400
    );
  }
  // ====== FIN BLOQUEO SOLAPES ======

  const userDoc = await User.findById(userId).lean();
  if (!userDoc) throw new ClientError("Usuario no encontrado", 404);

  const created = await UserChangeRequest.create({
    userId,
    submittedBy: userId,
    approverId,
    status: "pending",
    changes: [],
    uploads: [],
    timeOff: {
      kind: type,
      entries,
    },
    note,
    conflictCheckEnabled: false,
    submittedAt: new Date(),
  });

  if (CR_EMAILS_ENABLED && typeof notifyDeviceManagersOfChangeRequest === "function") {
    setImmediate(() => {
      notifyDeviceManagersOfChangeRequest({
        requestId: created._id,
        actionUrl: `${APP_BASE_URL}`,
        testEmail: MAIL_TEST_TO || undefined,
        throwOnError: false,
        logger: console,
      }).catch((err) =>
        console.error("[CR_EMAILS] notify UNHANDLED error (timeOff):", err)
      );
    });
  }

  response(res, 200, created);
};



const postApproveChangeRequest = async (req, res) => {
  validateRequiredFields(req.body, ["requestId", "approverId"]);

  const requestId  = toObjectId(req.body.requestId, "requestId");
  const approverId = toObjectId(req.body.approverId, "approverId");
  const note       = req.body.note || "";

  let updatedUserId = null;

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const reqDoc = await UserChangeRequest.findById(requestId).session(session);
    if (!reqDoc) throw new ClientError("Solicitud no encontrada", 404);
    if (reqDoc.status !== "pending") {
      throw new ClientError("La solicitud no está pendiente", 400);
    }
    if (reqDoc.approverId && String(reqDoc.approverId) !== String(approverId)) {
      throw new ClientError("No autorizado para aprobar esta solicitud", 403);
    }

    const user = await User.findById(reqDoc.userId).session(session);
    if (!user) throw new ClientError("Usuario no encontrado", 404);

    // 1) Comprobación de conflicto (solo para cambios de datos)
    if (reqDoc.conflictCheckEnabled && Array.isArray(reqDoc.changes)) {
      for (const c of reqDoc.changes) {
        const current = getByPath(user, c.path);
        const same =
          JSON.stringify(current ?? null) === JSON.stringify(c.from ?? null);
        if (!same) {
          reqDoc.status = "stale";
          reqDoc.decision = {
            decidedBy: approverId,
            decidedAt: new Date(),
            note: "Conflicto: el dato cambió antes de aprobar",
          };
          await reqDoc.save({ session });
          throw new ClientError(
            "Conflicto de concurrencia: los datos actuales no coinciden",
            409
          );
        }
      }
    }

    // 2) Aplicar cambios de perfil al User (si los hay)
    if (Array.isArray(reqDoc.changes) && reqDoc.changes.length) {
      const $set = buildSetObject(reqDoc.changes);
      try {
        await User.updateOne(
          { _id: user._id },
          { $set },
          { session, runValidators: true }
        );
      } catch (e) {
        // Registrar fallo y abortar
        reqDoc.status = "failed";
        reqDoc.error = e?.message || "Error al aplicar cambios";
        reqDoc.decision = {
          decidedBy: approverId,
          decidedAt: new Date(),
          note: note || "Fallo al aplicar",
        };
        await reqDoc.save({ session });

        if (e?.code === 11000) {
          throw new ClientError(
            "No se pudo aplicar por conflicto de unicidad (dato duplicado).",
            400
          );
        }
        throw new ClientError("Error al aplicar cambios", 500);
      }
    }

    // 3) Adoptar uploads -> Filedrive + enlazar a User (si los hay)
    if (Array.isArray(reqDoc.uploads) && reqDoc.uploads.length) {
      for (const up of reqDoc.uploads) {
        if (!up.tempDriveId) continue;

        const display = up.labelFile || up.description || up.originalName;

        let filePayload = {
          originModel: "User",
          idModel: user._id,
          idDrive: up.tempDriveId,
          date: up.date || undefined,
          description: up.description || display,
        };

        if (up.originDocumentation) {
          filePayload.originDocumentation = up.originDocumentation;
        } else {
          filePayload.fileName  = display;
          filePayload.fileLabel = display;
          filePayload.category  = up.category || "Varios";
        }

        const fileDoc = await new Filedrive(filePayload).save({ session });

        await User.updateOne(
          { _id: user._id },
          { $push: { files: { filesId: fileDoc._id } } },
          { session }
        );

        up.finalizedFileId = fileDoc._id;
        up.finalizedAt = new Date();
      }
    }

 // 4) Aplicar timeOff (vacaciones / asuntos propios) si existe
// 4) Aplicar timeOff (vacaciones / asuntos propios) si existe
if (
  reqDoc.timeOff &&
  Array.isArray(reqDoc.timeOff.entries) &&
  reqDoc.timeOff.entries.length
) {
  // Entradas a aplicar: override del responsable (si viene) o las originales
  const bodyOverride = req.body.timeOffOverride;
  const entriesToApply = (
    bodyOverride &&
    bodyOverride.kind === reqDoc.timeOff.kind &&
    Array.isArray(bodyOverride.entries) &&
    bodyOverride.entries.length
  )
    ? bodyOverride.entries
    : reqDoc.timeOff.entries;

  const kind = reqDoc.timeOff.kind; // "vacation" | "personal"
  const targetField = kind === "vacation" ? "vacationHours" : "personalHours";
  const otherField  = kind === "vacation" ? "personalHours" : "vacationHours";

  // Cargar usuario fresco con los campos de horas dentro de la misma sesión
  const freshUser = await User.findById(user._id)
    .select(`${targetField} ${otherField}`)
    .session(session);

  const existingTarget = Array.isArray(freshUser[targetField])
    ? freshUser[targetField]
    : [];
  const existingOther = Array.isArray(freshUser[otherField])
    ? freshUser[otherField]
    : [];

  const toKey = (d) => new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD

  // Map para evitar duplicados en el tipo actual (vac/personal)
  const targetMap = new Map();
  for (const e of existingTarget) {
    if (!e?.date) continue;
    targetMap.set(toKey(e.date), { date: e.date, hours: Number(e.hours) || 0 });
  }

  // "other" se filtrará: cualquier día que entre en esta aprobación
  const applyKeys = new Set(
    entriesToApply
      .filter((e) => e?.date)
      .map((e) => toKey(e.date))
  );

  const newOther = existingOther.filter((e) => {
    if (!e?.date) return false;
    const k = toKey(e.date);
    // si este día se encuentra ahora en esta aprobación, lo quitamos del otro tipo
    return !applyKeys.has(k);
  });

  // Aplicar overrides en el tipo actual
  for (const e of entriesToApply) {
    if (!e?.date) continue;
    const k = toKey(e.date);
    let h = Number(e.hours);
    if (!Number.isFinite(h) || h < 0) h = 0;

    if (h <= 0) {
      // horas 0 => eliminar ese día del tipo actual
      targetMap.delete(k);
      continue;
    }

    targetMap.set(k, { date: new Date(e.date), hours: h });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        [targetField]: Array.from(targetMap.values()),
        [otherField]: newOther,
      },
    },
    { session }
  );
}


    // 5) Cerrar solicitud como aprobada
    reqDoc.status = "approved";
    reqDoc.decision = {
      decidedBy: approverId,
      decidedAt: new Date(),
      note: note || "",
    };
    reqDoc.appliedAt = new Date();
    await reqDoc.save({ session });

    updatedUserId = user._id;
  });

  // Devolver el User actualizado (para refrescar UI)
  const updatedUser = await User.findById(updatedUserId)
    .populate("files.filesId")
    .lean();

  response(res, 200, updatedUser);
};

/* ============================================================================
 * EXPORTS
 * ==========================================================================*/

module.exports = {
  postCreateChangeRequest: catchAsync(postCreateChangeRequest),
  getMyChangeRequests: catchAsync(getMyChangeRequests),
  getPendingChangeRequests: catchAsync(getPendingChangeRequests),
  postApproveChangeRequest: catchAsync(postApproveChangeRequest),
  postRejectChangeRequest: catchAsync(postRejectChangeRequest),
  postCancelChangeRequest: catchAsync(postCancelChangeRequest),
  postCreateTimeOffChangeRequest:catchAsync(postCreateTimeOffChangeRequest),
};
