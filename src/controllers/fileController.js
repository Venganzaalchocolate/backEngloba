const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile, getPresignedPut, getPresignedGet } = require('./ovhController');
const mongoose = require('mongoose');
const {
  uploadFileToDrive,
  deleteFileById,
  getFileById,
  updateFileInDrive,
  appendFilesToArchiveOptimized
} = require('./googleController');

const {
  User,
  Program,
  Jobs,
  Leavetype,
  Filedrive,
  Dispositive,
  Documentation,
  VolunteerApplication,
  Workplace
} = require('../models/indexModels');

const archiver = require('archiver');
const { registerDocumentationAuditDownload } = require('./userDocumentationAuditController');

/* ======================================================
   HELPERS
====================================================== */

const sanitize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 60);

const MODEL_MAP = {
  user: 'User',
  program: 'Program',
  dispositive: 'Dispositive',
  workplace: 'Workplace',
  volunteerapplication: 'VolunteerApplication',
  usercv: 'UserCv',
  finantial: 'Finantial',
  estadistics: 'Estadistics',
};

const normalizeOriginModel = (originModel) => {
  const key = String(originModel || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

  return MODEL_MAP[key] || null;
};

const getParentConfig = (originModel) => {
  const canonicalModel = normalizeOriginModel(originModel);

  if (!canonicalModel) return null;

  const configs = {
    Program: {
      Model: Program,
      push: (fileId) => ({ $push: { files: fileId } }),
      add: (fileId) => ({ $addToSet: { files: fileId } }),
      pull: (fileId) => ({ $pull: { files: fileId } }),
      populate: 'files',
    },

    User: {
      Model: User,
      push: (fileId) => ({ $push: { files: { filesId: fileId } } }),
      add: (fileId) => ({ $addToSet: { files: { filesId: fileId } } }),
      pull: (fileId) => ({ $pull: { files: { filesId: fileId } } }),
      populate: 'files.filesId',
    },

    Dispositive: {
      Model: Dispositive,
      push: (fileId) => ({ $push: { files: fileId } }),
      add: (fileId) => ({ $addToSet: { files: fileId } }),
      pull: (fileId) => ({ $pull: { files: fileId } }),
      populate: 'files',
    },

    VolunteerApplication: {
      Model: VolunteerApplication,
      push: (fileId) => ({ $push: { files: fileId } }),
      add: (fileId) => ({ $addToSet: { files: fileId } }),
      pull: (fileId) => ({ $pull: { files: fileId } }),
      populate: 'files',
    },

    Workplace: {
      Model: Workplace,
      push: (fileId) => ({ $push: { files: fileId } }),
      add: (fileId) => ({ $addToSet: { files: fileId } }),
      pull: (fileId) => ({ $pull: { files: fileId } }),
      populate: 'files',
    },
  };

  return {
    canonicalModel,
    ...configs[canonicalModel],
  };
};

const addFileToParent = async ({ originModel, idModel, fileId, session, mode = 'push' }) => {
  const config = getParentConfig(originModel);
  if (!config?.Model) throw new ClientError('originModel no permitido', 400);

  const update = mode === 'add'
    ? config.add(fileId)
    : config.push(fileId);

  return config.Model.findByIdAndUpdate(
    idModel,
    update,
    { new: true, session }
  ).populate(config.populate);
};

const removeFileFromParent = async ({ originModel, idModel, fileId, session }) => {
  const config = getParentConfig(originModel);
  if (!config?.Model) throw new ClientError('originModel no permitido', 400);

  return config.Model.findByIdAndUpdate(
    idModel,
    config.pull(fileId),
    { new: true, session }
  ).populate(config.populate);
};

const getParentWithFiles = async ({ originModel, idModel }) => {
  const config = getParentConfig(originModel);
  if (!config?.Model) throw new ClientError('originModel no permitido', 400);

  return config.Model.findById(idModel).populate(config.populate);
};

/* ======================================================
   ZIP NOMINAS
====================================================== */

const zipPayrolls = async (req, res) => {
  const { userId } = req.body;

  if (!userId) throw new ClientError('Falta userId', 400);

  const user = await User.findById(userId).lean();

  if (!user || !user.payrolls || user.payrolls.length === 0) {
    throw new ClientError('El usuario no tiene nóminas', 404);
  }

  const archive = archiver('zip', { zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=nominas_${sanitize(user.firstName)}_${sanitize(user.lastName)}.zip`
  );

  archive.pipe(res);

  const payrollDocs = user.payrolls.map((p) => ({
    idDrive: p.pdf,
    fileLabel: `Nomina_${p.payrollYear}_${String(p.payrollMonth).padStart(2, '0')}`,
    description: null,
    originDocumentation: null,
  }));

  await appendFilesToArchiveOptimized(payrollDocs, archive, 5);
  await archive.finalize();
};

/* ======================================================
   ZIP MULTIPLE FILES
====================================================== */

const zipMultipleFiles = async (req, res) => {
  const { fileIds } = req.body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    throw new ClientError('fileIds debe ser un array con IDs', 400);
  }

  const files = await Filedrive.find({ _id: { $in: fileIds } }).lean();

  if (!files || files.length === 0) {
    throw new ClientError('No se encontraron archivos para esos IDs', 404);
  }

  const archive = archiver('zip', { zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=Documentos.zip');

  archive.pipe(res);

  const listDocs = [];

  for (const fileDoc of files) {
    let baseName = 'documento';

    if (fileDoc.fileLabel) {
      baseName = fileDoc.fileLabel;
    } else if (fileDoc.description) {
      baseName = fileDoc.description;
    }

    if (fileDoc.originDocumentation) {
      const doc = await Documentation.findById(fileDoc.originDocumentation).select('name');
      if (doc?.name) baseName = doc.name;
    }

    listDocs.push({
      idDrive: fileDoc.idDrive,
      fileLabel: sanitize(baseName),
      description: null,
      originDocumentation: null,
    });
  }

  await appendFilesToArchiveOptimized(listDocs, archive, 5);
  await archive.finalize();
};

/* ======================================================
   OVH CV
====================================================== */

const getCvPresignPut = async (req, res) => {
  const { id } = req.body;

  if (!id) throw new ClientError('Falta id', 400);

  const key = `${id}.pdf`;
  const url = await getPresignedPut(key);

  response(res, 200, { url, key });
};

const getCvPresignGet = async (req, res) => {
  const { id } = req.body;

  if (!id) throw new ClientError('Falta id', 400);

  const key = `${id}.pdf`;
  const url = await getPresignedGet(key);

  response(res, 200, { url });
};

const postUploadFile = async (req, res) => {
  if (!req.file || !req.body.nameFile) {
    throw new ClientError('No se proporcionó archivo, o nombre para el archivo', 400);
  }

  const archivoGuardado = await uploadFile(req.file, `${req.body.nameFile}.pdf`);
  response(res, 200, archivoGuardado);
};

const getFile = async (req, res) => {
  if (!req.body.id) {
    throw new ClientError('No se proporcionó id', 400);
  }

  const archivoStream = await getFileCv(req.body.id);

  if (!archivoStream) {
    throw new ClientError('Archivo no encontrado', 404);
  }

  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=${req.body.id}`,
  });

  archivoStream.pipe(res);
};

const deleteIdFile = async (req, res) => {
  if (!req.id) {
    throw new ClientError('No se proporcionó nombre para el archivo', 400);
  }

  const archivoEliminado = await deleteFile(req.id);
  response(res, 200, archivoEliminado);
};

/* ======================================================
   GOOGLE DRIVE - GET FILE
====================================================== */

const getFileDrive = async (req, res) => {
  const { idFile, userId } = req.body || {};

  if (!idFile) throw new ClientError('Falta idFile', 400);

  let driveId = null;
  let fileDoc = null;

  if (mongoose.Types.ObjectId.isValid(idFile)) {
    fileDoc = await Filedrive.findById(idFile)
      .select('_id idDrive originModel idModel originDocumentation')
      .lean();

    if (fileDoc?.idDrive) driveId = fileDoc.idDrive;
  }

  if (!driveId) driveId = idFile;

  const { file, stream } = await getFileById(driveId);

  if (!stream) {
    throw new ClientError('Archivo no encontrado en Google Drive', 404);
  }
  
  if (
    fileDoc &&
    userId &&
    fileDoc.originModel === 'User' &&
    fileDoc.originDocumentation &&
    String(fileDoc.idModel) === String(userId)
  ) {
    await registerDocumentationAuditDownload({
      userId,
      documentationId: fileDoc.originDocumentation,
      fileId: fileDoc._id,
      driveId: fileDoc.idDrive,
    });
  }
  

  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.setHeader('Content-Type', file.mimeType);

  stream.pipe(res);
};

/* ======================================================
   GOOGLE DRIVE - CREATE FILE
====================================================== */

const createFileDrive = async (req, res) => {
  const {
    originModel,
    idModel,
    originDocumentation,
    fileName,
    fileLabel,
    date,
    notes,
    description,
    cronology,
    category,
  } = req.body;

  const file = req.file;

  if (!file) throw new ClientError('No se recibió ningún archivo a subir', 400);
  if (!originModel) throw new ClientError('Falta originModel', 400);
  if (!idModel) throw new ClientError('Falta idModel', 400);

  const canonicalModel = normalizeOriginModel(originModel);
  if (!canonicalModel) throw new ClientError('originModel no permitido', 400);

  const fileData = {
    description,
    date: date ? new Date(date) : undefined,
    notes,
    originModel: canonicalModel,
    idModel: new mongoose.Types.ObjectId(idModel),
    cronology: cronology || {},
    category: category || 'Varios',
  };

  if (originDocumentation) {
    fileData.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
  } else {
    fileData.fileName = fileName;
    fileData.fileLabel = fileLabel;
  }

  let newFile = null;
  let uploadResult = null;
  let updated = null;

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      newFile = await new Filedrive(fileData).save({ session });

      const folderId = process.env.GOOGLE_DRIVE_FILES;
      const driveName = newFile._id.toString();

      uploadResult = await uploadFileToDrive(file, folderId, driveName, false);

      if (!uploadResult) {
        throw new ClientError('Error al subir archivo a Drive', 500);
      }

      newFile.idDrive = uploadResult.id;
      await newFile.save({ session });

      updated = await addFileToParent({
        originModel: canonicalModel,
        idModel,
        fileId: newFile._id,
        session,
        mode: 'push',
      });
    });
  } catch (err) {
    if (uploadResult?.id) await deleteFileById(uploadResult.id);
    throw err;
  } finally {
    session.endSession();
  }

  response(res, 200, updated);
};

/* ======================================================
   GOOGLE DRIVE - UPDATE FILE
====================================================== */

const updateFileDrive = async (req, res) => {
  const {
    fileId,
    originDocumentation,
    fileName,
    fileLabel,
    date,
    notes,
    description,
    cronology,
    originModel,
    idModel,
    category,
  } = req.body;

  const newFile = req.file;

  if (!fileId) {
    throw new ClientError('Falta fileId para actualizar el archivo', 400);
  }

  const session = await mongoose.startSession();

  let updatedParent = null;
  let fileDoc = null;

  try {
    await session.withTransaction(async () => {
      fileDoc = await Filedrive.findById(fileId).session(session);

      if (!fileDoc) {
        throw new ClientError('No se encontró el archivo a actualizar', 404);
      }

      const oldOriginModel = fileDoc.originModel;
      const oldIdModel = fileDoc.idModel;

      if (description !== undefined) fileDoc.description = description;
      if (notes !== undefined) fileDoc.notes = notes;
      if (date) fileDoc.date = new Date(date);
      if (cronology) fileDoc.cronology = cronology;
      if (category) fileDoc.category = category;

      if (originDocumentation) {
        fileDoc.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
        fileDoc.fileName = undefined;
        fileDoc.fileLabel = undefined;
      } else {
        if (fileName !== undefined) fileDoc.fileName = fileName;
        if (fileLabel !== undefined) fileDoc.fileLabel = fileLabel;
      }

      if (newFile) {
        const updateResult = await updateFileInDrive(newFile, fileDoc.idDrive);

        if (!updateResult) {
          throw new ClientError('Error al actualizar el archivo en Drive', 500);
        }
      }

      const canonicalModel = originModel ? normalizeOriginModel(originModel) : null;

      if (originModel && !canonicalModel) {
        throw new ClientError('originModel no permitido', 400);
      }

      const mustMoveParent =
        canonicalModel &&
        idModel &&
        (
          canonicalModel !== fileDoc.originModel ||
          String(idModel) !== String(fileDoc.idModel)
        );

      if (mustMoveParent) {
        await removeFileFromParent({
          originModel: oldOriginModel,
          idModel: oldIdModel,
          fileId: fileDoc._id,
          session,
        });

        fileDoc.originModel = canonicalModel;
        fileDoc.idModel = new mongoose.Types.ObjectId(idModel);

        updatedParent = await addFileToParent({
          originModel: canonicalModel,
          idModel,
          fileId: fileDoc._id,
          session,
          mode: 'add',
        });
      }

      await fileDoc.save({ session });
    });
  } finally {
    session.endSession();
  }

  if (!updatedParent) {
    updatedParent = await getParentWithFiles({
      originModel: fileDoc.originModel,
      idModel: fileDoc.idModel,
    });
  }

  response(res, 200, updatedParent);
};

/* ======================================================
   GOOGLE DRIVE - DELETE FILE
====================================================== */

const deleteFileDrive = async (req, res) => {
  const idFile = req.body.fileId;

  if (!idFile) throw new ClientError('Falta idFile', 400);

  const fileDoc = await Filedrive.findById(idFile);

  if (!fileDoc) {
    throw new ClientError('No se encontró el File a eliminar', 404);
  }

  if (fileDoc.idDrive) {
    const success = await deleteFileById(fileDoc.idDrive);

    if (!success) {
      throw new ClientError('Error al eliminar archivo en Drive', 500);
    }
  }

  const updatedParent = await removeFileFromParent({
    originModel: fileDoc.originModel,
    idModel: fileDoc.idModel,
    fileId: fileDoc._id,
  });

  await Filedrive.findByIdAndDelete(idFile);

  response(res, 200, updatedParent);
};

/* ======================================================
   LIST FILES
====================================================== */

const listFile = async (req, res) => {
  const { originModel, idModel } = req.body;

  if (!originModel) throw new ClientError('Falta originModel', 400);
  if (!idModel) throw new ClientError('Falta idModel', 400);

  const canonicalModel = normalizeOriginModel(originModel);

  if (!canonicalModel) {
    throw new ClientError('originModel no permitido', 400);
  }

  const files = await Filedrive.find({
    originModel: canonicalModel,
    idModel: new mongoose.Types.ObjectId(idModel),
  })
    .select('_id originDocumentation date fileLabel description idDrive category')
    .lean();

  response(res, 200, { items: files });
};

/* ======================================================
   GENERATED OFFICIAL FILES
====================================================== */

const attachGeneratedOfficialFileToUser = async ({
  userId,
  documentationId,
  driveId,
  description,
  date,
  category,
}) => {
  const session = await mongoose.startSession();

  let updatedUser = null;
  let newFile = null;

  try {
    await session.withTransaction(async () => {
      newFile = await new Filedrive({
        originModel: 'User',
        idModel: new mongoose.Types.ObjectId(userId),
        originDocumentation: new mongoose.Types.ObjectId(documentationId),
        description: description || '',
        date: date ? new Date(date) : undefined,
        category: category || 'Oficial',
        idDrive: driveId,
      }).save({ session });

      updatedUser = await User.findByIdAndUpdate(
        userId,
        { $push: { files: { filesId: newFile._id } } },
        { new: true, session }
      ).populate('files.filesId');
    });
  } catch (error) {
    if (driveId) await deleteFileById(driveId).catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }

  return { updatedUser, newFile };
};

/* ======================================================
   EXPORTS
====================================================== */

module.exports = {
  postUploadFile: catchAsync(postUploadFile),
  getFile: catchAsync(getFile),
  deleteIdFile: catchAsync(deleteIdFile),

  createFileDrive: catchAsync(createFileDrive),
  updateFileDrive: catchAsync(updateFileDrive),
  deleteFileDrive: catchAsync(deleteFileDrive),
  getFileDrive: catchAsync(getFileDrive),

  getCvPresignPut: catchAsync(getCvPresignPut),
  getCvPresignGet: catchAsync(getCvPresignGet),

  zipMultipleFiles: catchAsync(zipMultipleFiles),
  zipPayrolls: catchAsync(zipPayrolls),

  listFile: catchAsync(listFile),

  attachGeneratedOfficialFileToUser,
};