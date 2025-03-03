
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile } = require('./ovhController');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFileToDrive, deleteFileById, getFileById, updateFileInDrive } = require('./googleController');
const { User, Program, Jobs, Leavetype, Filedrive } = require('../models/indexModels');

// crear usuario
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

const deleteIdFile= async (req, res) => {
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

  try {
    if (!req.body.idFile) {
      throw new ClientError('Se necesita un id válido', 400);
    }

    const { file, data } = await getFileById(req.body.idFile);

    if (!data) {
      throw new ClientError('Archivo no encontrado en Google Drive', 404);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');

    // Enviamos el Buffer completo
    res.end(data);
  } catch (error) {
    console.error(error);
    next(error);
  }
};



const createFileDrive = async (req, res, next) => {
  const {
    originModel, idModel, originDocumentation,
    fileName, fileLabel, date, notes, description, cronology
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
  };
  if (originDocumentation) fileData.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
  else {
    fileData.fileName = fileName;
    fileData.fileLabel = fileLabel;
  }
  
  let newFile, uploadResult, responseNewModel;
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    newFile = await new Filedrive(fileData).save({ session });
    const folderId = process.env.GOOGLE_DRIVE_FILES,
          driveName = newFile._id.toString();
    uploadResult = await uploadFileToDrive(file, folderId, driveName, false);
    if (!uploadResult) throw new ClientError('Error al subir archivo a Drive', 500);
    newFile.idDrive = uploadResult.id;
    await newFile.save({ session });
    if (originModel === 'Program') {
      responseNewModel = await Program.findOneAndUpdate(
        { _id: idModel },
        { $push: { files: newFile._id } },
        { new: true, session }
      );
    }
  }).catch(async (err) => {
    session.endSession();
    if (uploadResult?.id) await deleteFileFromDrive(uploadResult.id);
    throw err;
  });
  session.endSession();
  response(res, 200, responseNewModel);
}


const updateFileDrive = async (req, res, next) => {
  const {
    fileId,                   // ID del documento Filedrive a actualizar
    originDocumentation,      // Si existe, se asocia a esta documentación
    fileName,
    fileLabel,
    date,
    notes,
    description,
    cronology,
    originModel,              // Opcional si quieres actualizar a qué modelo hace referencia
    idModel                   // Opcional si se cambia la referencia
  } = req.body;

  // Se asume que si el usuario no provee 'fileId', no podemos proceder.
  if (!fileId) throw new ClientError('Falta fileId para actualizar el archivo', 400);

  // Obtenemos el nuevo archivo (si se envió uno en la request)
  const newFile = req.file;

  // Iniciamos sesión para la transacción
  const session = await mongoose.startSession();

  let updatedFile, oldFileDrive, updateResult;

  try {
    await session.withTransaction(async () => {
      // 1. Buscamos el registro actual en Filedrive
      oldFileDrive = await Filedrive.findById(fileId).session(session);
      if (!oldFileDrive) {
        throw new ClientError('No se encontró el archivo a actualizar', 404);
      }

      // 2. Actualizamos los campos en memoria
      if (description !== undefined) oldFileDrive.description = description;
      if (notes !== undefined)       oldFileDrive.notes = notes;
      if (date)                      oldFileDrive.date = new Date(date);
      if (cronology)                 oldFileDrive.cronology = cronology;
      
      if (originDocumentation) {
        oldFileDrive.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
      } else {
        // Si NO viene originDocumentation, usamos fileName/fileLabel
        if (fileName !== undefined) oldFileDrive.fileName = fileName;
        if (fileLabel !== undefined) oldFileDrive.fileLabel = fileLabel;
      }

      // 3. Verificamos si hay un archivo nuevo para actualizar en Drive
      if (newFile) {
        // Utilizamos la función que actualiza el contenido en Drive
        // Asumimos que se mantiene el mismo ID de Drive (oldFileDrive.idDrive)
        updateResult = await updateFileInDrive(newFile, oldFileDrive.idDrive);
        if (!updateResult) {
          throw new ClientError('Error al actualizar el archivo en Drive', 500);
        }
      }

      // 4. Opcional: Si se requiere cambiar la asociación con un modelo distinto (originModel/idModel)
      //    O si solo quieres asegurarte de mantener la referencia
      if (originModel && idModel) {
        oldFileDrive.originModel = originModel;
        oldFileDrive.idModel = new mongoose.Types.ObjectId(idModel);

        // Ejemplo de si quieres actualizar la referencia en "Program"
        // Primero sacamos el viejo idModel y, si cambió, quitamos y agregamos en Program (opcional).
        // Para simplicidad, supongamos que solo actualizamos si originModel === 'Program'.
        if (originModel === 'Program') {
          // Asegurarse de que el archivo esté referenciado en el nuevo Program.
          await Program.findOneAndUpdate(
            { _id: idModel },
            { $addToSet: { files: oldFileDrive._id } }, // $addToSet evita duplicados
            { new: true, session }
          );
        }
      }

      // 5. Guardamos cambios en la BD
      updatedFile = await oldFileDrive.save({ session });
    });

    // Cerramos la sesión de la transacción
    session.endSession();

    // 6. Enviamos la respuesta
    response(res, 200, updatedFile);

  } catch (err) {
    // En caso de error, cerramos la sesión.
    session.endSession();
    // Si el error ocurrió DESPUÉS de haber subido algo a Drive, 
    // podrías revertir cambios en Drive si fuese necesario.
    // Por ejemplo, si 'updateFileInDrive' subió un nuevo archivo por error
    // (aunque en una actualización normalmente se sobreescribe el mismo).
    next(err);
  }
};


/**
 * Elimina un File, borrando primero el archivo en Drive si existe.
 * @param {Object} params
 * @param {String|ObjectId} params.idFile - ID del File a eliminar
 * @returns {Promise<{ message: string }>} Confirmación
 */
const deleteFileDrive =async (req, res, next) =>{
  const idFile =req.body.fileId
  if (!idFile) throw new ClientError('Falta idFile', 400);

  // 1) Buscar doc
  const fileDoc = await Filedrive.findById(idFile);
  if (!fileDoc) throw new ClientError('No se encontró el File a eliminar', 404);

  // 2) Borrar en Drive (si idDrive existe)
  if (fileDoc.idDrive) {
    const success = await deleteFileById(fileDoc.idDrive);
    if (!success) {
      throw new ClientError('Error al eliminar archivo en Drive', 500);
    }
  }
    // 3) Eliminar la referencia en el modelo "Program", si corresponde
  //    (Si tu fileDoc.originModel es "Program", quitamos el fileDoc._id de Program.files)
  if (fileDoc.originModel === 'Program') {
    await Program.findOneAndUpdate(
      { _id: fileDoc.idModel },
      { $pull: { files: fileDoc._id } }, // Quita el ID de la lista de archivos
      { new: true }
    );
  }

  // 3) Borrar en Mongo
  await Filedrive.findByIdAndDelete(idFile);

  response(res, 200, { message: 'Archivo eliminado de Drive y Mongo' })
}



module.exports = {
  postUploadFile: catchAsync(postUploadFile),
  getFile: catchAsync(getFile),
  deleteIdFile:catchAsync(deleteIdFile),
  createFileDrive:catchAsync(createFileDrive),
  updateFileDrive:catchAsync(updateFileDrive),
  deleteFileDrive:catchAsync(deleteFileDrive),
  getFileDrive:catchAsync(getFileDrive)
};
