
// const Minio = require('minio');
// const { Readable } = require('stream');
// require('dotenv').config();

// const containerName = process.env.ARSYS_CONTAINERNAME;
// const endpoint = process.env.ARSYS_ENDPOINT.replace('https://', '').replace(/\/$/, '');
// const accessKeyId = process.env.ARSYS_ACCESSKEYID;
// const secretAccessKey = process.env.ARSYS_SECRETACCESSKEY;

// const minioClient = new Minio.Client({
//   endPoint: endpoint.split(':')[0],
//   port: parseInt(endpoint.split(':')[1]) || 443,
//   useSSL: true,
//   accessKey: accessKeyId,
//   secretKey: secretAccessKey,
// });

// // Función para subir un archivo
// const uploadFile = async (file, name) => {
//   try {
//     const fileStream = Readable.from(file.buffer); // Crea un flujo legible desde el buffer del archivo
//     await minioClient.putObject(containerName, name, fileStream, file.size, {
//       'Content-Type': file.mimetype,
//     });
//     return name;
//   } catch (error) {
//     console.error('Error al subir el archivo a S3:', error);
//     throw error;
//   }
// };

// // Función para obtener un archivo
// const getFileCv = async (nameFile) => {
//   try {
//     const stream = await minioClient.getObject(containerName, `${nameFile}.pdf`);
//     return stream;
//   } catch (error) {
//     console.error('Error al obtener el archivo desde S3:', error);
//     return null;
//   }
// };

// // Función para listar el contenido de un contenedor
// const listBucketContents = async () => {
//   try {
//     const stream = await minioClient.listObjectsV2(containerName, '', true);
//     stream.on('data', function(obj) {
//       console.log(obj.name);
//     });
//     stream.on('error', function(err) {
//       console.error('Error al listar el contenido del bucket:', err);
//     });
//   } catch (error) {
//     console.error('Error al listar el contenido del bucket:', error);
//   }
// };

// // Función para eliminar todos los archivos
// const deleteAllFiles = async () => {
//   try {
//     const objectsList = [];
//     const stream = await minioClient.listObjectsV2(containerName, '', true);
//     stream.on('data', function(obj) {
//       objectsList.push(obj.name);
//     });
//     stream.on('end', async function() {
//       if (objectsList.length > 0) {
//         const objectsToDelete = objectsList.map((object) => ({ name: object }));
//         await minioClient.removeObjects(containerName, objectsToDelete);
//         console.log('Todos los archivos han sido eliminados correctamente.');
//       } else {
//         console.log('No hay archivos para eliminar.');
//       }
//     });
//     stream.on('error', function(err) {
//       console.error('Error al listar el contenido del bucket:', err);
//     });
//   } catch (error) {
//     console.error('Error al eliminar los archivos:', error);
//   }
// };

// const deleteFile = async (fileName) => {
//   try {
//     const fileToDelete = `${fileName}.pdf`;
//     // Verifica si el archivo existe antes de intentar eliminarlo
//     await minioClient.statObject(containerName, fileToDelete);
//     // Si el archivo existe, procede a eliminarlo
//     await minioClient.removeObject(containerName, fileToDelete);

//     return true;
//   } catch (error) {
//     return false;
//   }
// };

// module.exports = {
//   uploadFile,
//   listBucketContents,
//   getFileCv,
//   deleteAllFiles,
//   deleteFile
// };


const Minio = require('minio');
const { Readable } = require('stream');
require('dotenv').config();

// Configuración de variables de entorno para el cliente de Minio
const containerName = process.env.ARSYS_CONTAINERNAME;
const endpoint = process.env.ARSYS_ENDPOINT.replace('https://', '').replace(/\/$/, '');
const accessKeyId = process.env.ARSYS_ACCESSKEYID;
const secretAccessKey = process.env.ARSYS_SECRETACCESSKEY;

// Configuración del cliente Minio
const minioClient = new Minio.Client({
  endPoint: endpoint.split(':')[0],
  port: parseInt(endpoint.split(':')[1]) || 443, // Usa el puerto especificado o 443 si no se proporciona
  useSSL: true, // Usa SSL para la conexión
  accessKey: accessKeyId,
  secretKey: secretAccessKey,
});

const RETRY_LIMIT = 5; // Número máximo de intentos para operaciones fallidas
const BACKOFF_FACTOR = 1000; // Tiempo base (en milisegundos) para el backoff exponencial

// Función que maneja reintentos con backoff exponencial
const retryOperation = async (fn, retries = RETRY_LIMIT) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn(); // Intenta ejecutar la función
    } catch (error) {
      attempt++;
      if (attempt >= retries) throw error; // Si se alcanzó el límite de reintentos, lanza el error
      const backoff = Math.pow(2, attempt) * BACKOFF_FACTOR; // Calcula el tiempo de espera basado en el número de intentos
      console.log(`Reintentando operación en ${backoff}ms... (${attempt}/${retries})`);
      await new Promise(res => setTimeout(res, backoff)); // Espera antes de volver a intentar
    }
  }
};

// Función para subir un archivo con reintentos
const uploadFile = async (file, name) => {
  return retryOperation(async () => {
    const fileStream = Readable.from(file.buffer); // Crea un flujo legible desde el buffer del archivo
    await minioClient.putObject(containerName, name, fileStream, file.size, {
      'Content-Type': file.mimetype, // Define el tipo de contenido del archivo
    });
    return name; // Devuelve el nombre del archivo subido
  });
};

// Función para obtener un archivo con reintentos
const getFileCv = async (nameFile) => {
  return retryOperation(async () => {
    const stream = await minioClient.getObject(containerName, `${nameFile}.pdf`); // Obtiene el archivo desde Minio
    return stream; // Devuelve el flujo del archivo
  });
};

// Función para listar el contenido de un contenedor con reintentos
const listBucketContents = async () => {
  return retryOperation(async () => {
    const objectsList = []; // Lista para almacenar los nombres de los objetos
    const stream = minioClient.listObjectsV2(containerName, '', true); // Lista los objetos en el contenedor
    return new Promise((resolve, reject) => {
      stream.on('data', obj => objectsList.push(obj.name)); // Añade el nombre del objeto a la lista
      stream.on('end', () => {
        console.log('Contenido del bucket:', objectsList); // Muestra los nombres de los objetos listados
        resolve(objectsList); // Resuelve la promesa con la lista de objetos
      });
      stream.on('error', err => {
        console.error('Error al listar el contenido del bucket:', err); // Maneja errores durante el listado
        reject(err); // Rechaza la promesa en caso de error
      });
    });
  });
};

// Función para eliminar todos los archivos con reintentos
const deleteAllFiles = async () => {
  return retryOperation(async () => {
    const objectsList = await listBucketContents(); // Obtiene la lista de objetos a eliminar
    if (objectsList.length > 0) {
      const objectsToDelete = objectsList.map(name => ({ name })); // Mapea la lista de nombres a un formato aceptado por Minio
      await minioClient.removeObjects(containerName, objectsToDelete); // Elimina los objetos del contenedor
      console.log('Todos los archivos han sido eliminados correctamente.');
    } else {
      console.log('No hay archivos para eliminar.'); // Mensaje si no hay archivos para eliminar
    }
  });
};

// Función para eliminar un archivo específico con reintentos
const deleteFile = async (fileName) => {
  return retryOperation(async () => {
    const fileToDelete = `${fileName}.pdf`; // Construye el nombre del archivo a eliminar
    await minioClient.statObject(containerName, fileToDelete); // Verifica si el archivo existe
    await minioClient.removeObject(containerName, fileToDelete); // Elimina el archivo
    console.log(`Archivo eliminado: ${fileToDelete}`); // Mensaje de confirmación
    return true; // Devuelve true si la eliminación fue exitosa
  });
};

module.exports = {
  uploadFile,
  listBucketContents,
  getFileCv,
  deleteAllFiles,
  deleteFile
};