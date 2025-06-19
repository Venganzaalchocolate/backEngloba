const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const cron = require('node-cron');
const stream = require('stream');
const FileHistory = require('../models/fileHistory');
const FileMapping = require('../models/fileMapping');
const { create } = require('../models/user');
const { User, Program, Jobs, Leavetype, Filedrive } = require('../models/indexModels');
const mongoose = require('mongoose');
const { PassThrough } = require('stream');




// const sourceFolderId = '1WmnFU8jv6ZY3BW0iSB1xXTpQoMbesU09'; // ID de la carpeta de datos actuales
const sourceFolderId = process.env.GOOGLE_DRIVE_PARENTFOLDER; // ID de la carpeta de datos actuales
const backup12hFolderId = '1cnQ_4ANsSr_R-HJ-uf15WNfc5w_4dTRG';
const backup3dFolderId = '1kxH3Su19Yz6WWCSCmfUSewmqymsDlL4l';
const emails = ['web@engloba.org.es', 'comunicacion@engloba.org.es'];


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
  'https://www.googleapis.com/auth/admin.directory.user.security'
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
//hjbg
const directory = google.admin({ version: 'directory_v1', auth });


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
async function gestionAutomaticaNominas() {
  // 1. Listar recursivamente todos los archivos dentro de la carpeta "NUEVAS_NOMINAS".
  //    Cada archivo contendrá la propiedad "oldParentId" que indica dónde se encontró.
  const listaArchivosNuevos = await listarArchivosEnCarpeta(process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS);

  if (!listaArchivosNuevos || listaArchivosNuevos.length === 0) {
    return;
  }

  for (const archivo of listaArchivosNuevos) {
    let archivoMovido = null;

    try {
      // 2. Procesar el nombre para extraer DNI, mes, año, etc.
      archivo.name = archivo.name.toUpperCase();
      const nombreSinExtension = archivo.name.replace('.PDF', '');
      const partes = nombreSinExtension.split('_');

      const dniExtraido = partes[0]; 
      let mesExtraido  = partes[1];
      mesExtraido = parseInt(mesExtraido, 10).toString();
      const anioExtraido = partes[2];

      let idNomina = false;
      if (partes.length > 3) {
        // OJO: en tu código usas "partes[4]" pero aquí partes[3] ya es el 4to elemento
        // Ajusta según tu nomenclatura real
        idNomina = partes[3]; 
      }

      // 3. Validar el DNI
      if (!validateDNIorNIE(dniExtraido)) {
        // El archivo no respeta el formato => lo movemos DIRECTAMENTE a la carpeta de fallos
        // usando su carpeta original donde se encontró (archivo.oldParentId) como removeParents
        await renombrarMoverArchivos(
          archivo.id,
          archivo.name,
          process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
          archivo.oldParentId 
        );
        throw new Error(`El nombre del archivo no sigue el formato esperado: ${dniExtraido}`);
      }

      // 4. Obtener/crear carpeta de año y mes
      const carpetaAnioId = await getOrCreateFolder(anioExtraido, process.env.GOOGLE_DRIVE_NOMINAS);
      const carpetaMesId  = await getOrCreateFolder(mesExtraido, carpetaAnioId);

      // 5. Crear el nuevo nombre para el archivo
      let nuevoNombre = `${dniExtraido}_${mesExtraido}_${anioExtraido}.pdf`;
      if (idNomina) {
        nuevoNombre = `${dniExtraido}_${mesExtraido}_${anioExtraido}_${idNomina}.pdf`;
      }

      // Guardamos información del archivo “original”
      // (dónde estaba realmente cuando lo listamos)
      const archivoOriginal = {
        id: archivo.id,
        name: archivo.name,
        parentId: archivo.oldParentId, // la carpeta real
      };

      // 6. Mover y renombrar el archivo a la carpeta del mes
      //    Remove = archivoOriginal.parentId (donde está de verdad),
      //    Add    = carpetaMesId
      archivoMovido = await renombrarMoverArchivos(
        archivo.id,
        nuevoNombre,
        carpetaMesId,
        archivoOriginal.parentId
      );

      if (!archivoMovido) {
        throw new Error(`No se pudo mover/renombrar el archivo: ${archivo.name}`);
      }

      // 7. Insertar la nómina en la BD
      const resultadoAddPayroll = await addPayroll(
        dniExtraido,
        mesExtraido,
        anioExtraido,
        archivoMovido.id
      );

      // Si falló la inserción en la BD, revertimos el archivo a carpeta de fallos
      if (resultadoAddPayroll === false) {
        // Al moverlo, removeParents = la carpeta actual (archivoMovido.parents[0])
        // addParents = carpeta de fallos
        const carpetaActual = archivoMovido.parents ? archivoMovido.parents[0] : carpetaMesId;
        await renombrarMoverArchivos(
          archivoMovido.id,
          archivo.name, 
          process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
          carpetaActual
        );
        console.log(`No se pudo insertar la nómina en la BD para DNI: ${dniExtraido}`);
        throw new Error(`No se pudo insertar la nómina en la BD para DNI: ${dniExtraido}`);
      }
    } catch (errorProcesandoArchivo) {
      console.error(`Error al procesar el archivo ${archivo.name}:`, errorProcesandoArchivo.message);

      // Si ya lo habíamos movido antes (archivoMovido existe), y falla después,
      // podríamos querer hacer un “rollback” distinto. Ojo con la lógica:
      if (!archivoMovido) {
        // Si archivoMovido NO existe, significa que el fallo ocurrió
        // ANTES de haber movido el archivo. 
        // Lo movemos directamente desde su oldParentId a FALLO_NOMINAS:
        try {
          await renombrarMoverArchivos(
            archivo.id,
            archivo.name, 
            process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
            archivo.oldParentId
          );
          console.log(`Se ha movido el archivo ${archivo.name} a la carpeta de fallos (rollback).`);
        } catch (errorRollback) {
          console.error(`Error al mover el archivo ${archivo.name} a fallos:`, errorRollback.message);
        }
      } else {
        // Si archivoMovido existe, entonces el archivo ya estaba en la nueva carpeta.
        // Podrías quererlo mover a fallos usando su NUEVO parent:
        try {
          const carpetaActual = archivoMovido.parents ? archivoMovido.parents[0] : process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS;
          await renombrarMoverArchivos(
            archivoMovido.id,
            archivoMovido.name, 
            process.env.GOOGLE_DRIVE_FALLO_NOMINAS,
            carpetaActual
          );
          console.log(`Se ha movido el archivo ${archivoMovido.name} a la carpeta de fallos (rollback).`);
        } catch (errorRollback) {
          console.error(`Error al mover el archivo ${archivo.name} a fallos:`, errorRollback.message);
        }
      }
    }
  }

  return true;
}

const prueba=async ()=>{
await gestionAutomaticaNominas();
}

prueba();
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

//


// sin 



// listarArchivosEnCarpeta(process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS)
//backup
// Funciones de Base de Datos




// let isRunning = false;


// cron.schedule('*/15 * * * *', async () => {
//     if (isRunning) {
//         console.log('La tarea anterior aún está en ejecución. Esperando la siguiente ejecución.');
//         return;
//     }
    
//     isRunning = true;
//     console.log('Iniciando verificación de archivos...');
    
//     try {
//         await gestionAutomaticaNominas();
//         console.log('Procesamiento finalizado.');
//     } catch (error) {
//         console.error('Error en procesamiento:', error);
//     } finally {
//         isRunning = false;
//     }
// });

// const pruebaSubir=async()=>{
//   await gestionAutomaticaNominas();
// }
// pruebaSubir();
// User.updateMany({}, { $set: { payrolls: [] } });
// const prueba=async ()=>{
//   await User.updateMany({}, { $set: { payrolls: [] } });
// }
//  prueba();




async function listOwnedItemsInFolder(folderId, emails) {
  try {
    const emailFilters = emails.map(email => `'${email}' in owners`).join(' or ');
    const query = `'${folderId}' in parents and (${emailFilters}) and trashed=false`;

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType)',
    });

    return res.data.files || [];
  } catch (error) {
    console.error('Error al listar archivos en la carpeta:', error);
    return [];
  }
}

/**
 * Borra todos los archivos propiedad de los emails indicados dentro de una carpeta (incluyendo subcarpetas).
 * @param {string} folderId - ID de la carpeta de Google Drive.
 * @param {string[]} emails - Array de emails de propietarios cuyos archivos se desean eliminar.
 */
async function deleteAllOwnedInFolder(folderId, emails) {
  try {
    // 1) Listar todos los elementos propiedad de los emails dentro de folderId
    const items = await listOwnedItemsInFolder(folderId, emails);

    // 2) Recorrer cada elemento y, si es carpeta, llamar recursivamente
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // Borrar primero su contenido
        await deleteAllOwnedInFolder(item.id, emails);
      }

      // Luego, eliminar el archivo o la carpeta en sí
      await drive.files.delete({ fileId: item.id });
      console.log(`Eliminado: ${item.name} (ID: ${item.id})`);
    }

    console.log(`Se han eliminado todos los elementos de la carpeta (ID: ${folderId}) propiedad de los emails proporcionados.`);
  } catch (error) {
    console.error('Error al eliminar archivos/carpetas:', error);
  }
}
/**
 * Eliminar todo el contenido de las carpetas de backup y limpiar la base de datos.
 */
async function resetAllBackups() {
  try {
    // Eliminar contenido de backup12h
    console.log('Eliminando contenido de la carpeta de backup 12h...');
    await deleteFolderContents(backup12hFolderId, false);
    console.log('Contenido de la carpeta de backup 12h eliminado.');

    // Eliminar contenido de backup3d
    console.log('Eliminando contenido de la carpeta de backup 3d...');
    await deleteFolderContents(backup3dFolderId, false);
    console.log('Contenido de la carpeta de backup 3d eliminado.');

    // Limpiar historial en MongoDB
    await FileHistory.deleteMany({});
    await FileMapping.deleteMany({});
    console.log('Historial de backups y mapeos eliminados de la base de datos.');
    console.log('Todos los backups y historiales han sido reseteados correctamente.');
  } catch (error) {
    console.error('Error al resetear los backups:', error);
  }
}

/**
 * Eliminar recursivamente todo el contenido de una carpeta de Drive.
 * @param {string} folderId - ID de la carpeta a vaciar.
 * @param {boolean} deleteFolderItself - Si es true, también elimina la carpeta raíz.
 */
async function deleteFolderContents(folderId, deleteFolderItself = false) {
  try {
    let pageToken = null;
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken
      });
      const files = response.data.files || [];

      for (const file of files) {
        // EXCLUSIÓN: Saltar el archivo si su nombre contiene "48938690E"


        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Subcarpeta => eliminar su contenido recursivamente y luego la carpeta
          await deleteFolderContents(file.id, true);
        } else {
          // Archivo => eliminar directamente
          await drive.files.delete({ fileId: file.id });
          console.log(`Archivo eliminado: "${file.name}" (ID: ${file.id})`);
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // Eliminar la carpeta raíz si se especifica
    if (deleteFolderItself) {
      await drive.files.delete({ fileId: folderId });
      console.log(`Carpeta eliminada: (ID: ${folderId})`);
    }
  } catch (error) {
    console.error(`Error al eliminar contenido de la carpeta (ID: ${folderId}):`, error);
  }
}



// Función para listar el contenido de las carpetas de backup
async function listBackupContents() {
  try {
    // Listar contenido de la carpeta 12h
    const contents12h = await listAllContentsRecursivelyBackup(backup12hFolderId);
    console.log('Contenido de backup (12h):');
    contents12h.forEach(item => {
      console.log(`- ${item.name} (ID: ${item.id}, MIME: ${item.mimeType})`);
    });

    // Listar contenido de la carpeta 3d
    const contents3d = await listAllContentsRecursivelyBackup(backup3dFolderId);
    console.log('Contenido de backup (3d):');
    contents3d.forEach(item => {
      console.log(`- ${item.name} (ID: ${item.id}, MIME: ${item.mimeType})`);
    });
  } catch (error) {
    console.error('Error al listar contenidos de las carpetas de backup:', error);
  }
}

// Programar backups usando node-cron
function scheduleBackups() {
  // Backup cada 12 horas
  cron.schedule('0 0,12 * * *', async () => {
    await checkForChangesAndBackup('12h', backup12hFolderId);
  });

  // Backup cada 3 días
  cron.schedule('0 0 */3 * *', async () => {
    await checkForChangesAndBackup('3d', backup3dFolderId);
  });

  console.log('Backups programados con node-cron.');
}

const initBackup = async () => {
  await checkForChangesAndBackup('12h', backup12hFolderId);
  await checkForChangesAndBackup('3d', backup3dFolderId);
}

// initBackup();
//resetAllBackups();



////////////////////////////////////////////////////////////////////////////////
// Funciones de Base de Datos
////////////////////////////////////////////////////////////////////////////////

async function loadPreviousState(backupType) {
  try {
    return await FileHistory.find({ backupType });
  } catch (error) {
    console.error('Error al cargar estado anterior:', error);
    return [];
  }
}

async function saveCurrentState(files, backupType) {
  try {
    await FileHistory.deleteMany({ backupType });
    const docs = files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      backupType
    }));
    await FileHistory.insertMany(docs);
    console.log(`Estado guardado en DB (backupType="${backupType}").`);
  } catch (error) {
    console.error('Error al guardar estado en DB:', error);
  }
}

async function getMapping(originalId, backupType) {
  try {
    return await FileMapping.findOne({ originalId, backupType });
  } catch (error) {
    console.error('Error al obtener mapping:', error);
    return null;
  }
}

async function setMapping(originalId, backupId, backupType) {
  try {
    await FileMapping.updateOne(
      { originalId, backupType },
      { $set: { backupId } },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error al establecer mapping:', error);
  }
}

async function removeMapping(originalId, backupType) {
  try {
    await FileMapping.deleteOne({ originalId, backupType });
  } catch (error) {
    console.error('Error al eliminar mapping:', error);
  }
}


////////////////////////////////////////////////////////////////////////////
// Funciones de Base de Datos
////////////////////////////////////////////////////////////////////////////

async function loadPreviousState(backupType) {
  try {
    return await FileHistory.find({ backupType });
  } catch (error) {
    console.error('Error al cargar estado anterior:', error);
    return [];
  }
}

async function saveCurrentState(files, backupType) {
  try {
    await FileHistory.deleteMany({ backupType });
    const docs = files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      backupType
    }));
    await FileHistory.insertMany(docs);
    console.log(`Estado guardado en DB (backupType="${backupType}").`);
  } catch (error) {
    console.error('Error al guardar estado en DB:', error);
  }
}

async function getMapping(originalId, backupType) {
  try {
    return await FileMapping.findOne({ originalId, backupType });
  } catch (error) {
    console.error('Error al obtener mapping:', error);
    return null;
  }
}

async function setMapping(originalId, backupId, backupType) {
  try {
    await FileMapping.updateOne(
      { originalId, backupType },
      { $set: { backupId } },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error al establecer mapping:', error);
  }
}

async function removeMapping(originalId, backupType) {
  try {
    await FileMapping.deleteOne({ originalId, backupType });
  } catch (error) {
    console.error('Error al eliminar mapping:', error);
  }
}

////////////////////////////////////////////////////////////////////////////
// Funciones de Google Drive
////////////////////////////////////////////////////////////////////////////

/**
 * Construir un árbol jerárquico de la carpeta de origen.
 * @param {string} folderId - ID de la carpeta raíz.
 * @returns {Promise<Object|null>} - Árbol jerárquico o null si falla.
 */
async function buildTreeRecursively(folderId) {
  try {
    const folderRes = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, modifiedTime'
    });
    const rootNode = {
      id: folderRes.data.id,
      name: folderRes.data.name,
      mimeType: folderRes.data.mimeType,
      modifiedTime: folderRes.data.modifiedTime,
      children: []
    };

    const queue = [rootNode];

    while (queue.length > 0) {
      const currentNode = queue.shift();

      let pageToken = null;
      do {
        const response = await drive.files.list({
          q: `'${currentNode.id}' in parents and trashed=false`,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
          pageSize: 1000,
          pageToken
        });

        const items = response.data.files || [];

        for (const item of items) {
          const childNode = {
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            modifiedTime: item.modifiedTime,
            children: []
          };
          currentNode.children.push(childNode);

          if (item.mimeType === 'application/vnd.google-apps.folder') {
            queue.push(childNode);
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);
    }

    return rootNode;
  } catch (error) {
    console.error(`Error al construir el árbol recursivo de la carpeta (ID: ${folderId}):`, error);
    return null;
  }
}

/**
 * Aplanar el árbol jerárquico en una lista plana.
 * @param {Object} node - Nodo raíz del árbol.
 * @returns {Array} - Lista plana de todos los nodos.
 */
function flattenTree(node) {
  const list = [];

  function traverse(currentNode) {
    list.push({
      id: currentNode.id,
      name: currentNode.name,
      mimeType: currentNode.mimeType,
      modifiedTime: currentNode.modifiedTime
    });

    if (currentNode.children && currentNode.children.length > 0) {
      for (const child of currentNode.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return list;
}

/**
 * Detectar cambios entre el estado anterior y el actual.
 * @param {Array} previousFiles - Lista de archivos anteriores.
 * @param {Array} currentFiles - Lista de archivos actuales.
 * @returns {Object} - Objeto con arrays de nuevos, modificados y eliminados.
 */
function detectChanges(previousFiles, currentFiles) {
  const changes = {
    newFiles: [],
    modifiedFiles: [],
    deletedFiles: []
  };

  const prevMap = new Map();
  previousFiles.forEach(f => prevMap.set(f.id, f));

  const currMap = new Map();
  currentFiles.forEach(f => currMap.set(f.id, f));

  // Detectar nuevos o modificados
  for (const file of currentFiles) {
    const old = prevMap.get(file.id);
    if (!old) {
      changes.newFiles.push(file);
    } else if (file.modifiedTime !== old.modifiedTime) {
      changes.modifiedFiles.push(file);
    }
  }

  // Detectar eliminados
  for (const oldFile of previousFiles) {
    if (!currMap.has(oldFile.id)) {
      changes.deletedFiles.push(oldFile);
    }
  }

  return changes;
}

/**
 * Asignar permisos a un archivo o carpeta.
 * @param {string} fileId - ID del archivo o carpeta.
 */
async function assignPermissions(fileId) {
  try {
    for (const email of emails) {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: email
        },
        sendNotificationEmail: false
      });
    }
    console.log(`Permisos asignados a: ${emails.join(', ')} para el archivo/carpeta (ID: ${fileId})`);
  } catch (error) {
    console.error(`Error al asignar permisos al archivo/carpeta (ID: ${fileId}):`, error);
  }
}

/**
 * Copiar una carpeta de forma recursiva.
 * @param {Object} node - Nodo de la carpeta a copiar.
 * @param {string} parentBackupFolderId - ID de la carpeta padre en el backup.
 * @param {string} backupType - Tipo de backup (e.g., '12h', '3d').
 * @returns {Promise<string|null>} - ID de la carpeta en el backup o null si falla.
 */
async function copyFolderTree(node, parentBackupFolderId, backupType) {
  try {
    const existingMapping = await getMapping(node.id, backupType);
    let newBackupId;

    if (existingMapping) {
      // Carpeta ya existe en el backup
      newBackupId = existingMapping.backupId;
      // console.log(`(Ya existe) Carpeta "${node.name}" => (backupID=${newBackupId})`);
    } else {
      // Crear carpeta en el backup
      const createRes = await drive.files.create({
        requestBody: {
          name: node.name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentBackupFolderId]
        },
        fields: 'id'
      });
      newBackupId = createRes.data.id;
      console.log(`Carpeta copiada: "${node.name}" => backupId=${newBackupId}`);

      // Asignar permisos
      await assignPermissions(newBackupId);

      // Guardar mapping
      await setMapping(node.id, newBackupId, backupType);
    }

    // Recorrer los hijos (subcarpetas y archivos)
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (child.mimeType === 'application/vnd.google-apps.folder') {
          await copyFolderTree(child, newBackupId, backupType);
        } else {
          await copySingleFile(child, newBackupId, backupType);
        }
      }
    }

    return newBackupId;
  } catch (error) {
    console.error(`Error al copiar la carpeta "${node.name}":`, error);
    return null;
  }
}

/**
 * Copiar un archivo simple.
 * @param {Object} fileNode - Nodo del archivo a copiar.
 * @param {string} parentBackupFolderId - ID de la carpeta padre en el backup.
 * @param {string} backupType - Tipo de backup (e.g., '12h', '3d').
 */
async function copySingleFile(fileNode, parentBackupFolderId, backupType) {
  try {
    const existing = await getMapping(fileNode.id, backupType);
    if (existing) {
      // Archivo ya existe en el backup
      // console.log(`(Ya existe) Archivo "${fileNode.name}" => no se copia.`);
      return;
    }

    // Copiar archivo en Drive
    const copyRes = await drive.files.copy({
      fileId: fileNode.id,
      requestBody: {
        parents: [parentBackupFolderId]
      }
    });
    const newBackupId = copyRes.data.id;
    console.log(`Archivo copiado: "${fileNode.name}" => backupId=${newBackupId}`);

    // Asignar permisos
    await assignPermissions(newBackupId);

    // Guardar mapping
    await setMapping(fileNode.id, newBackupId, backupType);
  } catch (error) {
    console.error(`Error al copiar archivo "${fileNode.name}":`, error);
  }
}

/**
 * Realizar el backup de los archivos nuevos y modificados.
 * @param {Object} changes - Objeto con arrays de nuevos, modificados y eliminados.
 * @param {Object} rootTree - Árbol jerárquico de la carpeta de origen.
 * @param {string} backupFolderId - ID de la carpeta de backup.
 * @param {string} backupType - Tipo de backup (e.g., '12h', '3d').
 */
async function performBackup(changes, rootTree, backupFolderId, backupType) {
  const { newFiles, modifiedFiles } = changes;

  // Separar carpetas y archivos para procesar carpetas primero
  const newOrModifiedFolders = [...newFiles, ...modifiedFiles].filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const newOrModifiedFiles = [...newFiles, ...modifiedFiles].filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

  // Procesar carpetas
  for (const folder of newOrModifiedFolders) {
    const node = findNodeById(rootTree, folder.id);
    if (!node) {
      console.error(`No se encontró el nodo en el árbol para la carpeta ID=${folder.id}`);
      continue;
    }
    await copyFolderTree(node, backupFolderId, backupType);
  }

  // Procesar archivos
  for (const file of newOrModifiedFiles) {
    const node = findNodeById(rootTree, file.id);
    if (!node) {
      console.error(`No se encontró el nodo en el árbol para el archivo ID=${file.id}`);
      continue;
    }

    // Obtener el ID de la carpeta de backup correspondiente al padre del archivo
    const parentFolderId = await getBackupParentFolderId(sourceFolderId, node.id, backupType);
    if (!parentFolderId) {
      console.error(`No se pudo determinar la carpeta de backup para el archivo ID=${file.id}`);
      continue;
    }

    await copySingleFile(node, parentFolderId, backupType);
  }
}

/**
 * Encontrar un nodo por su ID en el árbol jerárquico.
 * @param {Object} root - Nodo raíz del árbol.
 * @param {string} targetId - ID del nodo a encontrar.
 * @returns {Object|null} - Nodo encontrado o null.
 */
function findNodeById(root, targetId) {
  if (!root) return null;
  if (root.id === targetId) return root;

  if (root.children && root.children.length > 0) {
    for (const child of root.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Obtener el ID de la carpeta de backup correspondiente al padre del archivo.
 * @param {string} sourceRootId - ID de la carpeta raíz de origen.
 * @param {string} fileId - ID del archivo.
 * @param {string} backupType - Tipo de backup.
 * @returns {Promise<string|null>} - ID de la carpeta de backup o null.
 */
async function getBackupParentFolderId(sourceRootId, fileId, backupType) {
  try {
    // Obtener el ID del padre en el origen
    const res = await drive.files.get({
      fileId: fileId,
      fields: 'parents'
    });
    const sourceParentId = res.data.parents ? res.data.parents[0] : null;

    if (!sourceParentId) {
      console.error(`El archivo ID=${fileId} no tiene carpeta padre.`);
      return null;
    }

    // Obtener el mapping del padre
    const parentMapping = await getMapping(sourceParentId, backupType);
    if (!parentMapping) {
      console.error(`No hay mapping para la carpeta padre ID=${sourceParentId} en backupType="${backupType}"`);
      return null;
    }

    return parentMapping.backupId;
  } catch (error) {
    console.error(`Error al obtener el parentFolderId para el archivo ID=${fileId}:`, error);
    return null;
  }
}

/**
 * Eliminar archivos y carpetas del backup que ya no existen en el origen.
 * @param {Array} deletedFiles - Lista de archivos eliminados.
 * @param {string} backupType - Tipo de backup (e.g., '12h', '3d').
 */
async function removeDeletedFromBackup(deletedFiles, backupType) {
  for (const del of deletedFiles) {
    try {
      const mapping = await getMapping(del.id, backupType);
      if (!mapping) continue; // No existe en backup

      await drive.files.delete({ fileId: mapping.backupId });
      console.log(`Eliminado del backup: "${del.name}" (backupId=${mapping.backupId})`);

      await removeMapping(del.id, backupType);
    } catch (error) {
      console.error(`Error al eliminar del backup "${del.name}":`, error);
    }
  }
}

/**
 * Realizar el proceso completo de backup.
 * @param {string} backupType - Tipo de backup (e.g., '12h', '3d').
 * @param {string} backupFolderId - ID de la carpeta de backup.
 */
async function checkForChangesAndBackup(backupType, backupFolderId) {
  console.log(`[${backupType}] Iniciando backup con estructura recursiva...`);

  // 1) Cargar estado anterior desde la base de datos
  const previousFiles = await loadPreviousState(backupType);

  // 2) Construir el árbol jerárquico de la carpeta de origen
  const rootTree = await buildTreeRecursively(sourceFolderId);
  if (!rootTree) {
    console.error('No se pudo construir el árbol de la carpeta origen.');
    return;
  }

  // 3) Aplanar el árbol para comparar
  const currentFiles = flattenTree(rootTree);

  // 4) Detectar cambios
  const changes = detectChanges(previousFiles, currentFiles);
  console.log(`[${backupType}] Cambios detectados: Nuevos=${changes.newFiles.length}, Modificados=${changes.modifiedFiles.length}, Eliminados=${changes.deletedFiles.length}`);

  // 5) Copiar nuevos y modificados
  if (changes.newFiles.length > 0 || changes.modifiedFiles.length > 0) {
    await performBackup(changes, rootTree, backupFolderId, backupType);
  } else {
    console.log(`[${backupType}] No hay archivos nuevos o modificados para copiar.`);
  }

  // 6) Eliminar del backup lo que ya no existe en el origen
  if (changes.deletedFiles.length > 0) {
    await removeDeletedFromBackup(changes.deletedFiles, backupType);
  } else {
    console.log(`[${backupType}] No hay archivos eliminados para remover del backup.`);
  }

  // 7) Guardar el nuevo estado en la base de datos
  await saveCurrentState(currentFiles, backupType);

  console.log(`[${backupType}] Backup finalizado.\n`);
}

/**
 * Eliminar recursivamente todo el contenido de una carpeta de Drive.
 * @param {string} folderId - ID de la carpeta a vaciar.
 * @param {boolean} deleteFolderItself - Si es true, también elimina la carpeta raíz.
 */
async function deleteFolderContents(folderId, deleteFolderItself = false) {
  try {
    let pageToken = null;
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken
      });
      const files = response.data.files || [];

      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Subcarpeta => eliminar su contenido recursivamente y luego la carpeta
          await deleteFolderContents(file.id, true);
        } else {
          // Archivo => eliminar directamente
          await drive.files.delete({ fileId: file.id });
          console.log(`Archivo eliminado: "${file.name}" (ID: ${file.id})`);
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // Eliminar la carpeta raíz si se especifica
    if (deleteFolderItself) {
      await drive.files.delete({ fileId: folderId });
      console.log(`Carpeta eliminada: (ID: ${folderId})`);
    }
  } catch (error) {
    console.error(`Error al eliminar contenido de la carpeta (ID: ${folderId}):`, error);
  }
}




/**
 * Resetear todos los backups: eliminar contenido de carpetas de backup y limpiar la base de datos.
 */
async function resetAllBackups() {
  try {
    // Eliminar contenido de backup12h
    console.log('Eliminando contenido de la carpeta de backup 12h...');
    await deleteFolderContents(backup12hFolderId, false);
    console.log('Contenido de la carpeta de backup 12h eliminado.');

    // Eliminar contenido de backup3d
    console.log('Eliminando contenido de la carpeta de backup 3d...');
    await deleteFolderContents(backup3dFolderId, false);
    console.log('Contenido de la carpeta de backup 3d eliminado.');

    // Limpiar historial en MongoDB
    await FileHistory.deleteMany({});
    await FileMapping.deleteMany({});
    console.log('Historial de backups y mapeos eliminados de la base de datos.');

    console.log('Todos los backups y historiales han sido reseteados correctamente.');
  } catch (error) {
    console.error('Error al resetear los backups:', error);
  }
}

/**
 * Programar backups automáticos usando node-cron.
 */
function scheduleBackups() {
  // Backup cada 12 horas
  cron.schedule('0 0,12 * * *', async () => {
    console.log('--- Iniciando Backup de 12 horas ---');
    await checkForChangesAndBackup('12h', backup12hFolderId);
  });

  // Backup cada 3 días
  cron.schedule('0 0 */3 * *', async () => {
    console.log('--- Iniciando Backup de 3 días ---');
    await checkForChangesAndBackup('3d', backup3dFolderId);
  });

  console.log('Backups programados con node-cron.');
}


////////////////////////////////////////////////////////////////////////////////
// Función Principal de Inicialización
////////////////////////////////////////////////////////////////////////////////

// (async () => {


// //   Opcional: Resetear todos los backups antes de iniciar
//   //await resetAllBackups();

//   //Iniciar backups programados
//   //scheduleBackups();

// //   Opcional: Ejecutar un backup inmediato
//   console.log('--- Ejecutando Backup de 12 horas de inmediato ---');
//   await checkForChangesAndBackup('12h', backup12hFolderId);
//   console.log('--- Ejecutando Backup de 3 días de inmediato ---');
//   await checkForChangesAndBackup('3d', backup3dFolderId);

//   console.log('Servicio de backup iniciado y listo.');
// })();




const normalizeString = str =>
  (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // eliminar tildes
    .replace(/\s+/g, '')             // eliminar espacios
    .replace(/[^a-z0-9]/g, '');      // sólo letras y números

    function buildUserEmail(user) {
  const first = (user.firstName || '').trim().toLowerCase();
  const last  = (user.lastName  || '').trim().toLowerCase();
  // Normalizar sin tildes ni espacios
  const normalizedFirst = first
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const normalizedLast = last
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return `${normalizedFirst}.${normalizedLast}@${DOMAIN}`;
}

const DOMAIN = 'engloba.org.es';



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

// ————————————————————————————————————————————————————————————————————————
// 2) Función principal: conectar a Mongo, localizar devices y traer usuarios
// ————————————————————————————————————————————————————————————————————————
const targetPositionId =new mongoose.Types.ObjectId('66a7653546af20840262d0f9');

async function getUsersByProgramsAndAddToGroups() {
  try {
    // 5.1) Inicializar Admin SDK
   

    // 5.3) Buscar todos los programas activos cuyos acrónimos estén en la lista
    const programas = await Program.find({
      active: true,
      acronym: { $in: targetAcronyms }
    }).lean();

    if (!programas.length) {
      console.log('No se encontraron programas activos con esos acrónimos.');
      process.exit(0);
    }

    // 5.4) Extraer los ObjectId de todos los devices de esos programas
    const deviceIds = [];
    const deviceIdToName = new Map(); // mapa deviceId → normalizedDeviceName
    programas.forEach(prog => {
      if (Array.isArray(prog.devices)) {
        prog.devices.forEach(dev => {
          if (dev._id && dev.name) {
            deviceIds.push(dev._id);
            deviceIdToName.set(dev._id.toString(), normalizeString(dev.name));
          }
        });
      }
    });

    if (!deviceIds.length) {
      console.log('Los programas encontrados no tienen dispositivos asociados.');
      process.exit(0);
    }

    // 5.5) Buscar usuarios cuyo dispositiveNow contenga un elemento que cumpla:
    //      - device ∈ deviceIds
    //      - position == targetPositionId
    const usuarios = await User.find({
      dispositiveNow: {
        $elemMatch: {
          device: { $in: deviceIds },
          position: targetPositionId
        }
      }
    })
      .select('firstName lastName email dispositiveNow') // necesitamos email y dispositiveNow
      .lean();

    if (!usuarios.length) {
      console.log('No se encontraron trabajadores con esos dispositivos y posición dada.');
      process.exit(0);
    }

    console.log(`✅ Se encontraron ${usuarios.length} trabajadores a procesar:\n`);

    // 5.6) Para cada usuario, añadirlo a su grupo de dispositivo correspondiente
    for (const user of usuarios) {
      const fullName = `${user.firstName} ${user.lastName || ''}`.trim();
      const firstNameNormalized=normalizeString(user.firstName)
      const lastNameNormalized=normalizeString(user.lastName)
      const userEmail = `${firstNameNormalized}.${lastNameNormalized}@${DOMAIN}`;
      if (!userEmail) {
        console.warn(`⚠️ Usuario "${fullName}" no tiene email; se omite.`);
        continue;
      }

      // Filtrar los periodos que cumplan device ∈ deviceIds y position == targetPositionId
      const matchingPeriods = (user.dispositiveNow || []).filter(
        p =>
          p.device &&
          deviceIds.some(id => id.equals(p.device)) &&
          p.position &&
          p.position.equals(targetPositionId)
      );

      if (!matchingPeriods.length) {
        continue;
      }

      // Por cada periodo coincidente, determinar el grupo y añadir al usuario
      for (const period of matchingPeriods) {
        const deviceIdStr = period.device.toString();
        const normalizedDeviceName = deviceIdToName.get(deviceIdStr);
        const groupEmail = `${normalizedDeviceName}@${DOMAIN}`;

        console.log(`→ Añadiendo "${userEmail}" al grupo "${groupEmail}" ...`);
        try {
          await directory.members.insert({
            groupKey: groupEmail,
            requestBody: {
              email: userEmail,
              role: 'MEMBER',
              type: 'USER'
            }
          });
          console.log(`   ✅ "${userEmail}" añadido a "${groupEmail}".`);
        } catch (err) {
          const reason = err.errors?.[0]?.reason || err.code;
          if (reason === 'duplicate') {
            console.warn(`   ⚠️ "${userEmail}" ya es miembro de "${groupEmail}".`);
          } else {
            console.error(
              `   ❌ Error añadiendo "${userEmail}" a "${groupEmail}":`,
              JSON.stringify(err.errors || err, null, 2)
            );
          }
        }
      }

      console.log('---');
    }

    console.log('\n✅ Todos los usuarios han sido procesados.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en getUsersByProgramsAndAddToGroups():', err);
    process.exit(1);
  }
}

// getUsersByProgramsAndAddToGroups();

async function checkAllUsersInDeviceGroups() {
  try {
   
    // 4.3) Obtener todos los programas activos con acrónimo en targetAcronyms
    const programas = await Program.find({
      active: true,
      acronym: { $in: targetAcronyms }
    }).lean();

    if (!programas.length) {
      console.log('No se encontraron programas activos con esos acrónimos.');
      process.exit(0);
    }

    // 4.4) Construir mapa deviceId → groupEmail
    const deviceIdToGroup = new Map();
    programas.forEach(prog => {
      if (Array.isArray(prog.devices)) {
        prog.devices.forEach(dev => {
          if (dev._id && dev.name) {
            const normalized = normalizeString(dev.name);
            const groupEmail = `${normalized}@${DOMAIN}`;
            deviceIdToGroup.set(dev._id.toString(), groupEmail);
          }
        });
      }
    });

    if (!deviceIdToGroup.size) {
      console.log('Los programas no contienen dispositivos.');
      process.exit(0);
    }

    // 4.5) Buscar usuarios cuyo dispositiveNow tenga:
    //      - device ∈ deviceIds
    //      - position == targetPositionId
    const deviceIds = Array.from(deviceIdToGroup.keys()).map(id =>
      new mongoose.Types.ObjectId(id)
    );
    const usuarios = await User.find({
      dispositiveNow: {
        $elemMatch: {
          device: { $in: deviceIds },
          position: targetPositionId
        }
      }
    })
      .select('firstName lastName email dispositiveNow')
      .lean();

    if (!usuarios.length) {
      console.log('No se encontraron trabajadores con esos dispositivos y posición dada.');
      process.exit(0);
    }

    // 4.6) Construir lista de usuarios esperados por cada grupo de dispositivo
    //    Map: groupEmail → Set of userEmails
    const expectedMap = new Map();
    usuarios.forEach(u => {
      const firstNameNormalized=normalizeString(u.firstName)
      const lastNameNormalized=normalizeString(u.lastName)
      const userEmail = `${firstNameNormalized}.${lastNameNormalized}@${DOMAIN}`;
      const email = userEmail;
      if (!email) return;
      (u.dispositiveNow || []).forEach(p => {
        const devId = p.device?.toString();
        if (
          devId &&
          deviceIdToGroup.has(devId) &&
          p.position?.equals(targetPositionId)
        ) {
          const groupEmail = deviceIdToGroup.get(devId);
          if (!expectedMap.has(groupEmail)) {
            expectedMap.set(groupEmail, new Set());
          }
          expectedMap.get(groupEmail).add(email.toLowerCase());
        }
      });
    });

    // 4.7) Para cada grupoEmail en expectedMap, obtener miembros reales de ese grupo
    console.log('--- Comprobando usuarios faltantes en cada grupo de dispositivo ---');
    for (const [groupEmail, expectedSet] of expectedMap) {
      // Obtener miembros actuales (solo emails)
      const actualSet = new Set();
      let pageToken = null;
      do {
        const res = await directory.members.list({
          groupKey: groupEmail,
          maxResults: 200,
          pageToken
        });
        const members = res.data.members || [];
        members.forEach(m => {
          if (m.email) actualSet.add(m.email.toLowerCase());
        });
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      // Comparar expected vs actual: faltantes = expected – actual
      const missing = [];
      expectedSet.forEach(email => {
        if (!actualSet.has(email)) {
          missing.push(email);
        }
      });

      // Imprimir resultados para este grupo
      if (!missing.length) {
        console.log(`✅ ${groupEmail}: están todos los usuarios.`);
      } else {
        console.log(`❌ ${groupEmail}: faltan ${missing.length} usuarios:`);
        missing.forEach(e => console.log(`   • ${e}`));
      }
    }

    console.log('--- Fin de la comprobación ---');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en checkAllUsersInDeviceGroups():', err);
    process.exit(1);
  }
}

// ————————————————————————————————————————————————————————————————————————
// 5) Ejecutar la función
// ————————————————————————————————————————————————————————————————————————

// checkAllUsersInDeviceGroups();
async function addResponsiblesToDirGroups() {
  try {
    

    // 4.3) Cargar todos los programas activos, populando responsables y responsables de device
    //       (responsible y devices.responsible son arrays de ObjectId referenciando a User)
    const programas = await Program.find({ active: true })
      .populate('responsible', 'firstName lastName')
      .populate({
        path: 'devices.responsible',
        select: 'firstName lastName',
        model: 'User'
      })
      .lean();

    if (!programas.length) {
      console.log('No se encontraron programas activos.');
      process.exit(0);
    }

    // 4.4) Procesar cada programa
    for (const prog of programas) {
      const acronym = prog.acronym;
      const normalizedAcronym = normalizeString(acronym);
      const progDirGroup = `${normalizedAcronym}.dir@${DOMAIN}`;

      // 4.4.1) Responsables del programa → agregarlos a progDirGroup
      if (Array.isArray(prog.responsible) && prog.responsible.length) {
        for (const user of prog.responsible) {
          if (!user.firstName || !user.lastName) continue;
          const userEmail = buildUserEmail(user);
          console.log(`→ Añadiendo responsable de programa "${userEmail}" a "${progDirGroup}"`);
          try {
            await directory.members.insert({
              groupKey: progDirGroup,
              requestBody: {
                email: userEmail,
                role: 'MEMBER',
                type: 'USER'
              }
            });
            console.log(`   ✅ ${userEmail} añadido a ${progDirGroup}`);
          } catch (err) {
            const reason = err.errors?.[0]?.reason || err.code;
            if (reason === 'duplicate') {
              console.warn(`   ⚠️ ${userEmail} ya es miembro de ${progDirGroup}`);
            } else {
              console.error(`   ❌ Error al añadir ${userEmail} a ${progDirGroup}:`, JSON.stringify(err.errors || err, null, 2));
            }
          }
        }
      } else {
        console.log(`ℹ️ Programa "${acronym}" no tiene responsables definidos.`);
      }

      // 4.4.2) Responsables de cada dispositivo del programa → a <normalizedDevice>.dir@DOMAIN
      if (Array.isArray(prog.devices) && prog.devices.length) {
        for (const dev of prog.devices) {
          if (!dev.name) continue;
          const normalizedDevice = normalizeString(dev.name);
          const devDirGroup = `${normalizedDevice}.dir@${DOMAIN}`;

          if (Array.isArray(dev.responsible) && dev.responsible.length) {
            for (const user of dev.responsible) {
              if (!user.firstName || !user.lastName) continue;
              const userEmail = buildUserEmail(user);
              console.log(`→ Añadiendo responsable de dispositivo "${userEmail}" a "${devDirGroup}"`);
              try {
                await directory.members.insert({
                  groupKey: devDirGroup,
                  requestBody: {
                    email: userEmail,
                    role: 'MEMBER',
                    type: 'USER'
                  }
                });
                console.log(`   ✅ ${userEmail} añadido a ${devDirGroup}`);
              } catch (err) {
                const reason = err.errors?.[0]?.reason || err.code;
                if (reason === 'duplicate') {
                  console.warn(`   ⚠️ ${userEmail} ya es miembro de ${devDirGroup}`);
                } else {
                  console.error(`   ❌ Error al añadir ${userEmail} a ${devDirGroup}:`, JSON.stringify(err.errors || err, null, 2));
                }
              }
            }
          } else {
            console.log(`ℹ️ Dispositivo "${dev.name}" no tiene responsables definidos.`);
          }
        }
      }

      console.log('--------------------------------------------------');
    }

    console.log('✅ Todos los responsables procesados.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en addResponsiblesToDirGroups():', err);
    process.exit(1);
  }
}

// 5) Ejecutar la función
// addResponsiblesToDirGroups();


async function deleteAndRecreateResidencialAmanaNorte() {


  // 5) Anidar el subgrupo dentro del grupo principal
  try {
    await directory.members.insert({
      groupKey: 'residencialamanaalmerianorte@engloba.org.es',
      requestBody: {
        email: 'residencialamanaalmerianorte.dir@engloba.org.es',
        role: 'MEMBER',
        type: 'GROUP'
      }
    });
    
  } catch (err) {
    if (err.errors?.[0]?.reason === 'duplicate') {
    
    } else {
      
    }
  }

  console.log('✅ Operación completada: grupos borrados y recreados con la nomenclatura correcta.');
}

// Ejecutar la función
// // deleteAndRecreateResidencialAmanaNorte();
// Helper global — ahora lo ven todos
function sanitizeGroupName(str, maxLen = 75) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita tildes
    .replace(/[^0-9A-Za-z \-]/g, '')                    // solo letras-dígitos-espacios-guiones
    .trim()
    .slice(0, maxLen)
    .toLowerCase();
}

const { Types: { ObjectId } } = require('mongoose');
/* ─── 1. Mapa posición → correo de grupo ─────────────────────────── */
const POSITION_TO_GROUP = {
  '66a7653546af20840262d0f9': 'englobaasociacion.psico@engloba.org.es',
  '66a7652046af20840262d0dc': 'englobaasociacion.trab@engloba.org.es',
  '66a7650f46af20840262d0c1': 'englobaasociacion.edu@engloba.org.es',
};


const posIds   = Object.keys(POSITION_TO_GROUP).map(id => new ObjectId(id));

function buildUserEmail(user) {
  const first = normalizeString(user.firstName);
  const last  = normalizeString(user.lastName);
  return `${first}.${last}@${DOMAIN}`;   // ← SIEMPRE esta forma
}

/* ─── 2. Función principal ───────────────────────────────────────── */
async function syncGenericAssociationGroups() {
  try {
    console.log('\n┏━━━━━━━━ Sincronizando grupos genéricos de asociación ━━━━━━━━');

    /* 2.1  traer usuarios con alguna de las posiciones */
    const users = await User.find({
      dispositiveNow: {
        $elemMatch: { position: { $in: posIds } }
      }
    }).select('firstName lastName email dispositiveNow').lean();

    if (!users.length) {
      console.log('No hay usuarios para procesar. Fin.');
      return;
    }

    /* 2.2  construir mapa group → Set<email> esperados */
    const expected = new Map();                              // groupEmail → Set
    for (const user of users) {
      const uMail = buildUserEmail(user);
      if (!uMail.includes('@')) continue;                    // descarta sin email
      for (const hp of user.dispositiveNow) {
        const posId = hp.position?.toString();
        const gMail = POSITION_TO_GROUP[posId];
        if (!gMail) continue;
        if (!expected.has(gMail)) expected.set(gMail, new Set());
        expected.get(gMail).add(uMail);
      }
    }

    /* 2.3  procesar cada grupo */
    for (const [groupEmail, wantSet] of expected) {
      console.log(`\nGrupo: ${groupEmail}`);

      /* miembros actuales */
      const haveSet = new Set();
      let page = null;
      do {
        const { data } = await directory.members.list({
          groupKey: groupEmail,
          maxResults: 200,
          pageToken: page
        });
        (data.members || []).forEach(m => haveSet.add(m.email.toLowerCase()));
        page = data.nextPageToken;
      } while (page);

      /* diferencias */
      const missing = [...wantSet].filter(e => !haveSet.has(e));
      if (!missing.length) {
        console.log('  ✓ Todos los usuarios ya están.');
        continue;
      }

      /* añadir los que faltan */
      for (const email of missing) {
        try {
          await directory.members.insert({
            groupKey: groupEmail,
            requestBody: { email, role: 'MEMBER', type: 'USER' }
          });
          console.log(`  + Añadido: ${email}`);
        } catch (err) {
          const dup = err.errors?.[0]?.reason === 'duplicate';
          if (dup) console.log(`  · Ya estaba: ${email}`);
          else console.error(`  ! Error con ${email}: ${err.message}`);
        }
      }
    }

    console.log('\n✓ Sincronización completada.\n');
  } catch (err) {
    console.error('✖︎ Falló la sincronización:', err);
  }
}


async function findDevicesWithoutWorkspaceGroup() {
  console.log('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('┃ AUDITORÍA: Dispositivos sin grupo raíz');
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1) Recuperar solo lo necesario de todos los Program activos
  const programs = await Program.find()
    .select('acronym devices.name devices.active devices.groupWorkspace devices._id')
    .lean();

  const missing = [];     // dispositivos sin groupWorkspace
  const broken  = [];     // groupWorkspace inválido

  // 2) Revisar programa por programa
  for (const prog of programs) {
    console.log('\n✓ programa\n');
    const acr = prog.acronym;

    for (const dev of prog.devices || []) {               // saltar dispositivos inactivos

      if (!dev.groupWorkspace) {                // Caso 1: sin grupo
        missing.push({
          progId : prog._id,
          program: acr,
          devId  : dev._id,
          device : dev.name,
        });
        continue;
      }

      // Caso 2: existe valor → comprobar si el grupo sigue vivo
      try {
        await directory.groups.get({ groupKey: dev.groupWorkspace });
      } catch (err) {
        const reason = err?.errors?.[0]?.reason;
        if (reason === 'notFound' || err.code === 404 || err.code === 403) {
          broken.push({
            progId : prog._id,
            program: acr,
            devId  : dev._id,
            device : dev.name,
            saved  : dev.groupWorkspace
          });
        } else {
          // otro error inesperado → propagar
          throw err;
        }
      }
    }
  }

  // 3) Informe resumen
  console.log(`\n• Dispositivos SIN grupo asignado: ${missing.length}`);
  missing.forEach(d => console.log(`   – ${d.program} › ${d.device}`));

  console.log(`\n• Dispositivos con grupo ROTO:     ${broken.length}`);
  broken.forEach(d =>
    console.log(`   – ${d.program} › ${d.device}  → ${d.saved}`)
  );

  console.log('\n✓ Auditoría completada.\n');
  return { missing, broken };
}

// findDevicesWithoutWorkspaceGroup();

const normalize = s =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');



module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById,
  updateFileInDrive,
  gestionAutomaticaNominas,
  obtenerCarpetaContenedora
};