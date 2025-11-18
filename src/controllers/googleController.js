const fs = require('fs');
const { google } = require('googleapis');
const { User, Program} = require('../models/indexModels');
const mongoose = require('mongoose');
const { PassThrough } = require('stream');
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
    // Eliminar el archivo en Google Drive usando el fileId
    await driveNew.files.delete({
      fileId: fileId,
    });
    return { success: true, message: 'Archivo eliminado correctamente' };

  } catch (error) {
    
    return { success: false, message: 'Error al eliminar el archivo' };
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



// const prueba=async ()=>{
// await gestionAutomaticaNominas();
// }

// prueba();
//

// FUNCION RECURSIVA: LISTA ARCHIVOS (Y SUBCARPETAS)
//
async function listarArchivosEnCarpeta(folderId, archivos = []) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      // IMPORTANTE: incluyo "parents" para saber exactamente dónde está el archivo
      fields: 'files(id, name, mimeType, parents)',
    });

    const items = res.data.files;

    for (const item of items) {
      // Guardamos dónde se encontró realmente este item
      item.oldParentId = folderId;

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // Recursividad: busco archivos en la subcarpeta
        await listarArchivosEnCarpeta(item.id, archivos);
      } else {
        // Es un archivo, lo agrego a mi array final
        archivos.push(item);
      }
    }

    return archivos;
  } catch (error) {
    console.error('Error al listar archivos:', error);
    return false;
  }
}


//
// MOVER UN ARCHIVO A OTRA CARPETA Y RENOMBRARLO
// - idArchivo: ID del archivo
// - nuevoNombre: nombre final (puede ser igual al actual)
// - folderDestinoId: carpeta que se agrega en "addParents"
// - folderOrigenId: carpeta que se quita en "removeParents"
//
async function renombrarMoverArchivos(idArchivo, nuevoNombre, folderDestinoId, folderOrigenId) {
  try {
    const res = await drive.files.update({
      fileId: idArchivo,
      addParents: folderDestinoId,
      removeParents: folderOrigenId,
      requestBody: {
        name: nuevoNombre,
      },
      fields: 'id, parents, name',
    });

    return res.data; 
  } catch (error) {
    console.error('Error moviendo o renombrando archivo:', error);
    return false;
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





// ————————————————————————————————————————————————————————————————————————
// 3) Crear grupos de programa y anidar el subgrupo de directores
// ————————————————————————————————————————————————————————————————————————
async function crearGruposProgramasSinSubgrupos() {
  const programs = await Program.find({ active: true }).lean();
  console.log('--- Creación de grupos de programas (solo grupos principales) ---');

  // Helper “get or insert”: devuelve siempre el objeto group
  async function getOrCreateGroup(email, name, description) {
    try {
      const { data } = await directory.groups.get({ groupKey: email });
      console.log(`ℹ️  Ya existía: ${email} (id ${data.id})`);
      return data;
    } catch (err) {
      if (err.code === 404) {
        const { data } = await directory.groups.insert({
          requestBody: { email, name, description }
        });
        console.log(`✅ Creado: ${email} (id ${data.id})`);
        return data;
      }
      throw err;
    }
  }

  for (const prog of programs) {
    const acro      = normalizeString(prog.acronym);
    const email     = `${acro}@${DOMAIN}`;
    const name      = `Programa: ${prog.acronym}`;
    const desc      = `Grupo para el programa "${prog.acronym}"`;

    // Crear o recuperar el grupo principal
    const mainGroup = await getOrCreateGroup(email, name, desc);

    // Guardar el id en groupWorkspace
    await Program.findByIdAndUpdate(
      prog._id,
      { groupWorkspace: mainGroup.id },
      { new: true }
    );
    console.log(`   → Document Program ${prog._id} actualizado con groupWorkspace: ${mainGroup.id}`);
    console.log('--------------------------------------------------');
  }

  console.log('--- Fin creación programas (sin subgrupos) ---\n');
}
/**
 * Reintenta crear/anidar únicamente los subgrupos de dirección
 * para aquellos Program que no tengan aún ningún ID en subGroupWorkspace.
 */

/**
 * Reintenta crear/anidar únicamente los subgrupos de dirección
 * para aquellos Program que no tengan aún ningún ID en subGroupWorkspace,
 * generando los nombres en minúsculas.
 */
/**
 * Reintenta crear/anidar únicamente los subgrupos de dirección
 * para aquellos Program que no tengan aún ningún ID en subGroupWorkspace,
 * usando nombres sanitizados que eliminen los dos puntos y otros caracteres
 * inválidos según los requisitos de la API (solo letras, números, espacios y guiones).
 */
async function crearSubgruposProgramasFallidos() {
  console.log('--- Reintentar creación de subgrupos fallidos (nombres sanitizados) ---');

  // 1) Solo programas activos sin subGroupWorkspace o con array vacío
  const programs = await Program.find({
    active: true,
    $or: [
      { subGroupWorkspace: { $exists: false } },
      { subGroupWorkspace: { $size: 0 } }
    ]
  }).lean();

  if (!programs.length) {
    console.log('✅ No hay programas pendientes de subgrupo.');
    return;
  }

  console.log(`ℹ️  Se procesarán ${programs.length} programas: ` +
              programs.map(p => p.acronym).join(', '));

  /**
   * Sanitiza el displayName del grupo:
   * - Quita acentos
   * - Elimina todo excepto letras, números, espacios y guiones
   * - Pasa a minúsculas
   * - Recorta a maxLen (75) caracteres
   */
  function sanitizeGroupName(input, maxLen = 75) {
    let s = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');       // quita diacríticos
    s = s.replace(/[^0-9A-Za-z \-]/g, '');     // solo letras, dígitos, espacios y guiones
    s = s.trim().toLowerCase();
    if (s.length > maxLen) s = s.slice(0, maxLen).trim();
    return s;
  }

  // Helper “get or insert” usando el name sanitizado
  async function getOrCreateGroup(email, rawName, description) {
    const name = sanitizeGroupName(rawName);
    try {
      const { data } = await directory.groups.get({ groupKey: email });
      console.log(`ℹ️  Ya existía: ${email} (id ${data.id}, name="${name}")`);
      return data;
    } catch (err) {
      if (err.code === 404) {
        const { data } = await directory.groups.insert({
          requestBody: { email, name, description }
        });
        console.log(`✅ Creado: ${email} (id ${data.id}, name="${name}")`);
        return data;
      }
      throw err;
    }
  }

  for (const prog of programs) {
    const acro      = normalizeString(prog.acronym).toLowerCase();
    const mainEmail = `${acro}@${DOMAIN}`;
    const dirEmail  = `${acro}.dir@${DOMAIN}`;
    const rawDirName = `Dirección ${prog.acronym}`;   // quitamos los dos puntos del raw
    const dirDesc   = `Grupo de dirección para el programa "${prog.name}"`;


    let dirGroup;
    try {
      console.log(rawDirName)
      // 2) Crear o recuperar el subgrupo fallido
      dirGroup = await getOrCreateGroup(dirEmail, rawDirName, dirDesc);
    } catch (err) {
      console.error(`❌ Error creando/verificando subgrupo ${dirEmail}:`, err.message);
      continue;
    }

    // 3) Guardar el id del subgrupo (machacando) en subGroupWorkspace
    try {
      await Program.findByIdAndUpdate(
        prog._id,
        { $set: { subGroupWorkspace: [dirGroup.id] } },
        { new: true }
      );
      console.log(`   → Program ${prog.acronym} actualizado subGroupWorkspace: [${dirGroup.id}]`);
    } catch (err) {
      console.error(`❌ Error guardando subGroupWorkspace para ${prog._id}:`, err.message);
    }

    // 4) Anidar el subgrupo en el grupo principal
    try {
      await directory.members.insert({
        groupKey: mainEmail,
        requestBody: { email: dirEmail, role: 'MEMBER', type: 'GROUP' }
      });
      console.log(`   → Anidado: ${dirEmail} en ${mainEmail}`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`   → Ya estaba anidado: ${dirEmail}`);
      } else {
        console.warn(`   ⚠️ Error anidando ${dirEmail} en ${mainEmail}:`, err.message);
      }
    }

    console.log('--------------------------------------------------');
  }

  console.log('--- Fin reintento de subgrupos fallidos ---\n');
}




// ————————————————————————————————————————————————————————————————————————
// 4) Crear grupos de dispositivos y subgrupos de dirección
// ————————————————————————————————————————————————————————————————————————

/**
 * Crea en Workspace un grupo para cada dispositivo activo dentro de cada programa,
 * y guarda su ID en el campo `devices.$.groupWorkspace` de cada subdocumento.
 */
async function crearGruposDispositivos() {
  console.log('--- Creación de grupos para dispositivos de programas ---');

  // 1) Busca todos los programas activos (sin lean para poder hacer updateOne)
  const programs = await Program.find().lean();

  // Sanitiza el displayName del grupo:
  function sanitizeGroupName(input, maxLen = 75) {
    let s = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')    // quita acentos
      .replace(/[^0-9A-Za-z \-]/g, '')    // solo letras, dígitos, espacios y guiones
      .trim();
    if (s.length > maxLen) s = s.slice(0, maxLen).trim();
    return s;
  }

  // Helper “get or insert”: devuelve siempre el objeto group
  async function getOrCreateGroup(email, rawName, description) {
    const name = sanitizeGroupName(rawName);
    try {
      const { data } = await directory.groups.get({ groupKey: email });
      console.log(`ℹ️  Ya existía: ${email} (id ${data.id})`);
      return data;
    } catch (err) {
      if (err.code === 404) {
        const { data } = await directory.groups.insert({
          requestBody: { email, name, description }
        });
        console.log(`✅ Creado: ${email} (id ${data.id}, name="${name}")`);
        return data;
      }
      throw err;
    }
  }

  for (const prog of programs) {
    const progAcronym = normalizeString(prog.acronym).toLowerCase();
    const progName    = prog.name;

    // 2) Para cada dispositivo activo en el programa
    for (const dev of prog.devices || []) {

      // Determina email y displayName
      const devSlug     = normalizeString(dev.name).toLowerCase().replace(/ /g, '-');
      const email       = `${devSlug}@${DOMAIN}`;
      const rawName     = `Dispositivo: ${dev.name}`;
      const description = `Grupo para el dispositivo "${dev.name}" del programa "${progName}"`;

      let group;
      try {
        // 3) Crear o recuperar el grupo en Workspace
        group = await getOrCreateGroup(email, rawName, description);
      } catch (err) {
        console.error(`❌ Error creando/verificando grupo ${email}: ${err.message}`);
        continue;
      }

      // 4) Guardar el ID en devices.$.groupWorkspace
      try {
        await Program.updateOne(
          { _id: prog._id, "devices._id": dev._id },
          { $set: { "devices.$.groupWorkspace": group.id } }
        );
        console.log(`   → Program ${prog.acronym}, dispositivo "${dev.name}" actualizado groupWorkspace: ${group.id}`);
      } catch (err) {
        console.error(`❌ Error guardando groupWorkspace para dispositivo ${dev.name}: ${err.message}`);
      }
    }

    console.log('--------------------------------------------------');
  }

  console.log('--- Fin creación de grupos de dispositivos ---\n');
}

// Ejecutar la función cuando quieras:
// crearGruposDispositivos().catch(err => console.error(err));




async function listarTodosLosGrupos() {
  const emails = new Set();
  let pageToken = null;
  do {
    const res = await directory.groups.list({
      customer: 'my_customer',
      maxResults: 200,
      pageToken,
      orderBy: 'email'
    });
    const grupos = res.data.groups || [];
    grupos.forEach(g => {
      if (g.email) emails.add(g.email.toLowerCase());
    });
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return emails;
}



// ————————————————————————————————————————————————————————————————————————
// 1) Lista de acrónimos de los programas que nos interesan
// ————————————————————————————————————————————————————————————————————————

const targetAcronyms = [
  'CAI',
  'CRB',
  'DE',
  'ISL',
  '+18 JEM',
  'COILS',
  'PAI FSE',
  'POISL',
  'PAI LANZADERA',
  'PAI CONCIERTO SOCIAL',
  'CS',
  'CAR',
  'DAJMA',
  'CMD',
  'CAIP',
  'PAIMAS'
];






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