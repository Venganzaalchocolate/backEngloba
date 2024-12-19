const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const cron = require('node-cron');
const stream = require('stream');
const File = require('../models/fileHistory');

// Cargar el estado anterior desde MongoDB
async function loadPreviousState() {
  try {
    const files = await File.find({});
    return files;
  } catch (error) {
    console.error('Error al cargar el estado anterior de MongoDB:', error);
    return [];
  }
}

// Guardar el estado actual en MongoDB
async function saveCurrentState(files) {
  try {
    // Elimina el estado anterior
    await File.deleteMany({});

    // Guarda el nuevo estado
    const fileDocs = files.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      isFolder: file.mimeType === 'application/vnd.google-apps.folder'
    }));

    await File.insertMany(fileDocs);
    console.log('Estado actual guardado en MongoDB.');
  } catch (error) {
    console.error('Error al guardar el estado en MongoDB:', error);
  }
}

// Decodificar y cargar las credenciales desde la variable de entorno
const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials, // Usar las credenciales decodificadas
  scopes: ['https://www.googleapis.com/auth/drive'], // Alcances requeridos
});

const drive = google.drive({ version: 'v3', auth });

const sourceFolderId = '1WmnFU8jv6ZY3BW0iSB1xXTpQoMbesU09'; // ID de la carpeta de datos actuales
  const backupFolderId = '1lzRcFSB0l00s36HEz8X-l14Hgvj7Q8IF'; 

// Función para listar archivos y carpetas en una carpeta de Google Drive
async function listFilesAndFolders(folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name, mimeType, modifiedTime)',
    });
    return res.data.files;
  } catch (error) {
    console.error('Error listing files and folders:', error);
    return [];
  }
}

const deleteFileById = async (fileId) => {
  try {
    // Eliminar el archivo en Google Drive usando el fileId
    await drive.files.delete({
      fileId: fileId,
    });
    return { success: true, message: 'Archivo eliminado correctamente' };

  } catch (error) {
    return { success: false, message: 'Error al eliminar el archivo' };
  }
};

const getFileById = async (fileId) => {
  try {
    // Obtener metadatos del archivo
    const { data: file } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    });

    console.log(`Archivo encontrado: ${file.name} (ID: ${file.id})`);

    // Descargar el archivo
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    }, {
      responseType: 'stream',
    });

    const fileStream = response.data; // El stream del archivo

    return { file, stream: fileStream }; // Devolver metadatos del archivo y el stream
  } catch (error) {
    console.error('Error al buscar o descargar el archivo por ID:', error.message || error);
    return null;
  }
};


function detectChanges(previousFiles, currentFiles) {
  const changes = {
    newFiles: [],
    modifiedFiles: []
  };

  const previousFileMap = new Map();
  previousFiles.forEach(file => previousFileMap.set(file.id, file));

  // Detectar archivos nuevos o modificados
  for (const file of currentFiles) {
    const previousFile = previousFileMap.get(file.id);
    if (!previousFile) {
      changes.newFiles.push(file); // Archivo nuevo
    } else if (file.modifiedTime !== previousFile.modifiedTime) {
      changes.modifiedFiles.push(file); // Archivo modificado
    }
  }

  return changes;
}
async function copyFolder(file, parentBackupFolderId) {
  try {
    // Listar archivos y carpetas dentro de la carpeta
    const filesInFolder = await listFilesAndFolders(file.id);

    // Verificar si la carpeta ya existe en la carpeta de backup
    const existingFoldersRes = await drive.files.list({
      q: `'${parentBackupFolderId}' in parents and name = '${file.name}' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name)',
    });

    let newBackupFolderId;

    if (existingFoldersRes.data.files.length === 0) {
      // Si la carpeta no existe, crearla
      const folderRes = await drive.files.create({
        requestBody: {
          name: file.name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentBackupFolderId],
        },
      });
      newBackupFolderId = folderRes.data.id;
      console.log(`Carpeta creada: ${file.name} (ID: ${newBackupFolderId})`);
    } else {
      // Si ya existe, usar la carpeta existente
      newBackupFolderId = existingFoldersRes.data.files[0].id;
      console.log(`Carpeta ya existente: ${file.name} (ID: ${newBackupFolderId})`);
    }

    // Copiar cada archivo/carpeta dentro de la carpeta
    for (const fileInFolder of filesInFolder) {
      if (fileInFolder.mimeType === 'application/vnd.google-apps.folder') {
        // Si es una carpeta, copiar recursivamente
        await copyFolder(fileInFolder, newBackupFolderId);
      } else {
        // Si es un archivo, copiarlo
        await copyFile(fileInFolder, newBackupFolderId);
      }
    }

  } catch (error) {
    console.error(`Error al copiar la carpeta ${file.name}:`, error);
  }
}

async function copyFile(file, parentBackupFolderId) {
  try {
    if (!file || !file.id) {
      throw new Error('El archivo no tiene un id válido');
    }

    // Verificar si el archivo ya existe en la carpeta de backup (por nombre)
    const existingFilesRes = await drive.files.list({
      q: `'${parentBackupFolderId}' in parents and name = '${file.name}'`,
      fields: 'files(id, name)',
    });

    if (existingFilesRes.data.files.length === 0) {
      // Si el archivo no existe, crear la copia
      await drive.files.copy({
        fileId: file.id,
        requestBody: {
          parents: [parentBackupFolderId],
        },
      });
      console.log(`Archivo copiado: ${file.name} (ID: ${file.id})`);
    } else {
      console.log(`El archivo ${file.name} ya existe en el backup.`);
    }

  } catch (error) {
    console.error(`Error al copiar el archivo ${file.name}:`, error);
  }
}


async function performBackup(changes) {
  const { newFiles, modifiedFiles } = changes;

  for (const file of [...newFiles, ...modifiedFiles]) {
    try {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Copiar la carpeta recursivamente
        await copyFolder(file, backupFolderId);  // Aquí pasamos el archivo completo
      } else {
        // Copiar el archivo, pasamos el archivo completo
        await copyFile(file, backupFolderId);  // Aquí pasamos el archivo completo
      }
    } catch (error) {
      console.error(`Error al hacer backup de ${file.name}:`, error);
    }
  }
}



async function checkForChangesAndBackup() {
  console.log('Verificando cambios en la carpeta de origen...');

  // Cargar el estado anterior desde MongoDB
  const previousFiles = await loadPreviousState();

  // Obtener el estado actual
  const currentFiles = await listFilesAndFolders(sourceFolderId);

  // Detectar cambios
  const changes = detectChanges(previousFiles, currentFiles);

  // Si hay cambios, hacer el backup
  if (changes.newFiles.length > 0 || changes.modifiedFiles.length > 0) {
    console.log('Archivos o carpetas nuevos/modificados encontrados. Haciendo backup...');
    await performBackup(changes);
  } else {
    console.log('No se encontraron cambios.');
  }

  // Guardar el estado actual en MongoDB
  await saveCurrentState(currentFiles);
}

async function deleteFilesByEmail(email) {
  try {
    // Listar archivos cuyo propietario sea el email especificado
    const filesRes = await drive.files.list({
      q: `'${email}' in owners`,
      fields: 'files(id, name)',
    });

    const files = filesRes.data.files;

    if (files.length === 0) {
      console.log(`No se encontraron archivos propiedad de ${email}`);
      return;
    }

    // Borrar cada archivo encontrado
    for (const file of files) {
      try {
        await drive.files.delete({ fileId: file.id });
        console.log(`Archivo eliminado: ${file.name} (ID: ${file.id})`);
      } catch (error) {
        console.error(`Error al eliminar el archivo ${file.name}:`, error);
      }
    }

    console.log(`Todos los archivos propiedad de ${email} han sido eliminados.`);

  } catch (error) {
    console.error('Error al listar los archivos:', error);
  }
}




// Función para subir un archivo a Google Drive
const uploadFileToDrive=async(file, folderId)=>{
  try {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);  // El buffer contiene los datos del archivo

    const res = await drive.files.create({
      requestBody: {
        name: file.originalname, // Nombre del archivo que se subirá
        mimeType: file.mimetype,  // Tipo MIME del archivo (ej: 'application/pdf')
        parents: [folderId],      // ID de la carpeta donde se subirá el archivo
      },
      media: {
        mimeType: file.mimetype,
        body: bufferStream,      // El buffer que se va a subir
      },
      fields: 'id, name',        // Campos a devolver
    });

    return res.data;

  } catch (error) {
    console.error('Error al subir el archivo a Google Drive:', error);
    return null;
  }
}


module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById
};