
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { uploadFile, getFileCv, deleteFile } = require('./ovhController');
const fs = require('fs');
const path = require('path');

// crear usuario
const postUploadFile = async (req, res) => {
  if (!req.file || !req.body.nameFile) {
    throw new ClientError('No se proporcionó archivo, o nombre para el archivo', 400);
  } else {
    const archivoGuardado = await uploadFile(req.file, `${req.body.nameFile}.pdf`); // Pasar el flujo de datos del archivo directamente
    response(res, 200, archivoGuardado); // Enviar los datos del archivo guardado a la respuesta
  }
};

const getFile = async (req, res) => {
  if (!req.body.id) {
    throw new ClientError('No se proporcionó id', 400);
  } else {
      const archivoStream = await getFileCv(req.body.id);
      
      if (!archivoStream) {
        throw new ClientError('Archivo no encontrado', 404);
      }
      // Configurar la respuesta HTTP
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=' + req.body.id,
      });

      // Enviar el stream como respuesta HTTP
      archivoStream.pipe(res);
  }
};

const deleteIdFile= async (req, res) => {
  if (!req.id) {
    throw new ClientError('No se proporcionó nombre para el archivo', 400);
  } else {
    const archivoEliminado = await deleteFile(req.id); // Pasar el flujo de datos del archivo directamente
    response(res, 200, archivoEliminado); // Enviar los datos del archivo guardado a la respuesta
  }
}

module.exports = {
  postUploadFile: catchAsync(postUploadFile),
  getFile: catchAsync(getFile),
  deleteIdFile:catchAsync(deleteIdFile)
};
