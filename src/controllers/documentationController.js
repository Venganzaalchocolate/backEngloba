const { Filedrive } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync } = require('../utils/catchAsync');
const { response } = require('../utils/response');

const getDocumentation = async (req, res) => {
    try {
          const filesId = req.body.filesId;

    // Comprobar que filesId existe y es un arreglo
    if (!Array.isArray(filesId)) {
        throw new ClientError('El dato debe ser una lista', 400);
    }

    // Opcional: verificar que el arreglo no esté vacío
    if (filesId.length === 0) {
        throw new ClientError('La lista de ids no puede estar vacío.', 400);
    }

    // Opcional: validar que cada elemento sea un id válido (por ejemplo, un ObjectId)
    filesId.forEach(id => {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ClientError(`El id ${id} no es válido.`, 400);
        }
    });
    const objectIds = filesId.map(id => new mongoose.Types.ObjectId(id));
    const archivos = await Filedrive.find({ _id: { $in: objectIds } });
    response(res, 200, archivos);  
    } catch (error) {
        console.log(error)
    }

};

module.exports = {
    getDocumentation: catchAsync(getDocumentation),
    
  };
  