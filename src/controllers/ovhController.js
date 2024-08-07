// const { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand, ListObjectsV2Command,DeleteObjectsCommand } = require('@aws-sdk/client-s3');
// const fs = require('fs');
// const { catchAsync } = require('../utils/catchAsync');
// require('dotenv').config()
// const { Readable } = require('stream');

// const path = require('path');


// // const containerName = process.env.OVH_CONTAINERNAME;
// // const endpoint = process.env.OVH_ENDPOINT;
// // const accessKeyId = process.env.OVH_ACCESSKEYID;
// // const secretAccessKey = process.env.OVH_SECRETACCESSKEY;

// const containerName = process.env.ARSYS_CONTAINERNAME;
// const endpoint = process.env.ARSYS_ENDPOINT;
// const accessKeyId = process.env.ARSYS_ACCESSKEYID;
// const secretAccessKey = process.env.ARSYS_SECRETACCESSKEY;


// const s3Client = new S3Client({
//   endpoint,
//   credentials: {
//     accessKeyId,
//     secretAccessKey,
//   },
//   region: 'eu-central-3',
// });

// // const files = [
// //   {
// //     name: 'curiiculums/prueba.txt',
// //     path: './prueba.txt',
// //   },
// // ];
// // Función para subir un archivo
// const getFileCv=async(nameFile)=>{
//   const command = new GetObjectCommand({
//     Bucket: containerName,
//     Key: `${nameFile}.pdf`,
//   });
//   try {
//     const response = await s3Client.send(command); // Convertir el stream a buffer
//     return response;    
//   } catch (err) {
//     console.error('Error al obtener el archivo desde S3:', err);
//     return null;
//   }
// }


// const uploadFile=async (file, name)=>{
//     try {
        
//         const fileStream = Readable.from(file.buffer);  // Crea un flujo legible desde el buffer del archivo
//         const uploadParams = {
//           Bucket: containerName,
//           Key: name,
//           Body: fileStream,
//           ContentType: file.mimetype,  // Añade el tipo de contenido para el archivo
//           ContentLength: file.size,    // Añade la longitud del contenido para el archivo
//         };
    
//           await s3Client.send(new PutObjectCommand(uploadParams));
//           return name;

//       } catch (error) {
//         return error
//       }

// }
// //listar el contenido de un contenedor
// const listBucketContents = async () => {
//     try {
      
//       const listObjectsCommand = new ListObjectsCommand({ Bucket: containerName });
//       const response = await s3Client.send(listObjectsCommand);
  
//       console.log(`Contenido del bucket: ${containerName}`);
//       for (const contenido of response.Contents) {
//         console.log(contenido.Key); // Imprimir el nombre del archivo (clave del objeto)
//       }
//     } catch (error) {
//       console.error('Error al listar el contenido del bucket:', error);
//     }
//   };


//   const deleteAllFiles = async () => {
//     try {
//       // Primero listamos todos los objetos en el bucket
//       const listParams = {
//         Bucket: containerName
//       };
//       const listCommand = new ListObjectsV2Command(listParams);
//       const listResult = await s3Client.send(listCommand);
      
//       if (listResult.Contents.length === 0) {
//         console.log('No hay archivos para eliminar.');
//         return;
//       }
  
//       // Creamos el array de objetos a eliminar
//       const objectsToDelete = listResult.Contents.map((item) => ({ Key: item.Key }));
  
//       // Configuramos los parámetros de eliminación
//       const deleteParams = {
//         Bucket: containerName,
//         Delete: {
//           Objects: objectsToDelete,
//           Quiet: false
//         }
//       };
      
//       const deleteCommand = new DeleteObjectsCommand(deleteParams);
//       await s3Client.send(deleteCommand);
//       console.log('Todos los archivos han sido eliminados correctamente.');
  
//     } catch (error) {
//       console.error('Error al eliminar los archivos:', error);
//     }
//   };

// module.exports = {
//     //gestiono los errores con catchAsync
//     uploadFile:uploadFile,
//     listBucketContents:listBucketContents,
//     getFileCv:getFileCv
// }

const Minio = require('minio');
const { Readable } = require('stream');
require('dotenv').config();

const containerName = process.env.ARSYS_CONTAINERNAME;
const endpoint = process.env.ARSYS_ENDPOINT.replace('https://', '').replace(/\/$/, '');
const accessKeyId = process.env.ARSYS_ACCESSKEYID;
const secretAccessKey = process.env.ARSYS_SECRETACCESSKEY;

const minioClient = new Minio.Client({
  endPoint: endpoint.split(':')[0],
  port: parseInt(endpoint.split(':')[1]) || 443,
  useSSL: true,
  accessKey: accessKeyId,
  secretKey: secretAccessKey,
});

// Función para subir un archivo
const uploadFile = async (file, name) => {
  try {
    const fileStream = Readable.from(file.buffer); // Crea un flujo legible desde el buffer del archivo
    await minioClient.putObject(containerName, name, fileStream, file.size, {
      'Content-Type': file.mimetype,
    });
    return name;
  } catch (error) {
    console.error('Error al subir el archivo a S3:', error);
    throw error;
  }
};

// Función para obtener un archivo
const getFileCv = async (nameFile) => {
  try {
    const stream = await minioClient.getObject(containerName, `${nameFile}.pdf`);
    return stream;
  } catch (error) {
    console.error('Error al obtener el archivo desde S3:', error);
    return null;
  }
};

// Función para listar el contenido de un contenedor
const listBucketContents = async () => {
  try {
    const stream = await minioClient.listObjectsV2(containerName, '', true);
    stream.on('data', function(obj) {
      console.log(obj.name);
    });
    stream.on('error', function(err) {
      console.error('Error al listar el contenido del bucket:', err);
    });
  } catch (error) {
    console.error('Error al listar el contenido del bucket:', error);
  }
};

// Función para eliminar todos los archivos
const deleteAllFiles = async () => {
  try {
    const objectsList = [];
    const stream = await minioClient.listObjectsV2(containerName, '', true);
    stream.on('data', function(obj) {
      objectsList.push(obj.name);
    });
    stream.on('end', async function() {
      if (objectsList.length > 0) {
        const objectsToDelete = objectsList.map((object) => ({ name: object }));
        await minioClient.removeObjects(containerName, objectsToDelete);
        console.log('Todos los archivos han sido eliminados correctamente.');
      } else {
        console.log('No hay archivos para eliminar.');
      }
    });
    stream.on('error', function(err) {
      console.error('Error al listar el contenido del bucket:', err);
    });
  } catch (error) {
    console.error('Error al eliminar los archivos:', error);
  }
};

module.exports = {
  uploadFile,
  listBucketContents,
  getFileCv,
  deleteAllFiles,
};
