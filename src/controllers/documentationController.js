const { Filedrive, UserChangeRequest } = require('../models/indexModels');
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

module.exports = {
    getDocumentation: catchAsync(getDocumentation),
    getDocumentationUnified:catchAsync(getDocumentationUnified)
    
  };
  