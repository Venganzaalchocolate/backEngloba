const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv } = require('./ovhController');
const fs = require('fs');
const path = require('path');


// crear usuario
const postUploadFile = async (req, res) => {
  if (!req.file || !req.body.nameFile) {
    throw new ClientError('No se proporcionó archivo, o nombre para el archivo', 400);
  } else {
    try {
      const archivoGuardado = await uploadFile(req.file, `${req.body.nameFile}.pdf`); // Pasar el flujo de datos del archivo directamente
      response(res, 200, archivoGuardado); // Enviar los datos del archivo guardado a la respuesta
    } catch (error) {
      console.error('Error al subir el archivo:', error);
      response(res, error.statusCode || 500, error.message);
    }
  }
}

/*

const exist= await getFile(req.body.nameFile)
res.setHeader('Content-Type', 'application/pdf'); // Tipo MIME para PDF
    stream.pipe(res); // Envía el stream directamente como respuesta
*/

const getFile = async (req, res) => {
  if (!req.body.id) {
    throw new ClientError('No se proporcionó id', 400);
  } else {
    
    try {
    const archivoBuffer = await getFileCv(req.body.id);
    
    // Configurar la respuesta HTTP
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename='+req.body.id,
      'Content-Length': archivoBuffer.ContentLength, // Content-Length basado en la longitud del contenido del objeto
    });

    // Enviar el stream como respuesta HTTP
    archivoBuffer.Body.pipe(res);
      //response(res, 200, archivoBuffer)
    } catch (error) {
      console.error('Error al obtener el archivo:', error);
      response(res, error.statusCode || 500, error.message);
    }
  } 
}

module.exports = {
  //gestiono los errores con catchAsync
  postUploadFile: catchAsync(postUploadFile),
  getFile:catchAsync(getFile)

}