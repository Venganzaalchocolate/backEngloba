
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile } = require('./ovhController');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFileToDrive, deleteFileById, getFileById, updateFileInDrive } = require('./googleController');
const { User, Program, Jobs, Leavetype, Filedrive } = require('../models/indexModels');


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
  try {
    
  } catch (error) {
    
  }
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
          { $addToSet: { files: newFile._id } },
          { new: true, session }
        ).populate('files');
      } else if (originModel.toLowerCase() === 'user') {
        updated = await User.findByIdAndUpdate(
          idModel,
          { $addToSet: { files: { filesId: newFile._id } } },
          { new: true, session }
        ).populate('files.filesId');
      } else if (originModel.toLowerCase() === 'device') {
        // Para dispositivos, se espera que venga también deviceId en el body
        const { deviceId } = req.body;
        if (!deviceId) throw new ClientError('Falta deviceId para asociar el archivo a un dispositivo', 400);
        updated = await Program.findOneAndUpdate(
          { _id: idModel, "devices._id": deviceId},
          { $addToSet:{"devices.$.files":newFile._id}},
          { new: true, session }
        ).populate({ path: 'devices.files' });
      }
    });
  } catch (err) {
    if (uploadResult?.id) await deleteFileFromDrive(uploadResult.id);
    throw err;
  } finally {
    session.endSession();
  }
  response(res, 200, updated);
};



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
  // Para el caso de dispositivos, esperamos que venga deviceId
  const { deviceId } = req.body;
  const newFile = req.file; // Archivo opcional para actualización

  if (!fileId)
    throw new ClientError('Falta fileId para actualizar el archivo', 400);

  const session = await mongoose.startSession();
  let updatedParent = null; // Se usará si se actualiza la referencia en el documento padre
  let fileDoc; // Documento de Filedrive a actualizar

  try {
    await session.withTransaction(async () => {
      // Buscar el documento de Filedrive a actualizar
      fileDoc = await Filedrive.findById(fileId).session(session);
      if (!fileDoc)
        throw new ClientError('No se encontró el archivo a actualizar', 404);

      // Actualizar campos comunes
      if (description !== undefined) fileDoc.description = description;
      if (notes !== undefined) fileDoc.notes = notes;
      if (date) fileDoc.date = new Date(date);
      if (cronology) fileDoc.cronology = cronology;
      if (category) fileDoc.category=category;

      if (originDocumentation) {
        fileDoc.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
      } else {
        if (fileName !== undefined) fileDoc.fileName = fileName;
        if (fileLabel !== undefined) fileDoc.fileLabel = fileLabel;
      }

      // Si se envía un nuevo archivo, actualizarlo en Drive
      if (newFile) {
        const updateResult = await updateFileInDrive(newFile, fileDoc.idDrive);
        if (!updateResult)
          throw new ClientError('Error al actualizar el archivo en Drive', 500);
      }

      // Si se envían originModel e idModel (y, para Device, deviceId) y difieren de los actuales,
      // se actualiza la referencia en el archivo y en el documento padre.
      if (originModel && idModel && (originModel.toLowerCase() !== fileDoc.originModel.toLowerCase() ||
          idModel !== fileDoc.idModel.toString())) {
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
        } else if (originModel.toLowerCase() === 'device') {
          if (!deviceId)
            throw new ClientError('Falta deviceId para actualizar la referencia del archivo en el dispositivo', 400);
          updatedParent = await Program.findOneAndUpdate(
            { _id: idModel, "devices._id": deviceId },
            { $addToSet: { "devices.$.files": fileDoc._id } },
            { new: true, session }
          ).populate('devices.files');
        }
      }

      // Guardar los cambios en Filedrive
      await fileDoc.save({ session });
    });

    session.endSession();

    // Si updatedParent no se estableció dentro de la transacción, se obtiene el documento padre actual
    if (!updatedParent) {
      if (fileDoc.originModel.toLowerCase() === 'program') {
        updatedParent = await Program.findById(fileDoc.idModel).populate('files');
      } else if (fileDoc.originModel.toLowerCase() === 'user') {
        updatedParent = await User.findById(fileDoc.idModel).populate('files.filesId');
      } else if (fileDoc.originModel.toLowerCase() === 'device') {
        if (!deviceId)
          throw new ClientError('Falta deviceId para obtener el dispositivo actualizado', 400);
        updatedParent = await Program.findOne({ _id: fileDoc.idModel, "devices._id": deviceId })
          .populate('devices.files');
      }
    }

    response(res, 200, updatedParent);
  } catch (err) {
    session.endSession();
    next(err);
  }
};



const deleteFileDrive = async (req, res, next) => {
  const idFile = req.body.fileId;
  if (!idFile) throw new ClientError('Falta idFile', 400);

  let updatedParent = null;

  // Buscar el documento en Filedrive
  const fileDoc = await Filedrive.findById(idFile);
  if (!fileDoc) throw new ClientError('No se encontró el File a eliminar', 404);

  // Borrar el archivo en Google Drive si existe idDrive
  if (fileDoc.idDrive) {
    const success = await deleteFileById(fileDoc.idDrive);
    if (!success) throw new ClientError('Error al eliminar archivo en Drive', 500);
  }

  // Quitar la referencia del archivo en el documento padre según originModel
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
  } else if (fileDoc.originModel.toLowerCase() === 'device') {
    const { deviceId } = req.body;
    if (!deviceId) throw new ClientError('Falta deviceId para eliminar la referencia del archivo en el dispositivo', 400);
    updatedParent = await Program.findOneAndUpdate(
      { _id: fileDoc.idModel, "devices._id": deviceId },
      { $pull: { "devices.$.files": fileDoc._id } },
      { new: true }
    ).populate('devices.files');
  }

  // Eliminar el documento de Filedrive de MongoDB
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
  getFileDrive: catchAsync(getFileDrive)
};
