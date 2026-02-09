
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile, getPresignedPut, getPresignedGet } = require('./ovhController');
const mongoose = require('mongoose');
const { uploadFileToDrive, deleteFileById, getFileById, updateFileInDrive, appendFilesToArchiveOptimized } = require('./googleController');
const { User, Program, Jobs, Leavetype, Filedrive, Dispositive, Documentation, VolunteerApplication } = require('../models/indexModels'); // 👈 añadimos Dispositive
const archiver = require("archiver");

const sanitize = (text) =>
  String(text || "")
    .normalize("NFD")                          // quitar acentos
    .replace(/[\u0300-\u036f]/g, "")           // limpiar caracteres combinados
    .replace(/[^a-zA-Z0-9_\-]/g, "_")          // solo permitir A-Z 0-9 _ -
    .replace(/_+/g, "_")                       // evitar ___ repetidos
    .trim()
    .slice(0, 60);      

    

const zipPayrolls = async (req, res) => {
  const { userId } = req.body;

  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId).lean();
  if (!user || !user.payrolls || user.payrolls.length === 0)
    throw new ClientError("El usuario no tiene nóminas", 404);

  const archive = archiver("zip", { zlib: { level: 9 } });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=nominas_${sanitize(user.firstName)}_${sanitize(user.lastName)}.zip`
  );

  archive.pipe(res);

  // Preparamos una lista de "fileDocs" para la función optimizada
  const payrollDocs = user.payrolls.map(p => ({
    idDrive: p.pdf,
    fileLabel: `Nomina_${p.payrollYear}_${String(p.payrollMonth).padStart(2, "0")}`,
    description: null,
    originDocumentation: null
  }));

  // 🚀 Descargas concurrentes (más rápido y estable)
  await appendFilesToArchiveOptimized(payrollDocs, archive, 5);

  await archive.finalize();
};

const zipMultipleFiles = async (req, res) => {
  const { fileIds } = req.body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    throw new ClientError("fileIds debe ser un array con IDs", 400);
  }

  // 1️⃣ Obtener Filedrive
  const files = await Filedrive.find({ _id: { $in: fileIds } }).lean();
  if (!files || files.length === 0) {
    throw new ClientError("No se encontraron archivos para esos IDs", 404);
  }

  // 2️⃣ Preparar ZIP
  const archive = archiver("zip", { zlib: { level: 9 } });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=Documentos.zip`);
  archive.pipe(res);

  // 3️⃣ Preparamos docs para la función optimizada
  const listDocs = [];

  for (const fileDoc of files) {
    let baseName = "documento";

    // fileLabel
    if (fileDoc.fileLabel) baseName = fileDoc.fileLabel;

    // description
    else if (fileDoc.description) baseName = fileDoc.description;

    // documentación oficial
    if (fileDoc.originDocumentation) {
      const doc = await Documentation.findById(fileDoc.originDocumentation).select("name");
      if (doc?.name) baseName = doc.name;
    }

    listDocs.push({
      idDrive: fileDoc.idDrive,
      fileLabel: sanitize(baseName),
      description: null,
      originDocumentation: null
    });
  }

  // 🚀 Descarga concurrente optimizada (hasta 5 en paralelo)
  await appendFilesToArchiveOptimized(listDocs, archive, 5);

  // 4️⃣ Finalizar ZIP
  await archive.finalize();
};



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
 try {
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

 } catch (error) {
  console.log(error)
 }
}


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
      } else if(originModel.toLowerCase() === 'volunteerapplication'){
        updated = await VolunteerApplication.findByIdAndUpdate(
          idModel,
          { $push: { files: newFile._id } },
          { new: true, session }
        ).populate('files');
      }
    });
  } catch (err) {
    console.log(err)
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
        }  else if(originModel.toLowerCase() === 'volunteerapplication'){
        updatedParent = await VolunteerApplication.findByIdAndUpdate(
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
      }  else if (fileDoc.originModel.toLowerCase() === 'volunteerapplication') {
        updatedParent = await VolunteerApplication.findById(fileDoc.idModel).populate('files');
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
  } else if (fileDoc.originModel.toLowerCase() === 'volunteerapplication') {
    updatedParent = await VolunteerApplication.findByIdAndUpdate(
      fileDoc.idModel,
      { $pull: { files: fileDoc._id } },
      { new: true }
    ).populate('files');
  }

  await Filedrive.findByIdAndDelete(idFile);
  response(res, 200, updatedParent);
};



const MODEL_MAP = {
  user: "User",
  User: "User",
  program: "Program",
  Program: "Program",
  dispositive: "Dispositive",
  Dispositive: "Dispositive",
  finantial: "Finantial",
  Finantial: "Finantial",
  estadistics: "Estadistics",
  Estadistics: "Estadistics",
  usercv: "UserCv",
  UserCv: "UserCv",
  VolunteerApplication:'VolunteerApplication',
  volunteerapplication:'VolunteerApplication'
};

const listFile = async (req, res) => {
  const { originModel, idModel } = req.body;

  if (!originModel) {
    throw new ClientError("Falta originModel", 400);
  }
  if (!idModel) {
    throw new ClientError("Falta idModel", 400);
  }

  const canonicalModel = MODEL_MAP[originModel];
  if (!canonicalModel) {
    throw new ClientError("originModel no permitido", 400);
  }

  const files = await Filedrive.find({
    originModel: canonicalModel,
    idModel: new mongoose.Types.ObjectId(idModel),
  })
    .select("_id originDocumentation date fileLabel description idDrive category")
    .lean();

  response(res, 200, { items: files });
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
  zipMultipleFiles: catchAsync(zipMultipleFiles),
  zipPayrolls:catchAsync(zipPayrolls),
  listFile:catchAsync(listFile)

};
