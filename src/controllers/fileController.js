
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile, getPresignedPut, getPresignedGet } = require('./ovhController');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFileToDrive, deleteFileById, getFileById, updateFileInDrive } = require('./googleController');
const { User, Program, Jobs, Leavetype, Filedrive, Dispositive } = require('../models/indexModels'); // 👈 añadimos Dispositive

const getCvPresignPut = async (req, res) => {
  const { id } = req.body;              // id del UserCv de tu BD
  if (!id) throw new ClientError('Falta id', 400);

  // la clave real del objeto (mantén tu esquema actual)
  const key = `${id}.pdf`;              // <= no cambies nada más para “mínimos cambios”
  const url = await getPresignedPut(key); // 5 minutos de validez
  response(res, 200, { url, key });
};

// Presigned GET para ver/descargar
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
  } else {
    const archivoGuardado = await uploadFile(req.file, `${req.body.nameFile}.pdf`); // Pasar el flujo de datos del archivo directamente
    response(res, 200, archivoGuardado); // Enviar los datos del archivo guardado a la respuesta
  }
};

const getFile = async (req, res) => {
  if (!req.body.id) {
    throw new ClientError('No se proporcionó id', 400);
  } else {
    const archivoStream = await getFileCv(req.body.id);

    if (!archivoStream) {
      throw new ClientError('Archivo no encontrado', 404);
    }
    // Configurar la respuesta HTTP
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=' + req.body.id,
    });

    // Enviar el stream como respuesta HTTP
    archivoStream.pipe(res);
  }
};

const deleteIdFile = async (req, res) => {
  if (!req.id) {
    throw new ClientError('No se proporcionó nombre para el archivo', 400);
  } else {
    const archivoEliminado = await deleteFile(req.id); // Pasar el flujo de datos del archivo directamente
    response(res, 200, archivoEliminado); // Enviar los datos del archivo guardado a la respuesta
  }
}

// GOOGLE
// FileDriveService.js

const getFileDrive = async (req, res, next) => {

  const fileId = req.body.idFile;
  const { file, stream } = await getFileById(fileId);

  if (!stream) {
    throw new ClientError('Archivo no encontrado en Google Drive', 404);
  }

  // Cabeceras
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.name}"`
  );
  res.setHeader('Content-Type', file.mimeType);

  // Envías el contenido "en streaming"
  stream.pipe(res);
};


const createFileDrive = async (req, res, next) => {
  const {
    originModel, idModel, originDocumentation,
    fileName, fileLabel, date, notes, description, cronology, category
  } = req.body;
  const file = req.file;

  if (!file) throw new ClientError('No se recibió ningún archivo a subir', 400);
  if (!originModel) throw new ClientError('Falta originModel', 400);
  if (!idModel) throw new ClientError('Falta idModel', 400);

  const fileData = {
    description,
    date: date ? new Date(date) : undefined,
    notes,
    originModel,
    idModel: new mongoose.Types.ObjectId(idModel),
    cronology: cronology || {},
    category: category || 'Varios'
  };

  if (originDocumentation) {
    fileData.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
  } else {
    fileData.fileName = fileName;
    fileData.fileLabel = fileLabel;
  }

  let newFile, uploadResult, updated;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Guardar en MongoDB
      newFile = await new Filedrive(fileData).save({ session });

      // Subir archivo a Drive
      const folderId = process.env.GOOGLE_DRIVE_FILES,
        driveName = newFile._id.toString();
      uploadResult = await uploadFileToDrive(file, folderId, driveName, false);

      if (!uploadResult)
        throw new ClientError('Error al subir archivo a Drive', 500);

      // Asociar ID de Drive al archivo y guardarlo
      newFile.idDrive = uploadResult.id;
      await newFile.save({ session });

      // Actualizar el documento padre según originModel
      if (originModel.toLowerCase() === 'program') {
        updated = await Program.findByIdAndUpdate(
          idModel,
          { $push: { files: newFile._id } },
          { new: true, session }
        ).populate('files');
      } else if (originModel.toLowerCase() === 'user') {
        updated = await User.findByIdAndUpdate(
          idModel,
          { $push: { files: { filesId: newFile._id } } },
          { new: true, session }
        ).populate('files.filesId');
      } else if (originModel.toLowerCase() === 'dispositive') {
        // ✅ Ahora los dispositivos son independientes
        updated = await Dispositive.findByIdAndUpdate(
          idModel,
          { $push: { files: newFile._id } },
          { new: true, session }
        ).populate('files');
      }
    });
  } catch (err) {
    if (uploadResult?.id) await deleteFileById(uploadResult.id);
    throw err;
  } finally {
    session.endSession();
  }

  response(res, 200, updated);
};

// ======================================================

const updateFileDrive = async (req, res, next) => {
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
    category
  } = req.body;
  const newFile = req.file;

  if (!fileId)
    throw new ClientError('Falta fileId para actualizar el archivo', 400);

  const session = await mongoose.startSession();
  let updatedParent = null;
  let fileDoc;

  try {
    await session.withTransaction(async () => {
      fileDoc = await Filedrive.findById(fileId).session(session);
      if (!fileDoc)
        throw new ClientError('No se encontró el archivo a actualizar', 404);

      // Actualizar campos comunes
      if (description !== undefined) fileDoc.description = description;
      if (notes !== undefined) fileDoc.notes = notes;
      if (date) fileDoc.date = new Date(date);
      if (cronology) fileDoc.cronology = cronology;
      if (category) fileDoc.category = category;

      if (originDocumentation) {
        fileDoc.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
      } else {
        if (fileName !== undefined) fileDoc.fileName = fileName;
        if (fileLabel !== undefined) fileDoc.fileLabel = fileLabel;
      }

      // Si hay archivo nuevo
      if (newFile) {
        const updateResult = await updateFileInDrive(newFile, fileDoc.idDrive);
        if (!updateResult)
          throw new ClientError('Error al actualizar el archivo en Drive', 500);
      }

      // Si cambia de modelo o id padre
      if (
        originModel && idModel &&
        (originModel.toLowerCase() !== fileDoc.originModel.toLowerCase() ||
         idModel !== fileDoc.idModel.toString())
      ) {
        fileDoc.originModel = originModel;
        fileDoc.idModel = new mongoose.Types.ObjectId(idModel);

        if (originModel.toLowerCase() === 'program') {
          updatedParent = await Program.findByIdAndUpdate(
            idModel,
            { $addToSet: { files: fileDoc._id } },
            { new: true, session }
          ).populate('files');
        } else if (originModel.toLowerCase() === 'user') {
          updatedParent = await User.findByIdAndUpdate(
            idModel,
            { $addToSet: { files: { filesId: fileDoc._id } } },
            { new: true, session }
          ).populate('files.filesId');
        } else if (originModel.toLowerCase() === 'dispositive') {
          updatedParent = await Dispositive.findByIdAndUpdate(
            idModel,
            { $addToSet: { files: fileDoc._id } },
            { new: true, session }
          ).populate('files');
        }
      }

      await fileDoc.save({ session });
    });

    session.endSession();

    if (!updatedParent) {
      if (fileDoc.originModel.toLowerCase() === 'program') {
        updatedParent = await Program.findById(fileDoc.idModel).populate('files');
      } else if (fileDoc.originModel.toLowerCase() === 'user') {
        updatedParent = await User.findById(fileDoc.idModel).populate('files.filesId');
      } else if (fileDoc.originModel.toLowerCase() === 'dispositive') {
        updatedParent = await Dispositive.findById(fileDoc.idModel).populate('files');
      }
    }

    response(res, 200, updatedParent);
  } catch (err) {
    session.endSession();
    next(err);
  }
};

// ======================================================

const deleteFileDrive = async (req, res, next) => {
  const idFile = req.body.fileId;
  if (!idFile) throw new ClientError('Falta idFile', 400);

  let updatedParent = null;

  const fileDoc = await Filedrive.findById(idFile);
  if (!fileDoc) throw new ClientError('No se encontró el File a eliminar', 404);

  // Eliminar en Drive
  if (fileDoc.idDrive) {
    const success = await deleteFileById(fileDoc.idDrive);
    if (!success) throw new ClientError('Error al eliminar archivo en Drive', 500);
  }

  // Quitar del padre
  if (fileDoc.originModel.toLowerCase() === 'program') {
    updatedParent = await Program.findByIdAndUpdate(
      fileDoc.idModel,
      { $pull: { files: fileDoc._id } },
      { new: true }
    ).populate('files');
  } else if (fileDoc.originModel.toLowerCase() === 'user') {
    updatedParent = await User.findByIdAndUpdate(
      fileDoc.idModel,
      { $pull: { files: { filesId: fileDoc._id } } },
      { new: true }
    ).populate('files.filesId');
  } else if (fileDoc.originModel.toLowerCase() === 'dispositive') {
    // ✅ ahora es independiente
    updatedParent = await Dispositive.findByIdAndUpdate(
      fileDoc.idModel,
      { $pull: { files: fileDoc._id } },
      { new: true }
    ).populate('files');
  }

  await Filedrive.findByIdAndDelete(idFile);
  response(res, 200, updatedParent);
};


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
};
