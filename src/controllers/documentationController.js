const { Filedrive, UserChangeRequest, Documentation, Dispositive } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync, ClientError } = require('../utils/catchAsync');
const { response } = require('../utils/response');

const getDocumentation = async (req, res) => {

    const filesId = req.body.filesId;

    if (!Array.isArray(filesId)) {
      throw new ClientError('El dato debe ser una lista', 400);
    }
    if (filesId.length === 0) {
      throw new ClientError('La lista de ids no puede estar vacía.', 400);
    }
    filesId.forEach(id => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ClientError(`El id ${id} no es válido.`, 400);
      }
    });

    const objectIds = filesId.map(id => new mongoose.Types.ObjectId(id));
    const archivos = await Filedrive.find({ _id: { $in: objectIds } }).lean();

    response(res, 200, archivos);
 
};

const toId = (v) => new mongoose.Types.ObjectId(v);

// Normaliza Filedrive -> forma única para el front
const normalizeFiledrive = (docs = []) =>
  docs.map(d => ({
    _id: d._id,
    idDrive: d.idDrive,                                    // <- visor usa esto
    fileLabel: d.fileLabel || d.description || d.fileName, // etiqueta amigable
    fileName: d.fileName || d.fileLabel || d.description,
    category: d.category || 'Varios',
    date: d.date || d.createdAt || null,
    isTemp: false,
    source: 'filedrive',
  }));

// Normaliza uploads de ChangeRequest -> misma forma
const normalizeUploads = (uploads = []) =>
  uploads.map(u => ({
    _id: u.finalizedFileId || null,
    idDrive: u.finalizedFileId ? undefined : u.tempDriveId,
    fileLabel: u.labelFile || 'Documento',
    fileName: u.originalName || u.description || 'documento.pdf',
    category: u.category || (u.originDocumentation ? 'Oficial' : 'Varios'),
    date: u.date || null,
    isTemp: !u.finalizedFileId,
    source: u.finalizedFileId ? 'filedrive' : 'changerequest-temp',
    // ⬇️ NUEVO (para que el front sepa a qué doc oficial corresponde)
    originDocumentation: u.originDocumentation || null,
  }));

/**
 * POST /api/docs/unified
 * body: {
 *   filesId?: string[],           // opcional: IDs de Filedrive
 *   changeRequestId?: string      // opcional: ID de la solicitud para traer sus uploads
 * }
 */
const getDocumentationUnified = async (req, res) => {

         const { filesId, changeRequestId } = req.body || {};
  if ((!filesId || filesId.length === 0) && !changeRequestId) {
    throw new ClientError('Debes enviar "filesId" o "changeRequestId".', 400);
  }

  const out = [];

  // 1) Filedrive
  if (Array.isArray(filesId) && filesId.length) {
    filesId.forEach(id => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ClientError(`El id ${id} no es válido.`, 400);
      }
    });
    const docs = await Filedrive.find({
      _id: { $in: filesId.map(toId) }
    }).lean();

    out.push(...normalizeFiledrive(docs));
  }

  // 2) Uploads de ChangeRequest (temporales o finalizados)
  if (changeRequestId) {
    if (!mongoose.Types.ObjectId.isValid(changeRequestId)) {
      throw new ClientError('changeRequestId inválido', 400);
    }
    const cr = await UserChangeRequest.findById(changeRequestId).lean();
    if (!cr) throw new ClientError('Solicitud no encontrada', 404);

    // Nota: si alguna upload tiene finalizedFileId, puedes opcionalmente
    // resolver y mezclar su Filedrive para completar datos:
    // const finalizedIds = cr.uploads.filter(u => u.finalizedFileId).map(u => u.finalizedFileId);
    // const finalizedDocs = await Filedrive.find({ _id: { $in: finalizedIds } }).lean();
    // out.push(...normalizeFiledrive(finalizedDocs));

    // Y SIEMPRE añadir los “pendientes” (o también los finalizados a modo de historial):
    out.push(...normalizeUploads(cr.uploads || []));
  }
  // Si quieres, puedes eliminar duplicados por idDrive aquí
  response(res, 200, out);
};

const getDocumentationProgramDispositive = async (req, res) => {
  const { type, id } = req.body || {};

  // 🔹 Si estamos en un Programa → incluir tanto los docs de Program como los de Dispositive
  let filter;
  if (type === "Program") {
    filter = { model: { $in: ["Program", "Dispositive"] } };
  } else if (type === "Dispositive") {
    filter = { model: "Dispositive" };
  } else {
    filter = { model: { $in: ["Program", "Dispositive"] } };
  }

  const list = await Documentation.find(filter).lean();

  // 🔹 Documentación vinculada al id
  let linkedDocs = [];
  if (id) {
    const field =
      type === "Program"
        ? "programs"
        : type === "Dispositive"
        ? "dispositives"
        : null;

    if (field) {
      linkedDocs = await Documentation.find({ [field]: id }).lean();
    }
  }

  response(res, 200, { list, linkedDocs });
};


/**
 * Añade o quita documentación de programas o dispositivos.
 * Reglas:
 *  - Si el documento es de tipo Program → actúa solo sobre programId.
 *  - Si el documento es de tipo Dispositive:
 *     - si viene programId → aplica a todos los dispositivos de ese programa.
 *     - si viene dispositiveId → aplica solo a ese dispositivo.
 */
const addProgramOrDispositiveToDocumentation = async (req, res) => {
  const { documentationId, programId, dispositiveId, action } = req.body || {};

  if (!documentationId) return response(res, 400, { error: "Falta documentationId" });
  if (!["add", "remove"].includes(action)) {
    return response(res, 400, { error: "Acción inválida. Usa 'add' o 'remove'." });
  }

  const doc = await Documentation.findById(documentationId);
  if (!doc) return response(res, 404, { error: "Documento no encontrado" });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const update = {};
    const mode = action === "add" ? "$addToSet" : "$pull";

    // === 🔹 Caso 1: Añadir o quitar a un PROGRAMA ===
    if (programId) {
      if (!mongoose.isValidObjectId(programId))
        throw new ClientError("programId inválido", 400);

      // Si es documento de programa, solo lo añadimos a programs[]
      if (doc.model === "Program") {
        update[mode] = { programs: programId };
      }

      // Si es documento de dispositivo, lo aplicamos globalmente al programa
      else if (doc.model === "Dispositive") {
        update[mode] = { programs: programId };

        // Buscar todos los dispositivos del programa
        const dispositives = await Dispositive.find({ program: programId }, "_id").lean();
        const dispositiveIds = dispositives.map((d) => d._id);

        if (dispositiveIds.length > 0) {
          if (action === "add") {
            update["$addToSet"] = {
              ...update["$addToSet"],
              dispositives: { $each: dispositiveIds },
            };
          } else {
            update["$pull"] = {
              ...update["$pull"],
              dispositives: { $in: dispositiveIds },
            };
          }
        }
      }
    }

    // === 🔹 Caso 2: Añadir o quitar a un DISPOSITIVO individual ===
    else if (dispositiveId) {
      if (!mongoose.isValidObjectId(dispositiveId))
        throw new ClientError("dispositiveId inválido", 400);

      update[mode] = { dispositives: dispositiveId };
    }

    // === Ejecutar la actualización ===
    const updated = await Documentation.findByIdAndUpdate(
      documentationId,
      update,
      { new: true, session }
    ).lean();

    response(res, 200, updated);
  });

  session.endSession();
};



// ======================================================
// 📦 Sincronizar Documentación de Programa con sus Dispositivos
// ======================================================
const syncProgramDocsToDevices = async (req, res) => {
  const { programId, documentationId, action } = req.body || {};

  if (!programId || !documentationId)
    throw new ClientError("Faltan datos obligatorios", 400);
  if (!["add", "remove"].includes(action))
    throw new ClientError("Acción inválida", 400);

  // Buscar dispositivos asociados al programa
  const dispositives = await Dispositive.find({ program: programId }).select("_id name").lean();
  if (!dispositives.length) {
    return response(res, 200, { message: "El programa no tiene dispositivos asociados." });
  }

  // Actualizar el campo 'dispositives' en el documento de Documentation
  const update =
    action === "remove"
      ? { $pull: { dispositives: { $in: dispositives.map(d => d._id) } } }
      : { $addToSet: { dispositives: { $each: dispositives.map(d => d._id) } } };

  const updatedDoc = await Documentation.findByIdAndUpdate(
    documentationId,
    update,
    { new: true }
  ).lean();

  response(res, 200, {
    message:
      action === "remove"
        ? `Documento eliminado de ${dispositives.length} dispositivos.`
        : `Documento añadido a ${dispositives.length} dispositivos.`,
    updatedDoc,
  });
};


module.exports = {
    getDocumentation: catchAsync(getDocumentation),
    getDocumentationUnified:catchAsync(getDocumentationUnified),
    getDocumentationProgramDispositive:catchAsync(getDocumentationProgramDispositive),
    addProgramOrDispositiveToDocumentation:catchAsync(addProgramOrDispositiveToDocumentation),
    syncProgramDocsToDevices:catchAsync(syncProgramDocsToDevices)
  };
  