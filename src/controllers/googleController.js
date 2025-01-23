const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const cron = require('node-cron');
const stream = require('stream');
const FileHistory = require('../models/fileHistory');
const FileMapping = require('../models/fileMapping');
const { create } = require('../models/user');

// const sourceFolderId = '1WmnFU8jv6ZY3BW0iSB1xXTpQoMbesU09'; // ID de la carpeta de datos actuales
const sourceFolderId = process.env.GOOGLE_DRIVE_PARENTFOLDER; // ID de la carpeta de datos actuales
const backup12hFolderId='1cnQ_4ANsSr_R-HJ-uf15WNfc5w_4dTRG';
const backup3dFolderId ='1kxH3Su19Yz6WWCSCmfUSewmqymsDlL4l';
const emails = ['web@engloba.org.es', 'comunicacion@engloba.org.es'];


// Decodificar y cargar las credenciales desde la variable de entorno
const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials, // Usar las credenciales decodificadas
  scopes: ['https://www.googleapis.com/auth/drive'], // Alcances requeridos
});

const drive = google.drive({ version: 'v3', auth });


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

// Obtener archivo por ID de Google Drive
const getFileById = async (fileId) => {
  try {
    // Obtener metadatos del archivo
    const { data: file } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    });

    console.log(`Archivo encontrado: ${file.name} (ID: ${file.id})`);

    // Descargar el archivo
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return { file, stream: response.data }; // Devolver metadatos del archivo y el stream
  } catch (error) {
    console.error('Error al buscar o descargar el archivo por ID:', error.message || error);
    return null;
  }
};

const uploadFileToDrive = async (file, folderId, fileName, duplicate=false) => {
  try {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer); // El buffer contiene los datos del archivo

    // Verificar si existe un archivo con el mismo nombre en la carpeta
    const existingFile = await drive.files.list({
      q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id, name)',
    });

    let fileId;

    if (!duplicate && existingFile.data.files.length > 0) {
      // Si el archivo ya existe, actualizar su contenido
      fileId = existingFile.data.files[0].id;

      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: file.mimetype,
          body: bufferStream, // Contenido del archivo nuevo
        },
        requestBody: {
          name: fileName,
          mimeType: file.mimetype,
        },
      });

      console.log(`Archivo existente actualizado: ${fileName}`);
    } else {
      // Si no existe, crear un archivo nuevo
      const res = await drive.files.create({
        requestBody: {
          name: fileName, // Nombre del archivo que se subirá
          mimeType: file.mimetype, // Tipo MIME del archivo (ej: 'application/pdf')
          parents: [folderId], // ID de la carpeta donde se subirá el archivo
        },
        media: {
          mimeType: file.mimetype,
          body: bufferStream, // El buffer que se va a subir
        },
        fields: 'id, name', // Campos a devolver
      });

      fileId = res.data.id;
      console.log(`Archivo nuevo creado: ${fileName}`);
    }

    // Asignar permisos de editor a cada correo electrónico
    for (const email of emails) {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'writer', // Rol de editor
          type: 'user', // Tipo de permiso: usuario
          emailAddress: email, // Correo electrónico al que se otorgan los permisos
        },
        sendNotificationEmail: false, // Evitar notificaciones por correo electrónico
      });
    }

    return { id: fileId, name: fileName };
  } catch (error) {
    console.error('Error al subir el archivo a Google Drive o asignar permisos:', error);
    return null;
  }
};


async function createFolderAndShare(folderName, parentFolderId, userEmails) {
  try {
    // 1) Crear la carpeta
    const response = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : []
      },
      fields: 'id'
    });
    
    const folderId = response.data.id;
    console.log(`Carpeta creada con nombre: "${folderName}", ID: ${folderId}`);

    // 2) Otorgar permisos de edición a cada usuario
    for (const email of userEmails) {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          type: 'user',
          role: 'writer',         // 'writer' = puede editar y borrar contenidos
          emailAddress: email
        }
      });
      console.log(`Permisos de edición otorgados a: ${email}`);
    }

    return folderId; // Devuelve el ID de la carpeta, por si lo necesitas
  } catch (error) {
    console.error('Error al crear la carpeta o asignar permisos:', error);
    return null;
  }
}

//Ejemplo de uso
// (async () => {
//   const colaboradores = ['comunicacion@engloba.org.es', 'web@engloba.org.es'];
//   const newFolderId = await createFolderAndShare('backup12', backupFolderId, colaboradores);
//   const newFolderId2 = await createFolderAndShare('backup72', backupFolderId, colaboradores);
//   if (newFolderId && newFolderId2) {
//     console.log('Carpeta creada y compartida exitosamente. ID:', newFolderId);
//       console.log('Carpeta creada y compartida exitosamente. ID:', newFolderId2);
//   }
// })();

// Función recursiva para eliminar todos los archivos/carpetas que un usuario (email)
// haya creado dentro de una carpeta (folderId).
async function deleteAllOwnedInFolder(folderId, email) {
  try {
    // 1) Listar todos los elementos propiedad de 'email' dentro de folderId
    const items = await listOwnedItemsInFolder(folderId, email);

    // 2) Recorrer cada elemento y, si es carpeta, llamar recursivamente
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // Borrar primero su contenido
        await deleteAllOwnedInFolder(item.id, email);
      }

      // Luego, eliminar el archivo o la carpeta en sí
      await drive.files.delete({ fileId: item.id });
      console.log(`Eliminado: ${item.name} (ID: ${item.id})`);
    }

    console.log(`Se han eliminado todos los elementos de la carpeta (ID: ${folderId}) propiedad de ${email}.`);
  } catch (error) {
    console.error('Error al eliminar archivos/carpetas:', error);
  }
}


//backup
// Funciones de Base de Datos


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
        if (file.name.includes('48938640E')) {
          console.log(`Archivo excluido de la eliminación: "${file.name}" (ID: ${file.id})`);
          continue;
        }

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

const initBackup=async ()=>{
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

const deleteFileByName = async () => {
  // const folderId='122pqA2vhaT8ULu195ihD2WHcBQg-ieK1'
  // const fileName='66ebff2cb0d67369b6d525a8-sexualOffenseCertificate.pdf'
  try {
    // Buscar el archivo por nombre en la carpeta especificada
    const searchResult = await drive.files.list({
      q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id, name)',
    });

    // Verificar si se encontró el archivo
    const files = searchResult.data.files;

    if (files.length === 0) {
      console.log(`No se encontró ningún archivo con el nombre "${fileName}" en la carpeta especificada.`);
      return { success: false, message: 'Archivo no encontrado' };
    }

    // Obtener el ID del archivo encontrado
    const fileId = files[0].id;

    // Eliminar el archivo
    await drive.files.delete({
      fileId: fileId,
    });

    console.log(`Archivo "${fileName}" eliminado exitosamente.`);
    return { success: true, message: 'Archivo eliminado' };
  } catch (error) {
    console.error('Error al eliminar el archivo:', error);
    return { success: false, message: 'Error al eliminar el archivo', error };
  }
};

//---------------backup local

// EMAILS -------------------------------------
//---------------------------------------------



module.exports = {
  uploadFileToDrive,
  getFileById,
  deleteFileById
};