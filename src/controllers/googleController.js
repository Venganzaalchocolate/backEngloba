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
  'https://www.googleapis.com/auth/admin.directory.user.security',
  'https://www.googleapis.com/auth/gmail.send'
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




module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById,
  updateFileInDrive,
  gestionAutomaticaNominas,
  obtenerCarpetaContenedora
};