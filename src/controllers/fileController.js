
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



// const createFileDrive = async (req, res, next) => {
//   const {
//     originModel, idModel, originDocumentation,
//     fileName, fileLabel, date, notes, description, cronology
//   } = req.body;
//   const file = req.file;
//   if (!file) throw new ClientError('No se recibió ningún archivo a subir', 400);
//   if (!originModel) throw new ClientError('Falta originModel', 400);
//   if (!idModel) throw new ClientError('Falta idModel', 400);
  
//   const fileData = {
//     description,
//     date: date ? new Date(date) : undefined,
//     notes,
//     originModel,
//     idModel: new mongoose.Types.ObjectId(idModel),
//     cronology: cronology || {},
//   };
  
//   if (originDocumentation) {
//     fileData.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
//   } else {
//     fileData.fileName = fileName;
//     fileData.fileLabel = fileLabel;
//   }
  
//   let newFile, uploadResult, responseNewModel, fileNewData;
//   const session = await mongoose.startSession();
  
//   try {
//     await session.withTransaction(async () => {
//       newFile = await new Filedrive(fileData).save({ session });
//       const folderId = process.env.GOOGLE_DRIVE_FILES,
//             driveName = newFile._id.toString();
//       uploadResult = await uploadFileToDrive(file, folderId, driveName, false);
//       if (!uploadResult) throw new ClientError('Error al subir archivo a Drive', 500);
      
//       newFile.idDrive = uploadResult.id;
//       fileNewData = await newFile.save({ session });
      
//       if (originModel === 'Program') {
//         responseNewModel = await Program.findOneAndUpdate(
//           { _id: idModel },
//           { $addToSet: { files: newFile._id } },
//           { new: true, session }
//         );
//       }
//     });
//   } catch (err) {
//     // Si hubo error y se subió el archivo a Drive, se intenta eliminarlo
//     if (uploadResult?.id) await deleteFileFromDrive(uploadResult.id);
//     throw err;
//   } finally {
//     session.endSession();
//   }
  
//   response(res, 200, { file:responseNewModel, program:fileNewData });
// };

// const updateFileDrive = async (req, res, next) => {
//   const {
//     fileId,                   // ID del documento Filedrive a actualizar
//     originDocumentation,      // Si existe, se asocia a esta documentación
//     fileName,
//     fileLabel,
//     date,
//     notes,
//     description,
//     cronology,
//     originModel,              // Opcional si quieres actualizar a qué modelo hace referencia
//     idModel                   // Opcional si se cambia la referencia
//   } = req.body;

//   if (!fileId) throw new ClientError('Falta fileId para actualizar el archivo', 400);

//   // Obtenemos el nuevo archivo (si se envió uno en la request)
//   const newFile = req.file;

//   // Iniciamos sesión para la transacción
//   const session = await mongoose.startSession();

//   let updatedFile, oldFileDrive, updateResult, updatedProgram = null;

//   try {
//     await session.withTransaction(async () => {
//       // 1. Buscamos el registro actual en Filedrive
//       oldFileDrive = await Filedrive.findById(fileId).session(session);
//       if (!oldFileDrive) {
//         throw new ClientError('No se encontró el archivo a actualizar', 404);
//       }

//       // 2. Actualizamos los campos en memoria
//       if (description !== undefined) oldFileDrive.description = description;
//       if (notes !== undefined)       oldFileDrive.notes = notes;
//       if (date)                      oldFileDrive.date = new Date(date);
//       if (cronology)                 oldFileDrive.cronology = cronology;
      
//       if (originDocumentation) {
//         oldFileDrive.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
//       } else {
//         // Si NO viene originDocumentation, usamos fileName/fileLabel
//         if (fileName !== undefined) oldFileDrive.fileName = fileName;
//         if (fileLabel !== undefined) oldFileDrive.fileLabel = fileLabel;
//       }

//       // 3. Si se envía un nuevo archivo, actualizamos el contenido en Drive
//       if (newFile) {
//         // Se asume que se mantiene el mismo idDrive en Drive.
//         updateResult = await updateFileInDrive(newFile, oldFileDrive.idDrive);
//         if (!updateResult) {
//           throw new ClientError('Error al actualizar el archivo en Drive', 500);
//         }
//       }

//       // 4. Si se requiere cambiar la asociación con otro modelo o actualizar la referencia
//       if (originModel && idModel) {
//         oldFileDrive.originModel = originModel;
//         oldFileDrive.idModel = new mongoose.Types.ObjectId(idModel);

//         // Si el modelo es 'Program', actualizamos la referencia en el documento Program.
//         if (originModel === 'Program') {
//           updatedProgram = await Program.findOneAndUpdate(
//             { _id: idModel },
//             { $addToSet: { files: oldFileDrive._id } }, // $addToSet evita duplicados
//             { new: true, session }
//           );
//         }
//       }

//       // 5. Guardamos los cambios en la base de datos
//       updatedFile = await oldFileDrive.save({ session });
//     });

//     session.endSession();

//     // 6. Enviamos la respuesta devolviendo tanto el archivo actualizado como el programa actualizado (si aplica)
//     response(res, 200, { file: updatedFile, program: updatedProgram });
//   } catch (err) {
//     session.endSession();
//     next(err);
//   }
// };


// /**
//  * Elimina un File, borrando primero el archivo en Drive si existe.
//  * @param {Object} params
//  * @param {String|ObjectId} params.idFile - ID del File a eliminar
//  * @returns {Promise<{ message: string }>} Confirmación
//  */
// const deleteFileDrive =async (req, res, next) =>{
//   const idFile =req.body.fileId
//   if (!idFile) throw new ClientError('Falta idFile', 400);

//   // 1) Buscar doc
//   const fileDoc = await Filedrive.findById(idFile);
//   if (!fileDoc) throw new ClientError('No se encontró el File a eliminar', 404);

//   // 2) Borrar en Drive (si idDrive existe)
//   if (fileDoc.idDrive) {
//     const success = await deleteFileById(fileDoc.idDrive);
//     if (!success) {
//       throw new ClientError('Error al eliminar archivo en Drive', 500);
//     }
//   }
//     // 3) Eliminar la referencia en el modelo "Program", si corresponde
//   //    (Si tu fileDoc.originModel es "Program", quitamos el fileDoc._id de Program.files)
//   if (fileDoc.originModel === 'Program') {
//     await Program.findOneAndUpdate(
//       { _id: fileDoc.idModel },
//       { $pull: { files: fileDoc._id } }, // Quita el ID de la lista de archivos
//       { new: true }
//     );
//   }

//   // 3) Borrar en Mongo
//   await Filedrive.findByIdAndDelete(idFile);

//   response(res, 200, { message: 'Archivo eliminado de Drive y Mongo' })
// }

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
  
  if (originDocumentation) {
    fileData.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
  } else {
    fileData.fileName = fileName;
    fileData.fileLabel = fileLabel;
  }

  let newFile, uploadResult, updatedProgram;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Guardar en Mongo
      newFile = await new Filedrive(fileData).save({ session });

      // Subir archivo a Drive
      const folderId = process.env.GOOGLE_DRIVE_FILES,
            driveName = newFile._id.toString();
      uploadResult = await uploadFileToDrive(file, folderId, driveName, false);

      if (!uploadResult) throw new ClientError('Error al subir archivo a Drive', 500);

      // Asociar ID de Drive al archivo y guardarlo
      newFile.idDrive = uploadResult.id;
      await newFile.save({ session });

      // Asociar el archivo al programa
      updatedProgram = await Program.findByIdAndUpdate(
        idModel,
        { $addToSet: { files: newFile._id } },
        { new: true, session }
      ).populate('files'); // POPULATE PARA DEVOLVERLO ACTUALIZADO
    });
  } catch (err) {
    if (uploadResult?.id) await deleteFileFromDrive(uploadResult.id);
    throw err;
  } finally {
    session.endSession();
  }

  response(res, 200, updatedProgram);
};

const updateFileDrive = async (req, res, next) => {
  const {
    fileId, originDocumentation, fileName, fileLabel,
    date, notes, description, cronology, originModel, idModel
  } = req.body;

  if (!fileId) throw new ClientError('Falta fileId para actualizar el archivo', 400);

  const newFile = req.file;
  const session = await mongoose.startSession();

  let updatedFile, updatedProgram;

  try {
    await session.withTransaction(async () => {
      // Buscar archivo en Mongo
      const oldFileDrive = await Filedrive.findById(fileId).session(session);
      if (!oldFileDrive) throw new ClientError('No se encontró el archivo a actualizar', 404);

      // Actualizar campos en memoria
      if (description !== undefined) oldFileDrive.description = description;
      if (notes !== undefined)       oldFileDrive.notes = notes;
      if (date)                      oldFileDrive.date = new Date(date);
      if (cronology)                 oldFileDrive.cronology = cronology;

      if (originDocumentation) {
        oldFileDrive.originDocumentation = new mongoose.Types.ObjectId(originDocumentation);
      } else {
        if (fileName !== undefined) oldFileDrive.fileName = fileName;
        if (fileLabel !== undefined) oldFileDrive.fileLabel = fileLabel;
      }

      // Si se envía un nuevo archivo, actualizar en Drive
      if (newFile) {
        const updateResult = await updateFileInDrive(newFile, oldFileDrive.idDrive);
        if (!updateResult) throw new ClientError('Error al actualizar el archivo en Drive', 500);
      }

      // Si se cambia la referencia del archivo a otro modelo
      if (originModel && idModel) {
        oldFileDrive.originModel = originModel;
        oldFileDrive.idModel = new mongoose.Types.ObjectId(idModel);

        if (originModel === 'Program') {
          updatedProgram = await Program.findByIdAndUpdate(
            idModel,
            { $addToSet: { files: oldFileDrive._id } },
            { new: true, session }
          ).populate('files'); // POPULATE PARA DEVOLVERLO ACTUALIZADO
        }
      }

      // Guardar cambios
      updatedFile = await oldFileDrive.save({ session });
    });

    session.endSession();

    response(res, 200, updatedProgram);
  } catch (err) {
    session.endSession();
    next(err);
  }
};
const deleteFileDrive = async (req, res, next) => {
  const idFile = req.body.fileId;
  if (!idFile) throw new ClientError('Falta idFile', 400);

  let updatedProgram = null;

  // 1) Buscar el documento en Mongo
  const fileDoc = await Filedrive.findById(idFile);
  if (!fileDoc) throw new ClientError('No se encontró el File a eliminar', 404);

  // 2) Borrar en Drive si tiene `idDrive`
  if (fileDoc.idDrive) {
    const success = await deleteFileById(fileDoc.idDrive);
    if (!success) {
      throw new ClientError('Error al eliminar archivo en Drive', 500);
    }
  }

  // 3) Si el archivo pertenece a un programa, quitar la referencia
  if (fileDoc.originModel === 'Program') {
    updatedProgram = await Program.findByIdAndUpdate(
      fileDoc.idModel,
      { $pull: { files: fileDoc._id } }, // Quita el ID de la lista de archivos
      { new: true }
    ).populate('files'); // POPULATE PARA DEVOLVERLO ACTUALIZADO
  }

  // 4) Eliminar de Mongo
  await Filedrive.findByIdAndDelete(idFile);

  response(res, 200, updatedProgram);
};


module.exports = {
  postUploadFile: catchAsync(postUploadFile),
  getFile: catchAsync(getFile),
  deleteIdFile:catchAsync(deleteIdFile),
  createFileDrive:catchAsync(createFileDrive),
  updateFileDrive:catchAsync(updateFileDrive),
  deleteFileDrive:catchAsync(deleteFileDrive),
  getFileDrive:catchAsync(getFileDrive)
};
