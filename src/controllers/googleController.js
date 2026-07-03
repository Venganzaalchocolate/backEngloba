const fs = require('fs');
const { google } = require('googleapis');
const { User, Program, Filedrive, Dispositive} = require('../models/indexModels');
const mongoose = require('mongoose');
const { PassThrough } = require('stream');
const { sendEmail } = require('./emailControllerGoogle');
const { buildPayrollAttachmentPlainText, buildPayrollAttachmentHtmlEmail, buildPayrollAppNotificationPlainText, buildPayrollAppNotificationHtmlEmail } = require('../templates/emailTemplates');
const path = require('path');
const pLimit = require('p-limit').default;

// 1. Decodificamos las credenciales
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

const PROTECTED_DRIVE_FOLDER_IDS = new Set([
  process.env.GOOGLE_DRIVE_APPFILE,
  process.env.GOOGLE_DRIVE_NOMINAS,
  process.env.GOOGLE_DRIVE_PARENTFOLDER,
  process.env.GOOGLE_DRIVE_FILES,
  process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS,
  process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
  process.env.GOOGLE_DRIVE_FILES_TEMPORALES,
  process.env.GOOGLE_DRIVE_RECIBIS,
  process.env.GOOGLE_DRIVE_PHOTOUSER,
].filter(Boolean));

function isProtectedDriveFolder(folderId) {
  return PROTECTED_DRIVE_FOLDER_IDS.has(folderId);
}

// 2. Extraemos client_email y private_key del JSON
const { client_email, private_key } = credentials;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',                       // Drive
  'https://www.googleapis.com/auth/admin.directory.orgunit',     // OUs (R/W)
  'https://www.googleapis.com/auth/admin.directory.user',        // Users (R/W)
  'https://www.googleapis.com/auth/admin.directory.group',       // Groups (R/W)
  'https://www.googleapis.com/auth/admin.directory.group.member', // Group members (R/W)
  'https://www.googleapis.com/auth/admin.directory.user.security',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  

];
// 3. Creamos la autenticación JWT con el 'subject'
//ss
const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: SCOPES,
  subject: 'archi@engloba.org.es',  // aquí se “impersona” a este usuario
});
const drive = google.drive({ version: 'v3', auth });
const directory = google.admin({ version: 'directory_v1', auth });


// googleController.js (añade esto)
async function moveDriveFile(fileId, addParentId, removeParentId, newName) {
  const res = await drive.files.update({
    fileId,
    addParents: addParentId,
    removeParents: removeParentId || undefined,
    requestBody: { name: newName },
    fields: 'id, parents, name'
  });
  return res.data;
}

// Helper: obtiene meta mínima y valida que NO sea carpeta
async function assertNotFolder(fileId) {
  const { data } = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, owners, trashed',
    supportsAllDrives: true,
  });

  if (data.mimeType === 'application/vnd.google-apps.folder') {
    const err = new Error(`❌ Bloqueado: intento de borrar CARPETA (${data.name || fileId})`);
    err.code = 'FOLDER_DELETE_BLOCKED';
    err.file = data;
    throw err;
  }

  return data; // incluye owners etc.
}

async function appendFilesToArchiveOptimized(fileDocs, archive, concurrency = 5) {
  const limit = pLimit(concurrency);

  const tasks = fileDocs.map(fileDoc =>
    limit(async () => {
      try {
        const result = await getFileById(fileDoc.idDrive);
        if (!result || !result.stream) return;

        // Construir nombre seguro
        let baseName =
          fileDoc.fileLabel ||
          fileDoc.description ||
          result.file?.name ||
          "documento";

        baseName = String(baseName)
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_\-\.]/g, "")
          || "documento";

        archive.append(result.stream, { name: `${baseName}.pdf` });
      } catch (err) {
        console.error(`❌ Error descargando ${fileDoc.idDrive}:`, err.message);
      }
    })
  );

  await Promise.all(tasks);
}

// Adoptar un archivo temporal y crear Filedrive sin volver a subir
async function adoptDriveFileIntoFiledrive({ driveId, originModel, idModel, meta, deviceId }) {
  const fileDoc = await new Filedrive({
    originModel,                  // 'User'
    idModel,                      // userId
    category: meta.category || 'Varios',
    date: meta.date || undefined,
    description: meta.description || meta.originalName || 'Documento',
    fileName: meta.fileName || meta.originalName,
    fileLabel: meta.fileLabel || meta.originalName,
    originDocumentation: meta.originDocumentation, // si aplica
    cronology: {},
    idDrive: driveId
  }).save();

  let updated;
  if (originModel.toLowerCase() === 'user') {
    updated = await User.findByIdAndUpdate(
      idModel,
      { $push: { files: { filesId: fileDoc._id } } },
      { new: true }
    ).populate('files.filesId');
  } else if (originModel.toLowerCase() === 'device') {
    updated = await Program.findOneAndUpdate(
      { _id: idModel, "devices._id": deviceId },
      { $push: { "devices.$.files": fileDoc._id } },
      { new: true }
    ).populate('devices.files');
  } else if (originModel.toLowerCase() === 'program') {
    updated = await Program.findByIdAndUpdate(
      idModel,
      { $push: { files: fileDoc._id } },
      { new: true }
    ).populate('files');
  }
  return { fileDoc, updated };
}


const deleteFileById = async (fileId) => {
  try {
    // 1) Validación anti-borrado de carpetas
    const meta = await assertNotFolder(fileId);

    // 2) Impersonación por owner (tu patrón)
    const owner = meta.owners?.[0]?.emailAddress;
    if (!owner) {
      const err = new Error(`No se pudo determinar owner para borrar ${fileId}`);
      err.code = 'OWNER_NOT_FOUND';
      throw err;
    }

    const authNew = new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
      subject: owner,
    });

    const driveNew = google.drive({ version: 'v3', auth: authNew });

    // 3) Borrado individual (NO carpeta)
    await driveNew.files.delete({
      fileId,
      supportsAllDrives: true,
    });

    return {
      success: true,
      message: 'Archivo eliminado correctamente',
      deleted: { id: meta.id, name: meta.name, mimeType: meta.mimeType, owner }
    };

  } catch (error) {
    // Si es carpeta, queremos que quede MUY claro en logs
    if (error.code === 'FOLDER_DELETE_BLOCKED') {
      return { success: false, message: error.message, code: error.code, file: error.file };
    }

    console.error('Error al eliminar archivo:', error?.message || error);
    return { success: false, message: 'Error al eliminar el archivo', error: error?.message || String(error) };
  }
};

// --- getFileById.js ---
const getFileById = async (fileId) => {
  const response = await drive.files.get({
    fileId,
    fields: 'owners', // También puedes pedir name, emailAddress, etc.
    supportsAllDrives: true
  });

  const owner = response.data.owners?.[0].emailAddress;
  const authNew = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: owner,  // aquí se “impersona” a este usuario
  });
  const driveNew = google.drive({ version: 'v3', auth:authNew });

  try {
    // Metadatos
    const { data: file } = await driveNew.files.get({
      fileId,
      fields: 'id, name, mimeType, parents',
      supportsAllDrives: true,
    });


    // Descarga como stream
    const response = await driveNew.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    // Aquí no lo convertimos a Buffer:
    // Retornamos directamente el stream
    return { file, stream: response.data };
  } catch (error) {
    console.error('Error al buscar o descargar el archivo:', error);
    return null;
  }
};

function getExtensionFromMime(mimetype) {
  switch (mimetype) {
    case 'application/pdf':
      return '.pdf';
    case 'application/msword':
      return '.doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    // Agrega otros casos según tus necesidades
    default:
      return '.bin';
  }
}

const updateFileInDrive = async (file, fileId, fileName) => {
  let fileStream;
  // Verifica si el archivo se encuentra en memoria o en disco
  if (file.buffer) {
    const pass = new PassThrough();
    pass.end(file.buffer);
    fileStream = pass;
  } else if (file.path) {
    fileStream = fs.createReadStream(file.path);
  } else {
    throw new Error("No se encontró buffer ni path en el archivo.");
  }

  // Si se pasa fileName, se le agrega la extensión según el mimeType
  const finalName = fileName ? fileName + getExtensionFromMime(file.mimetype) : undefined;

  try {
    const updateResponse = await drive.files.update({
      fileId,
      media: {
        mimeType: file.mimetype,
        body: fileStream,
      },
      requestBody: {
        // Actualizamos el nombre solo si se pasó fileName
        ...(finalName && { name: finalName }),
        mimeType: file.mimetype,
      },
      fields: 'id, name',
    });

    const updatedFile = updateResponse.data;
    return { id: updatedFile.id, name: updatedFile.name };
  } catch (error) {
    console.error('Error al actualizar el archivo en Google Drive:', error);
    return null;
  }
};

const uploadFileToDrive = async (file, folderId, driveName, resumable = false) => {
  let fileStream;
  // Si el archivo se ha subido en memoria, tendremos file.buffer
  if (file.buffer) {
    const pass = new PassThrough();
    pass.end(file.buffer);
    fileStream = pass;
  } else if (file.path) {
    // Si se usara diskStorage, se puede crear un stream desde file.path
    fileStream = fs.createReadStream(file.path);
  } else {
    throw new Error("No se encontró buffer ni path en el archivo.");
  }
  
  // Llama a la API de Google Drive para subir el archivo
  const response = await drive.files.create({
    requestBody: {
      name: driveName,
      parents: [folderId],
    },
    media: {
      mimeType: file.mimetype,
      body: fileStream,
    },
    fields: 'id',
  });
  return response.data;
};


//
// FUNCION PRINCIPAL
//


/* ========================================
 *   CACHE PARA CARPETAS AÑO / MES
 * ======================================== */
const folderCache = new Map();

async function getOrCreateFolderCached(name, parentId) {
  const key = `${parentId}:${name}`;
  if (folderCache.has(key)) return folderCache.get(key);

  const id = await getOrCreateFolder(name, parentId);
  folderCache.set(key, id);
  return id;
}

/* ========================================
 *   LISTAR ARCHIVOS — RECURSIVO
 * ======================================== */
async function listarArchivosRecursivo(folderId, acc = { files: [], folders: [] }) {
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,parents),nextPageToken",
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const item of res.data.files || []) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        acc.folders.push(item);
        await listarArchivosRecursivo(item.id, acc);
      } else {
        acc.files.push(item);
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return acc;
}

/* ========================================
 *   LISTAR ARCHIVOS — NO RECURSIVO
 * ======================================== */
async function listarArchivosDirecto(folderId) {
  const archivos = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name,parents),nextPageToken",
      pageToken,
    });
    archivos.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return archivos;
}


async function eliminarCarpetaSiVacia(folderId) {
  if (isProtectedDriveFolder(folderId)) return false;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if ((res.data.files || []).length > 0) return false;

  await drive.files.delete({
    fileId: folderId,
    supportsAllDrives: true,
  });

  return true;
}

// gestionAutomaticaNominas()
/* ========================================
 *   MOVER + RENOMBRAR SOLO SI CAMBIA EL NOMBRE
 * ======================================== */
async function moverYRenombrar(fileId, newName, addParent, removeParent, oldName) {
  const body = {};

  // solo renombramos si realmente cambia
  if (newName !== oldName) body.name = newName;

  const res = await drive.files.update({
    fileId,
    addParents: addParent,
    removeParents: removeParent,
    requestBody: body,
    fields: "id,name,parents",
  });

  return res.data;
}

/* ========================================
 *    FUNCIÓN PRINCIPAL
 * ======================================== */
async function gestionAutomaticaNominas() {
  console.log("🚀 Iniciando gestión automática de nóminas…");

  const { files: archivos, folders: subcarpetas } = await listarArchivosRecursivo(
    process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS
  );

  if (!archivos.length) {
    console.log("No hay archivos nuevos.");

    for (const carpeta of [...subcarpetas].reverse()) {
      try {
        const borrada = await eliminarCarpetaSiVacia(carpeta.id);
        if (borrada) console.log(`🗑️ Carpeta eliminada: ${carpeta.name}`);
      } catch (err) {
        console.error(`❌ Error eliminando carpeta ${carpeta.name}:`, err.message);
      }
    }

    return true;
  }

  console.log(`📄 ${archivos.length} archivos encontrados.`);

  const limit = pLimit(5);
  const tareas = archivos.map(archivo => limit(() => procesarArchivoNomina(archivo)));
  await Promise.all(tareas);

  for (const carpeta of [...subcarpetas].reverse()) {
    try {
      const borrada = await eliminarCarpetaSiVacia(carpeta.id);
      if (borrada) console.log(`🗑️ Carpeta eliminada: ${carpeta.name}`);
      else console.log(`📁 Carpeta conservada: ${carpeta.name}`);
    } catch (err) {
      console.error(`❌ Error eliminando carpeta ${carpeta.name}:`, err.message);
    }
  }

  console.log("🎉 Proceso completado.");
  return true;
}


/* ========================================
 *    PROCESAR CADA ARCHIVO
 * ======================================== */
async function procesarArchivoNomina(archivo) {
  const oldParent = archivo.parents[0];
  const nombreOriginal = archivo.name.toUpperCase();
  const nombreSinPDF = nombreOriginal.replace(".PDF", "");
  const partes = nombreSinPDF.split("_");

  try {
    const dni = partes[0];
    let mes = partes[1] ? parseInt(partes[1], 10).toString() : null;
    const anio = partes[2];
    const idNomina = partes[3] || null;

    if (!validateDNIorNIE(dni)) {
      console.log(`❌ Formato incorrecto: ${archivo.name}`);
      await moverYRenombrar(
        archivo.id,
        archivo.name,
        process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
        oldParent,
        archivo.name
      );
      return;
    }

    if (!mes) throw new Error("Mes no válido");
    if (!anio) throw new Error("Año no válido");

    let nuevoNombre = `${dni}_${mes}_${anio}.pdf`;
    if (idNomina) nuevoNombre = `${dni}_${mes}_${anio}_${idNomina}.pdf`;

    const movido = await moverYRenombrar(
      archivo.id,
      nuevoNombre,
      process.env.GOOGLE_DRIVE_NOMINAS,
      oldParent,
      archivo.name
    );

    const ok = await addPayroll(dni, mes, anio, movido.id);

    if (!ok) {
      console.log(`⚠️ Fallo BD → rollback ${archivo.name}`);
      const carpetaActual = movido.parents[0];
      await moverYRenombrar(
        movido.id,
        archivo.name,
        process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
        carpetaActual,
        movido.name
      );
    }

  } catch (err) {
    console.error(`❌ Error procesando ${archivo.name}:`, err.message);

    try {
      await moverYRenombrar(
        archivo.id,
        archivo.name,
        process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
        oldParent,
        archivo.name
      );
    } catch {}
  }
}



async function buscarCarpetasPorNombre(folderName, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents 
        and mimeType='application/vnd.google-apps.folder'
        and name='${folderName}'
        and trashed=false`,
    fields: 'files(id, name)'
  });
  
  return res.data.files || []; // array de folders
}

async function crearCarpeta(folderName, parentId) {

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };
  
  const res = await drive.files.create({
    resource: fileMetadata,
    fields: 'id, name'
  });

  return res.data; // { id, name }
}


async function getOrCreateFolder(folderName, parentId) {

  const existingFolders = await buscarCarpetasPorNombre(folderName, parentId);
  if (existingFolders.length > 0) {
    return existingFolders[0].id;
  }
  const newFolder = await crearCarpeta(folderName, parentId);
  return newFolder.id;
}

/**
 * Función que gestiona automáticamente las nóminas encontradas 
 * en la carpeta de Drive indicada en GOOGLE_DRIVE_NUEVAS_NOMINAS.
 */


const addPayroll = async (dniUser, payrollMonth, payrollYear, idFile) => {
  try {
    const userAux = await User.findOne({ dni: { $regex: `^${dniUser}$`, $options: 'i' } });
 // ← Corregido aquí, asumiendo modelo 'User'

    if (!userAux) {
      return false
    }

    const newPayroll = {
      payrollMonth: parseInt(payrollMonth),
      payrollYear: parseInt(payrollYear),
      pdf: idFile
    };

    userAux.payrolls.push(newPayroll);

    await userAux.save();
    if(userAux.employmentStatus=='ya no trabaja con nosotros'){
      await sendPayrollWithAttachmentEmail(userAux, { month: payrollMonth, year: payrollYear, idFile })
      //enviar email con nomina
    } else {
      await sendPayrollAppNotificationEmail(userAux, { month: payrollMonth, year: payrollYear });
    }
    return userAux;

  } catch (error) {
    
    return false
  }
};


const validateDNIorNIE = (value) => {
  // Eliminar espacios y convertir a mayúsculas
  value = value.trim().toUpperCase();

  // Expresiones regulares
  const dniPattern = /^[0-9]{8}[A-Z]$/;
  const niePattern = /^[XYZ][0-9]{7}[A-Z]$/;

  // Array de letras para el cálculo
  const letras = [
    "T",
    "R",
    "W",
    "A",
    "G",
    "M",
    "Y",
    "F",
    "P",
    "D",
    "X",
    "B",
    "N",
    "J",
    "Z",
    "S",
    "Q",
    "V",
    "H",
    "L",
    "C",
    "K",
    "E",
  ];

  // DNI
  if (dniPattern.test(value)) {
    const dniNumber = parseInt(value.substring(0, 8), 10);
    const dniLetter = value.charAt(8);
    return dniLetter === letras[dniNumber % 23];
  }

  // NIE
  if (niePattern.test(value)) {
    let nieNumber = value.substring(1, 8);
    const nieLetter = value.charAt(8);
    const niePrefix = value.charAt(0);

    switch (niePrefix) {
      case "X":
        nieNumber = "0" + nieNumber;
        break;
      case "Y":
        nieNumber = "1" + nieNumber;
        break;
      case "Z":
        nieNumber = "2" + nieNumber;
        break;
    }
    const nieNumberInt = parseInt(nieNumber, 10);
    return nieLetter === letras[nieNumberInt % 23];
  }

  return false; // no cumple ni DNI ni NIE
};


async function obtenerCarpetaContenedora(fileId) {

  try {
      const res = await drive.files.get({
          fileId: fileId,
          fields: 'parents'
      });

      if (res.data.parents && res.data.parents.length > 0) {
          return res.data.parents[0];
      } else {
          console.log('El archivo no tiene carpeta contenedora (puede estar en \"Mi unidad\").');
          return null;
      }
  } catch (error) {
      console.error('Error obteniendo la carpeta contenedora:', error);
      throw error;
  }
}


async function emailExiste(email) {
  try {
    const result=await directory.users.get({ userKey: email });
    // Si no lanza, es porque existe
    return true;
  } catch (err) {
    if (err.code === 404) {
      return false;
    }
    // Si es otro error, lo mostramos y lanzamos para que se note
    console.error(`Error al comprobar existencia de ${email}:`, err.errors || err);
    throw err;
  }
}








// Helper para convertir stream de Drive a Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Decide destinatarios (puedes reutilizar la lógica que quieras)
function getPayrollRecipients(user) {
  const corp = (user.email || '').trim().toLowerCase();
  const personal = (user.email_personal || '').trim().toLowerCase();

  if (user.employmentStatus === 'ya no trabaja con nosotros') {
    if (personal) return [personal];
    if (corp)     return [corp];
    return [];
  }

  // trabajador activo: primero corporativo, luego personal
  const out = [];
  if (corp) out.push(corp);
  if (personal && personal !== corp) out.push(personal);
  return out;
}

/**
 * 1) Notificar que la nómina está subida en la app (sin adjunto)
 */
async function sendPayrollAppNotificationEmail(user, { month, year }) {
  const to = getPayrollRecipients(user);
  if (!to.length) {
    console.warn('[sendPayrollAppNotificationEmail] Usuario sin email', user._id);
    return;
  }

  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const subject = 'Nueva nómina disponible en la app';

  const text = buildPayrollAppNotificationPlainText(name, month, year);
  const html = buildPayrollAppNotificationHtmlEmail(name, month, year);

  await sendEmail(to, subject, text, html);
}

/**
 * 2) Enviar email con la nómina adjunta (descargada desde Drive por idFile)
 */
async function sendPayrollWithAttachmentEmail(user, { month, year, idFile }) {
  const to = getPayrollRecipients(user);
  if (!to.length) {
    console.warn('[sendPayrollWithAttachmentEmail] Usuario sin email', user._id);
    return;
  }

  // 1) Descargamos de Drive
  const result = await getFileById(idFile);
  if (!result || !result.stream || !result.file) {
    throw new Error(`No se pudo obtener el archivo de Drive con id ${idFile}`);
  }

  const buffer = await streamToBuffer(result.stream);

  // 2) Preparamos adjunto
  const filename =
    result.file.name?.toLowerCase().endsWith('.pdf')
      ? result.file.name
      : `${result.file.name || 'nomina'}.pdf`;

  const attachments = [
    {
      filename,
      content: buffer,
      contentType: 'application/pdf',
    },
  ];

  // 3) Templates
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const subject = 'Nómina adjunta';

  const text = buildPayrollAttachmentPlainText(name, month, year);
  const html = buildPayrollAttachmentHtmlEmail(name, month, year);

  await sendEmail(to, subject, text, html, attachments);
}


async function listarArchivosEnSubcarpetasNominas(folderId, rootId, acc = []) {
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,parents),nextPageToken',
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const item of res.data.files || []) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        await listarArchivosEnSubcarpetasNominas(item.id, rootId, acc);
        continue;
      }

      const parentId = item.parents?.[0];
      if (!parentId) continue;

      // Solo queremos archivos que NO estén ya en la raíz de NOMINAS
      if (parentId !== rootId) {
        acc.push(item);
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return acc;
}

function pareceNombreNomina(name = '') {
  const normalized = String(name).trim().toUpperCase();
  return /^[XYZ0-9][0-9]{7}[A-Z]_\d{1,2}_\d{4}(?:_.+)?\.PDF$/.test(normalized);
}



module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById,
  updateFileInDrive,
  gestionAutomaticaNominas,
  obtenerCarpetaContenedora,
  moveDriveFile, 
  adoptDriveFileIntoFiledrive,
  appendFilesToArchiveOptimized,

  
};