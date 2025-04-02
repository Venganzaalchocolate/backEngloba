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

// 3. Creamos la autenticación JWT con el 'subject'
const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: ['https://www.googleapis.com/auth/drive'],
  subject: 'archi@engloba.org.es',  // aquí se “impersona” a este usuario
});
const drive = google.drive({ version: 'v3', auth });
//hjbg


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
  try {
    // Metadatos
    const { data: file } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    });


    // Descarga como stream
    const response = await drive.files.get(
      { fileId, alt: 'media' },
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

// async function transferirPropiedadArchivo(fileId) {
//   const auth = new google.auth.JWT({
//     email: client_email,
//     key: private_key,
//     scopes: ['https://www.googleapis.com/auth/drive'],
//     subject: 'nominas@engloba.org.es',  // aquí se “impersona” a este usuario
//   });
//   const drive = google.drive({ version: 'v3', auth });
//   try {
//     // Crea un nuevo permiso con role: 'owner' para 'archi@engloba.org.es'
//     const response = await drive.permissions.create({
//       fileId,
//       requestBody: {
//         role: 'owner',
//         type: 'user',
//         emailAddress: 'archi@engloba.org.es'
//       },
//       // Esto indica que realmente se está transfiriendo la propiedad
//       transferOwnership: true,
//       // Si el archivo estuviera en una Shared Drive, añade:
//       supportsAllDrives: true
//     });

//     return response.data;
//   } catch (error) {
//     console.error('Error transfiriendo la propiedad:', error);
//     return false;
//   }
// }

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




let isRunning = false;


cron.schedule('*/15 * * * *', async () => {
    if (isRunning) {
        console.log('La tarea anterior aún está en ejecución. Esperando la siguiente ejecución.');
        return;
    }
    
    isRunning = true;
    console.log('Iniciando verificación de archivos...');
    
    try {
        await gestionAutomaticaNominas();
        console.log('Procesamiento finalizado.');
    } catch (error) {
        console.error('Error en procesamiento:', error);
    } finally {
        isRunning = false;
    }
});

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









module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById,
  updateFileInDrive,
  gestionAutomaticaNominas,
  obtenerCarpetaContenedora
};