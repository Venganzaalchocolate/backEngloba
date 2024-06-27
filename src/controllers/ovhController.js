const { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand} = require('@aws-sdk/client-s3');
const fs = require('fs');
const { catchAsync } = require('../utils/catchAsync');
require('dotenv').config()
const { Readable } = require('stream');

const path = require('path');


const containerName = process.env.OVH_CONTAINERNAME;
const endpoint = process.env.OVH_ENDPOINT;
const accessKeyId = process.env.OVH_ACCESSKEYID;
const secretAccessKey = process.env.OVH_SECRETACCESSKEY;

const s3Client = new S3Client({
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region: 'de',
});

// const files = [
//   {
//     name: 'curiiculums/prueba.txt',
//     path: './prueba.txt',
//   },
// ];
// Función para subir un archivo
const getFileCv=async(nameFile)=>{
  const command = new GetObjectCommand({
    Bucket: containerName,
    Key: `${nameFile}.pdf`,
  });
  try {
    const response = await s3Client.send(command); // Convertir el stream a buffer
    return response;    
  } catch (err) {
    console.error('Error al obtener el archivo desde S3:', err);
    return null;
  }
}


const uploadFile=async (file, name)=>{
    try {
        
        const fileStream = Readable.from(file.buffer);  // Crea un flujo legible desde el buffer del archivo
        const uploadParams = {
          Bucket: containerName,
          Key: name,
          Body: fileStream,
          ContentType: file.mimetype,  // Añade el tipo de contenido para el archivo
          ContentLength: file.size,    // Añade la longitud del contenido para el archivo
        };
    
          await s3Client.send(new PutObjectCommand(uploadParams));
          console.log(`Archivo subido correctamente: ${name}`);

      } catch (error) {
        console.error('Error al subir los archivos:', error);
      }
}
//listar el contenido de un contenedor
const listBucketContents = async () => {
    try {
      
      const listObjectsCommand = new ListObjectsCommand({ Bucket: containerName });
      const response = await s3Client.send(listObjectsCommand);
  
      console.log(`Contenido del bucket: ${containerName}`);
      for (const contenido of response.Contents) {
        console.log(contenido.Key); // Imprimir el nombre del archivo (clave del objeto)
      }
    } catch (error) {
      console.error('Error al listar el contenido del bucket:', error);
    }
  };




module.exports = {
    //gestiono los errores con catchAsync
    uploadFile:uploadFile,
    listBucketContents:listBucketContents,
    getFileCv:getFileCv
}