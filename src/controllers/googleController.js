const fs = require('fs');
const { google } = require('googleapis');
const { User, Program, Filedrive, Dispositive} = require('../models/indexModels');
const mongoose = require('mongoose');
const { PassThrough } = require('stream');
const { sendEmail } = require('./emailControllerGoogle');
const { buildPayrollAttachmentPlainText, buildPayrollAttachmentHtmlEmail, buildPayrollAppNotificationPlainText, buildPayrollAppNotificationHtmlEmail } = require('../templates/emailTemplates');
const path = require('path');
const pLimit = require('p-limit').default;



function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina tildes
    .replace(/\s+/g, '')             // elimina espacios y guiones
    .replace(/[^a-z0-9]/g, '');      // solo alfanuméricos
}


// const sourceFolderId = '1WmnFU8jv6ZY3BW0iSB1xXTpQoMbesU09'; // ID de la carpeta de datos actuales
const sourceFolderId = process.env.GOOGLE_DRIVE_PARENTFOLDER; // ID de la carpeta de datos actuales
const backup12hFolderId = '1cnQ_4ANsSr_R-HJ-uf15WNfc5w_4dTRG';
const backup3dFolderId = '1kxH3Su19Yz6WWCSCmfUSewmqymsDlL4l';
const emails = ['web@engloba.org.es', 'comunicacion@engloba.org.es'];
const DOMAIN='engloba.org.es'


// 1. Decodificamos las credenciales
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

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
 *   LISTAR ARCHIVOS — NO RECURSIVO
 *   (MUCHO MÁS RÁPIDO)
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

  // 1) Listar archivos rápido (sin recursividad)
  const archivos = await listarArchivosDirecto(process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS);

  if (!archivos.length) {
    console.log("No hay archivos nuevos.");
    return true;
  }

  console.log(`📄 ${archivos.length} archivos encontrados.`);

  // Concurrency control: máximo 5 en paralelo
  const limit = pLimit(5);

  const tareas = archivos.map(archivo => 
    limit(() => procesarArchivoNomina(archivo))
  );

  await Promise.all(tareas);

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
    // Extract DNI, mes, año
    const dni = partes[0];
    let mes = partes[1] ? parseInt(partes[1], 10).toString() : null;
    const anio = partes[2];
    const idNomina = partes[3] || null;

    // Validar formato
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

    // Asegurar mes sin ceros a la izquierda
    if (!mes) throw new Error("Mes no válido");

    // Obtener carpetas año / mes (usando cache)
    const carpetaAnio = await getOrCreateFolderCached(anio, process.env.GOOGLE_DRIVE_NOMINAS);
    const carpetaMes  = await getOrCreateFolderCached(mes, carpetaAnio);

    // Nuevo nombre
    let nuevoNombre = `${dni}_${mes}_${anio}.pdf`;
    if (idNomina) nuevoNombre = `${dni}_${mes}_${anio}_${idNomina}.pdf`;

    // Mover + Renombrar rápido
    const movido = await moverYRenombrar(
      archivo.id,
      nuevoNombre,
      carpetaMes,
      oldParent,
      archivo.name
    );

    // Insertar BD
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

    // Mover a fallos desde su carpeta original
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


//---------------------
//CHAT
//--------------
// ✅ Añade aquí solo scopes de Chat (no mezcles con Drive/Gmail para Chat)
const CHAT_SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly", // spaces.list
  "https://www.googleapis.com/auth/chat.spaces",          // spaces.patch
  "https://www.googleapis.com/auth/chat.admin.spaces",    // spaces.search (admin)
  "https://www.googleapis.com/auth/chat.admin.memberships",
  "https://www.googleapis.com/auth/chat.messages.create",
  // si quieres borrar espacios/mensajes como admin:
  // "https://www.googleapis.com/auth/chat.admin.delete",
];

// Helpers
const normEmail = (e) => String(e || "").trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(e));
const assertSpaceName = (spaceName) => {
  if (!spaceName || !String(spaceName).startsWith("spaces/")) {
    throw new Error("spaceName inválido (esperado 'spaces/XXXX')");
  }
};
const assertMembershipName = (membershipName) => {
  if (!membershipName || !String(membershipName).includes("/members/")) {
    throw new Error("membershipName inválido (esperado 'spaces/.../members/...')");
  }
};

function readCredentials() {
  return JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf-8")
  );
}

function buildJwtClient(asUser, scopes = CHAT_SCOPES) {
  const credentials = readCredentials();
  const { client_email, private_key } = credentials;

  return new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes,
    subject: asUser,
  });
}

// Chat client (googleapis) — OK para spaces.list/search/messages/create/patch
function getChatClient(asUser, scopes = CHAT_SCOPES) {
  const auth = buildJwtClient(asUser, scopes);
  return google.chat({ version: "v1", auth });
}

// Token (para fallback HTTP)
async function getChatAccessToken(asUser = "archi@engloba.org.es") {
  const jwt = buildJwtClient(asUser, CHAT_SCOPES);
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("No se pudo obtener access_token");
  return token;
}

// Fallback HTTP: evita bug “Invalid filter query” del client en memberships.list
async function chatFetch(asUser, url, { method = "GET", body = null } = {}) {
  const token = await getChatAccessToken(asUser);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ============================================================================
   SPACES
   ============================================================================ */

// Lista espacios donde el usuario impersonado ES miembro
async function chatListSpaces({ adminUser = "archi@engloba.org.es", pageSize = 200 } = {}) {
  const chat = getChatClient(adminUser);

  let pageToken;
  const out = [];
  do {
    const res = await chat.spaces.list({ pageSize, pageToken });
    out.push(...(res.data.spaces || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return out.map((s) => ({
    name: s.name,
    displayName: s.displayName,
    spaceType: s.spaceType,
  }));
}

// Búsqueda admin (catálogo dominio). Requiere useAdminAccess:true
async function chatSearchSpaces({
  adminUser = "archi@engloba.org.es",
  query = "",
  pageSize = 200,
} = {}) {
  const chat = getChatClient(adminUser);

  let pageToken;
  const out = [];
  do {
    const res = await chat.spaces.search({
      useAdminAccess: true,
      requestBody: { query, pageSize, pageToken },
    });
    out.push(...(res.data.spaces || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return out.map((s) => ({
    name: s.name,
    displayName: s.displayName,
    spaceType: s.spaceType,
  }));
}

// Get space (googleapis)
async function chatGetSpace(spaceName, { adminUser = "archi@engloba.org.es", useAdminAccess = true } = {}) {
  assertSpaceName(spaceName);
  const chat = getChatClient(adminUser);
  const res = await chat.spaces.get({ name: spaceName, useAdminAccess: !!useAdminAccess });
  return res.data;
}

// Update space (renombrar, etc.)
async function chatUpdateSpace(
  spaceName,
  patch = {},
  {
    adminUser = "archi@engloba.org.es",
    useAdminAccess = true,
    updateMask = "displayName",
  } = {}
) {
  assertSpaceName(spaceName);
  const chat = getChatClient(adminUser);

  const res = await chat.spaces.patch({
    name: spaceName,
    useAdminAccess: !!useAdminAccess,
    updateMask,
    requestBody: patch,
  });

  return res.data;
}

/* ============================================================================
   MEMBERS (CRUD)
   - listMembers usa HTTP fallback para evitar “Invalid filter query”
   ============================================================================ */

// LIST members (HTTP fallback)
async function chatListMembers(
  spaceName,
  {
    adminUser = "archi@engloba.org.es",
    useAdminAccess = true,
    pageSize = 200,
    // 👇 NUEVO: permite override si quieres
    filter = null,
    showGroups = false,
    showInvited = false,
  } = {}
) {
  assertSpaceName(spaceName);

  let pageToken;
  const all = [];

  // ✅ regla obligatoria de Google cuando useAdminAccess=true
  const effectiveFilter =
    useAdminAccess
      ? (filter && String(filter).trim() ? String(filter).trim() : `member.type = "HUMAN"`)
      : (filter && String(filter).trim() ? String(filter).trim() : null);

  do {
    const qs = new URLSearchParams();
    qs.set("pageSize", String(pageSize));
    if (pageToken) qs.set("pageToken", pageToken);

    if (useAdminAccess) qs.set("useAdminAccess", "true");

    // ✅ AQUÍ LA CLAVE
    if (effectiveFilter) qs.set("filter", effectiveFilter);

    if (showGroups) qs.set("showGroups", "true");
    if (showInvited) qs.set("showInvited", "true"); // ojo: según doc, puede requerir user auth

    const url = `https://chat.googleapis.com/v1/${spaceName}/members?${qs.toString()}`;
    const data = await chatFetch(adminUser, url);

    all.push(...(data.memberships || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all.map((m) => ({
    name: m.name,
    state: m.state,
    role: m.role,
    memberName: m.member?.name,
    memberType: m.member?.type,
  }));
}

// ADD member (googleapis)
async function chatAddMember(
  spaceName,
  email,
  { adminUser = "archi@engloba.org.es", useAdminAccess = true } = {}
) {
  assertSpaceName(spaceName);
  if (!isEmail(email)) throw new Error(`Email inválido: ${email}`);

  const chat = getChatClient(adminUser);

  const res = await chat.spaces.members.create({
    parent: spaceName,
    useAdminAccess: !!useAdminAccess,
    requestBody: {
      member: { type: "HUMAN", name: `users/${normEmail(email)}` },
    },
  });

  return res.data; // { name, state, role, ... }
}

async function chatRemoveMember(
  membershipName,
  { adminUser = "archi@engloba.org.es", useAdminAccess = true } = {}
) {
  assertMembershipName(membershipName);

  const chat = getChatClient(adminUser);
  const res = await chat.spaces.members.delete({
    name: membershipName,
    useAdminAccess: !!useAdminAccess,
  });

  return res.data || { ok: true };
}

async function chatResolveUserIdByEmail(email) {
  const userKey = String(email || "").trim().toLowerCase();
  if (!userKey) return null;

  // Admin SDK Directory: userKey puede ser email
  const { data } = await directory.users.get({
    userKey,
    fields: "id,primaryEmail",
  });

  return data?.id ? String(data.id) : null;
}

async function chatRemoveMemberByEmail(
  spaceName,
  email,
  {
    adminUser = "archi@engloba.org.es",
    useAdminAccess = true,
  } = {}
) {
  assertSpaceName(spaceName);
  if (!isEmail(email)) throw new Error(`Email inválido: ${email}`);

  const targetEmail = normEmail(email);

  // 1) Resolver userId (clave)
  const userId = await chatResolveUserIdByEmail(targetEmail);
  if (!userId) {
    return { ok: false, reason: "USER_NOT_FOUND_IN_DIRECTORY", email: targetEmail };
  }

  const wantedById = `users/${userId}`;       // ✅ lo más habitual en memberships.list
  const wantedByEmail = `users/${targetEmail}`; // ✅ a veces viene así

  // 2) Listar miembros (admin access => filter obligatorio)
  const members = await chatListMembers(spaceName, {
    adminUser,
    useAdminAccess,
    filter: `member.type = "HUMAN"`,
  });

  // 3) Match flexible (ID o email)
  const hit = members.find((m) => {
    const mn = String(m.memberName || "").toLowerCase();
    return mn === wantedById.toLowerCase() || mn === wantedByEmail.toLowerCase();
  });

  if (!hit) {
    // útil para debug si vuelve a pasar
    return {
      ok: false,
      reason: "NOT_FOUND",
      email: targetEmail,
      debug: {
        wantedById,
        wantedByEmail,
        sampleMemberNames: members.slice(0, 10).map(x => x.memberName),
      },
    };
  }

  // 4) Borrar por membershipName
  await chatRemoveMember(hit.name, { adminUser, useAdminAccess });

  return { ok: true, removed: hit.name, email: targetEmail };
}
// UPDATE member role (googleapis)
async function chatSetMemberRole(
  membershipName,
  role,
  { adminUser = "archi@engloba.org.es", useAdminAccess = true } = {}
) {
  assertMembershipName(membershipName);

  const allowed = new Set(["ROLE_MEMBER", "ROLE_ASSISTANT_MANAGER", "ROLE_MANAGER"]);
  if (!allowed.has(role)) {
    throw new Error(`role inválido. Usa: ${Array.from(allowed).join(", ")}`);
  }

  const chat = getChatClient(adminUser);

  const res = await chat.spaces.members.patch({
    name: membershipName,
    useAdminAccess: !!useAdminAccess,
    updateMask: "role",
    requestBody: { role },
  });

  return res.data;
}

/* ============================================================================
   MESSAGES
   ============================================================================ */

async function chatPostMessage(
  spaceName,
  text,
  { adminUser = "archi@engloba.org.es" } = {}
) {
  assertSpaceName(spaceName);

  const msg = String(text || "").trim();
  if (!msg) throw new Error("text es obligatorio");

  const chat = getChatClient(adminUser);

  const res = await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: { text: msg },
  });

  return res.data;
}


/* ============================================================================
   PRUEBA LOCAL (opcional)
   - Ejecuta con: node src/controllers/googleController.js
   - Asegúrate de tener GOOGLE_SPACE_CHAT="spaces/AAQANd9GaSE" en .env
   ============================================================================ */

const spaceName = process.env.GOOGLE_SPACE_CHAT ;

/**
 * Añade al space de Google Chat a TODOS los responsables y coordinadores
 * de Programas + Dispositivos (Dispositive).
 *
 * - Obtiene ids de responsables/coordinadores
 * - Resuelve emails desde User
 * - Dedupe
 * - Añade miembros (uno a uno, con delay)
 *
 * @param {string} spaceName "spaces/AAQANd9GaSE"
 * @param {{
 *   adminUser?: string,
 *   useAdminAccess?: boolean,
 *   dryRun?: boolean,
 *   delayMs?: number,
 *   onlyActive?: boolean,          // filtra Program/Dispositive active=true
 *   includePrograms?: boolean,
 *   includeDispositives?: boolean,
 *   extraEmails?: string[],        // por si quieres meter alguno fijo
 *   logger?: Console
 * }} opts
 */
async function chatSyncAddManagersFromProgramsAndDispositives(
  spaceName,
  {
    adminUser = "archi@engloba.org.es",
    useAdminAccess = true,
    dryRun = true,
    delayMs = 150,
    onlyActive = true,
    includePrograms = true,
    includeDispositives = true,
    extraEmails = [],
    logger = console,
  } = {}
) {
  assertSpaceName(spaceName);

  const log = logger?.log || console.log;
  const warn = logger?.warn || console.warn;
  const error = logger?.error || console.error;
  const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);

  // 1) Programas / Dispositivos: recoger IDs
  const idSet = new Set();

  if (includePrograms) {
    const q = onlyActive ? { active: true } : {};
    const programs = await Program.find(q, { responsible: 1, coordinators: 1 }).lean();
    for (const p of programs) {
      for (const id of p.responsible || []) idSet.add(String(id));
      for (const id of p.coordinators || []) idSet.add(String(id));
    }
    log(`[${ts()}] Programs: ${programs.length} → ids únicos: ${idSet.size}`);
  }

  if (includeDispositives) {
    const q = onlyActive ? { active: true } : {};
    const dispositives = await Dispositive.find(q, { responsible: 1, coordinators: 1 }).lean();
    const before = idSet.size;
    for (const d of dispositives) {
      for (const id of d.responsible || []) idSet.add(String(id));
      for (const id of d.coordinators || []) idSet.add(String(id));
    }
    log(`[${ts()}] Dispositives: ${dispositives.length} → +${idSet.size - before} ids`);
  }

  const ids = Array.from(idSet);
  if (!ids.length) {
    warn(`[${ts()}] No hay responsables/coordinadores para añadir.`);
    return { ok: true, total: 0, added: 0, skipped: 0, errors: [] };
  }

  // 2) Resolver emails
  const users = await User.find(
    { _id: { $in: ids } },
    { email: 1, firstName: 1, lastName: 1 }
  ).lean();

  // elegimos email corporativo como prioridad
  const emails = [];
  for (const u of users) {
    const corp = String(u.email || "").trim().toLowerCase();
    if (corp && corp.includes("@")) emails.push(corp);
  }


  const uniqueEmails = Array.from(new Set(emails));
  if (!uniqueEmails.length) {
    warn(`[${ts()}] No hay emails corporativos resolubles para añadir.`);
    return { ok: true, total: 0, added: 0, skipped: 0, errors: [] };
  }

  // 3) (Opcional) evitar reintentos: listar miembros actuales y saltar los ya presentes
  // Esto es útil para no spamear la API (y evitar errores de "already exists")
  let existing = new Set();
  try {
    const members = await chatListMembers(spaceName, {
      adminUser,
      useAdminAccess,
      filter: `member.type = "HUMAN"`,
    });

    // memberName puede venir como users/{id} o users/{email}. Nos vale guardar ambos.
    for (const m of members) {
      const mn = String(m.memberName || "").trim().toLowerCase();
      if (mn.startsWith("users/")) existing.add(mn);
    }
  } catch (e) {
    warn(`[${ts()}] No pude listar miembros existentes (sigo igual). ${e?.message || e}`);
  }

  const results = { ok: true, total: uniqueEmails.length, added: 0, skipped: 0, errors: [] };

  log(`[${ts()}] Space: ${spaceName}`);
  log(`[${ts()}] Emails únicos candidatos: ${uniqueEmails.length}`);
  log(`[${ts()}] Modo: ${dryRun ? "DRY RUN" : "REAL"}`);

  // 4) Añadir 1 a 1 (con delay)
  for (let i = 0; i < uniqueEmails.length; i++) {
    const emailToAdd = uniqueEmails[i];
    const idx = `${i + 1}/${uniqueEmails.length}`;
    const asMemberEmail = `users/${emailToAdd}`;

    // si ya está por email (cuando Chat devuelve users/email)
    if (existing.has(asMemberEmail)) {
      results.skipped += 1;
      log(`[${ts()}] [${idx}] ↩︎ ya estaba: ${emailToAdd}`);
      continue;
    }

    try {
      if (dryRun) {
        results.added += 1;
        log(`[${ts()}] [DRY ${idx}] añadir → ${emailToAdd}`);
      } else {
        const res = await chatAddMember(spaceName, emailToAdd, { adminUser, useAdminAccess });
        results.added += 1;

        // marca como existente para evitar duplicados si se repite
        if (res?.member?.name) existing.add(String(res.member.name).toLowerCase());

        log(
          `[${ts()}] ✅ [${idx}] añadido → ${emailToAdd} (${res?.state || "OK"})`
        );
      }
    } catch (err) {
      const msg = err?.message || String(err);
      results.errors.push({ email: emailToAdd, error: msg });
      results.skipped += 1;
      error(`[${ts()}] ❌ [${idx}] ${emailToAdd} → ${msg}`);
    }

    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  log(
    `[${ts()}] — Resumen Chat: candidatos ${results.total} | añadidos ${results.added} | omitidos ${results.skipped} | errores ${results.errors.length}`
  );

  return results;
}


const prueba=async()=>{

// await chatPostMessage(spaceName, textDocs);
// await chatPostMessage(spaceName, textGroups);
}

//prueba()

module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById,
  updateFileInDrive,
  gestionAutomaticaNominas,
  obtenerCarpetaContenedora,
  moveDriveFile, 
  adoptDriveFileIntoFiledrive,
  appendFilesToArchiveOptimized
  
};