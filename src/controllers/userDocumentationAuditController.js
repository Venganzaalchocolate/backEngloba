// controllers/userDocumentationAuditController.js
const mongoose = require('mongoose');
const { UserDocumentationAudit } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

// helper pequeño para validar ids
const toId = (v, fieldName = 'id') => {
  if (!v || !mongoose.Types.ObjectId.isValid(v)) {
    throw new ClientError(`${fieldName} no es un ObjectId válido`, 400);
  }
  return new mongoose.Types.ObjectId(v);
};

// ======================================================
// Registrar descarga de documento oficial
// Esto se llamará cuando el usuario descargue el documento
// que luego va a firmar con recibí.
// ======================================================
const registerDocumentationAuditDownload = async ({
  userId,
  documentationId,
  fileId = null,
  driveId = null,
  meta = null,
}) => {
  const userObjectId = toId(userId, 'userId');
  const documentationObjectId = toId(documentationId, 'documentationId');
  const fileObjectId = fileId ? toId(fileId, 'fileId') : null;

  const now = new Date();

  let audit = await UserDocumentationAudit.findOne({
    userId: userObjectId,
    documentationId: documentationObjectId,
  });

  if (!audit) {
    audit = await UserDocumentationAudit.create({
      userId: userObjectId,
      documentationId: documentationObjectId,
      assignedAt: now,
      firstDownloadedAt: now,
      lastDownloadedAt: now,
      downloadCount: 1,
      events: [
        {
          type: 'download',
          at: now,
          fileId: fileObjectId,
          driveId: driveId || null,
          meta: meta || null,
        },
      ],
    });

    return audit;
  }

  if (!audit.firstDownloadedAt) audit.firstDownloadedAt = now;
  audit.lastDownloadedAt = now;
  audit.downloadCount = (audit.downloadCount || 0) + 1;

  audit.events.push({
    type: 'download',
    at: now,
    fileId: fileObjectId,
    driveId: driveId || null,
    meta: meta || null,
  });

  await audit.save();
  return audit;
};

// ======================================================
// Registrar que se ha pedido firma del recibí
// No es obligatorio para bloquear o no, pero viene bien
// para trazabilidad completa.
// ======================================================
const registerDocumentationAuditSignRequest = async ({
  userId,
  documentationId,
  meta = null,
}) => {
  const userObjectId = toId(userId, 'userId');
  const documentationObjectId = toId(documentationId, 'documentationId');

  const now = new Date();

  let audit = await UserDocumentationAudit.findOne({
    userId: userObjectId,
    documentationId: documentationObjectId,
  });

  if (!audit) {
    audit = await UserDocumentationAudit.create({
      userId: userObjectId,
      documentationId: documentationObjectId,
      assignedAt: now,
      events: [
        {
          type: 'sign_request',
          at: now,
          meta: meta || null,
        },
      ],
    });

    return audit;
  }

  audit.events.push({
    type: 'sign_request',
    at: now,
    meta: meta || null,
  });

  await audit.save();
  return audit;
};

// ======================================================
// Registrar firma completada del recibí
// Aquí guardamos además el Filedrive/Drive del recibí generado.
// ======================================================
const registerDocumentationAuditSignComplete = async ({
  userId,
  documentationId,
  fileId,
  driveId,
  signedAt = new Date(),
  meta = null,
}) => {
  const userObjectId = toId(userId, 'userId');
  const documentationObjectId = toId(documentationId, 'documentationId');
  const fileObjectId = toId(fileId, 'fileId');

  let audit = await UserDocumentationAudit.findOne({
    userId: userObjectId,
    documentationId: documentationObjectId,
  });

  if (!audit) {
    audit = await UserDocumentationAudit.create({
      userId: userObjectId,
      documentationId: documentationObjectId,
      assignedAt: signedAt,
      acknowledged: true,
      acknowledgedAt: signedAt,
      receipts: [
        {
          fileId: fileObjectId,
          driveId,
          signedAt,
        },
      ],
      events: [
        {
          type: 'sign_complete',
          at: signedAt,
          fileId: fileObjectId,
          driveId: driveId || null,
          meta: meta || null,
        },
      ],
    });

    return audit;
  }

  audit.acknowledged = true;
  audit.acknowledgedAt = signedAt;

  audit.receipts.push({
    fileId: fileObjectId,
    driveId,
    signedAt,
  });

  audit.events.push({
    type: 'sign_complete',
    at: signedAt,
    fileId: fileObjectId,
    driveId: driveId || null,
    meta: meta || null,
  });

  await audit.save();
  return audit;
};

// ======================================================
// Saber si un usuario puede firmar un recibí.
// La regla ahora es simple:
// - si no hay ninguna descarga previa, no puede firmar.
// ======================================================
const canUserSignDocumentationReceipt = async ({ userId, documentationId }) => {
  const userObjectId = toId(userId, 'userId');
  const documentationObjectId = toId(documentationId, 'documentationId');

  const audit = await UserDocumentationAudit.findOne({
    userId: userObjectId,
    documentationId: documentationObjectId,
  }).lean();

  if (!audit) {
    return {
      ok: false,
      reason: 'NO_AUDIT',
      canSign: false,
      audit: null,
    };
  }

  if (!audit.downloadCount || audit.downloadCount < 1) {
    return {
      ok: false,
      reason: 'NO_DOWNLOAD',
      canSign: false,
      audit,
    };
  }

  return {
    ok: true,
    reason: null,
    canSign: true,
    audit,
  };
};

// ======================================================
// Obtener auditoría de un usuario para un documento
// ======================================================
const getDocumentationAuditByUserAndDocument = async (req, res) => {
  const { userId, documentationId } = req.body || {};

  const audit = await UserDocumentationAudit.findOne({
    userId: toId(userId, 'userId'),
    documentationId: toId(documentationId, 'documentationId'),
  })
    .populate('userId', 'firstName lastName dni')
    .populate('documentationId', 'name categoryFiles requiresSignature')
    .populate('receipts.fileId');

  response(res, 200, audit || null);
};

// ======================================================
// Obtener todas las auditorías de un usuario
// útil para panel o inspección
// ======================================================
const getDocumentationAuditsByUser = async (req, res) => {
  const { userId } = req.body || {};

  const audits = await UserDocumentationAudit.find({
    userId: toId(userId, 'userId'),
  })
    .populate('documentationId', 'name categoryFiles requiresSignature')
    .populate('receipts.fileId')
    .sort({ updatedAt: -1 });

  response(res, 200, { items: audits });
};

// ======================================================
// Endpoint para registrar descarga desde API
// ======================================================
const postRegisterDocumentationAuditDownload = async (req, res) => {
  const { userId, documentationId, fileId, driveId, meta } = req.body || {};

  const audit = await registerDocumentationAuditDownload({
    userId,
    documentationId,
    fileId,
    driveId,
    meta,
  });

  response(res, 200, audit);
};

// ======================================================
// Endpoint para registrar petición de firma
// ======================================================
const postRegisterDocumentationAuditSignRequest = async (req, res) => {
  const { userId, documentationId, meta } = req.body || {};

  const audit = await registerDocumentationAuditSignRequest({
    userId,
    documentationId,
    meta,
  });

  response(res, 200, audit);
};

// ======================================================
// Endpoint para registrar firma completada
// ======================================================
const postRegisterDocumentationAuditSignComplete = async (req, res) => {
  const { userId, documentationId, fileId, driveId, signedAt, meta } = req.body || {};

  const audit = await registerDocumentationAuditSignComplete({
    userId,
    documentationId,
    fileId,
    driveId,
    signedAt: signedAt ? new Date(signedAt) : new Date(),
    meta,
  });

  response(res, 200, audit);
};

// ======================================================
// Endpoint para validar si puede firmar
// ======================================================
const postCanUserSignDocumentationReceipt = async (req, res) => {
  const { userId, documentationId } = req.body || {};

  const result = await canUserSignDocumentationReceipt({
    userId,
    documentationId,
  });

  response(res, 200, result);
};

module.exports = {
  getDocumentationAuditByUserAndDocument: catchAsync(getDocumentationAuditByUserAndDocument),
  getDocumentationAuditsByUser: catchAsync(getDocumentationAuditsByUser),
  postRegisterDocumentationAuditDownload: catchAsync(postRegisterDocumentationAuditDownload),
  postRegisterDocumentationAuditSignRequest: catchAsync(postRegisterDocumentationAuditSignRequest),
  postRegisterDocumentationAuditSignComplete: catchAsync(postRegisterDocumentationAuditSignComplete),
  postCanUserSignDocumentationReceipt: catchAsync(postCanUserSignDocumentationReceipt),

  // helpers para reutilizar directamente desde otros controladores
  registerDocumentationAuditDownload,
  registerDocumentationAuditSignRequest,
  registerDocumentationAuditSignComplete,
  canUserSignDocumentationReceipt,
};