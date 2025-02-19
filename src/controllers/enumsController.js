const { Jobs, Studies, Provinces, Work_schedule, Finantial, Offer, Program, User, Leavetype } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

// Función para crear índice de leaveTypes
const createCategoriesIndex = (x) => {
    const index = {};
    x.forEach(x => {
        // Crear un diccionario donde la clave es el ID y el valor es el leaveType completo
        index[x._id.toString()] = x;
    });
    return index;
};

// Función para crear índice de subcategorías de trabajos //jobs
const createSubcategoriesIndex = (x) => {
    const index = {};
    x.forEach(x => {
        // Crear un diccionario donde la clave es el ID de la subcategoría y el valor es la subcategoría completa
        x.subcategories?.forEach(sub => {
            index[sub._id.toString()] = sub;
        });
    });
    return index;
};


// crea un índice que tiene entradas tanto para programs como para devices
const createProgramDevicesIndex = (programs) => {
    const index = {};
  
    programs.forEach(program => {
      // Primero, creamos un registro donde la clave es el "programId"
      index[program._id.toString()] = {
        _id: program._id.toString(),
        type: "program",
        name: program.name,
        responsible: program.responsible, // responsables del PROGRAMA
        devicesIds: program.devices.map(d => d._id.toString()) // para saber qué devices pertenecen
        // ... más campos si deseas
      };
  
      // Luego, creamos registros para cada device
      if (Array.isArray(program.devices)) {
        program.devices.forEach(device => {
          index[device._id.toString()] = {
            _id: device._id.toString(),
            type: "device",
            name: device.name,
            responsible: device.responsible,
            coordinators: device.coordinators,
            programId: program._id.toString()
            // ... más campos si necesitas
          };
        });
      }
    });
    return index;
  };

const getEnums = async (req, res) => {
    let enumValues = {}
    enumValues['jobs'] = await Jobs.find();
    enumValues['provinces'] = await Provinces.find();
    enumValues['work_schedule'] = await Work_schedule.find();
    enumValues['studies'] = await Studies.find();
    enumValues['finantial']=await Finantial.find();
    
    if (enumValues.jobs == undefined) throw new ClientError('Error al solicitar los enums de los trabajos', 500)
    if (enumValues.provinces == undefined) throw new ClientError('Error al solicitar los enums de las provincias ', 500)
    if (enumValues.work_schedule == undefined) throw new ClientError('Error al solicitar los enums de los horarios', 500)
    if (enumValues.studies == undefined) throw new ClientError('Error al solicitar los enums de los estudios', 500)
    if (enumValues.finantial == undefined) throw new ClientError('Error al solicitar los enums de las financiaciones', 500)
    response(res, 200, enumValues);
}


const getEnumEmployers=async (req, res) => {
    let enumValues = {}
    enumValues['provinces'] = await Provinces.find();
    enumValues['programs'] = await Program.find();
    enumValues['status']= User.schema.path('employmentStatus').enumValues;
    enumValues['leavetype']=await Leavetype.find();
    enumValues['jobs']=await Jobs.find();
    enumValues['studies'] = await Studies.find();
    enumValues['work_schedule'] = await Work_schedule.find();
    enumValues['offers']=await Offer.find({active:true})
    enumValues['jobsIndex']=createSubcategoriesIndex(enumValues['jobs'])
    enumValues['leavesIndex']=createCategoriesIndex(enumValues['leavetype'])
    enumValues['programsIndex']=createProgramDevicesIndex(enumValues['programs'])
    enumValues['finantial']=await Finantial.find();

    if (enumValues.programs == undefined) throw new ClientError('Error al solicitar los enums de los trabajos', 500)
    if (enumValues.provinces == undefined) throw new ClientError('Error al solicitar los enums de las provincias ', 500)
   
    response(res, 200, enumValues);
}


const putEnums = async (req, res) => {
    const auxData = ['Jobs', 'Studies', 'Provinces', 'Work_schedule', 'Finantial']
    if (!req.body.name || !req.body.type) throw new ClientError("Los datos no son correctos", 400);
    if (!auxData.includes(req.body.type)) throw new ClientError("El tipo no es correcto", 400);

    let auxNewEnum = null;
    switch (req.body.type) {
        case 'jobs':
            auxNewEnum = new Jobs({ name: req.body.name })
            break;
        case 'studies':
            auxNewEnum = new Studies({ name: req.body.name })
            break;
        case 'provinces':
            auxNewEnum = new Provinces({ name: req.body.name })
            break;
        case 'work_schedule':
            auxNewEnum = new Work_schedule({ name: req.body.name })
            break;
        case 'finantial':
            auxNewEnum = new Finantial({ name: req.body.name })
            break;
        default:
            break;
    }


    const savedUser = await auxNewEnum.save();
    response(res, 200, savedUser)
}


const postEnums = async (req, res) => {
    if (!req.body.name || !req.body.type) throw new ClientError("Los datos no son correctos", 400);
    let Model;
    switch (req.body.type) {
        case 'jobs':
            Model = Jobs;
            break;
        case 'studies':
            Model = Studies;
            break;
        case 'provinces':
            Model = Provinces;
            break;
        case 'work_schedule':
            Model = Work_schedule;
            break;
        case 'finantial':
            Model = Finantial;
            break;
        default:
            throw new ClientError("Tipo no válido", 400);
    }

    const auxNewEnum = new Model({ name: req.body.name });
    const savedEnum = await auxNewEnum.save();
    response(res, 200, savedEnum);
}

const deleteEnums = async (req, res) => {
    if (!req.body.id || !req.body.type) throw new ClientError("Los datos no son correctos", 400);
    let Model;
    switch (req.body.type) {
        case 'jobs':
            Model = Jobs;
            break;
        case 'studies':
            Model = Studies;
            break;
        case 'provinces':
            Model = Provinces;
            break;
        case 'work_schedule':
            Model = Work_schedule;
            break;
        case 'finantial':
            Model = Finantial;
            break;
        default:
            throw new ClientError("Tipo no válido", 400);
    }

    const deleteEnum = await Model.deleteOne({ _id: req.body.id });

    if (deleteEnum.deletedCount === 0) {
        throw new ClientError("No se encontró el documento para eliminar", 404);
    }
    response(res, 200, deleteEnum)
}

const postSubcategory = async (req, res) => {
    if (!req.body.name || !req.body.type || !req.body.id) throw new ClientError("Los datos no son correctos", 400);
    const filter = { _id: req.body.id };
    const updateText = {
    };
    if (req.body.name) {
        updateText['$push'] = {
            subcategories: {
                name: req.body.name,
            }
        };
    }

    let Model;
    switch (req.body.type) {
        case 'jobs':
            Model = Jobs;
            break;
        case 'studies':
            Model = Studies;
            break;
        case 'provinces':
            Model = Provinces;
            break;
        case 'finantial':
            Model = Finantial;
            break;
        default:
            throw new ClientError("Tipo no válido", 400);
    }
    const savedEnum = await Model.findOneAndUpdate(filter, updateText,  { new: true });
    response(res, 200, savedEnum);
}

const deleteSubcategory = async (req, res) => {
    if (!req.body.idCategory || !req.body.type || !req.body.id) throw new ClientError("Los datos no son correctos", 400);
    const filter = { _id: req.body.id };
    const updateText = {};
    if (req.body.idCategory) {
        updateText['$pull'] = {
            subcategories: {
                _id: req.body.idCategory,
            }
        };
    }
    

    let Model;
    switch (req.body.type) {
        case 'jobs':
            Model = Jobs;
            break;
        case 'studies':
            Model = Studies;
            break;
        case 'provinces':
            Model = Provinces;
            break;
        case 'finantial':
            Model = Finantial;
            break;
        default:
            throw new ClientError("Tipo no válido", 400);
    }
    const savedEnum = await Model.findOneAndUpdate(filter, updateText,  { new: true });
    response(res, 200, savedEnum);
}

module.exports = {
    //gestiono los errores con catchAsync
    getEnums: catchAsync(getEnums),
    putEnums: catchAsync(putEnums),
    postEnums: catchAsync(postEnums),
    deleteEnums: catchAsync(deleteEnums),
    postSubcategory:catchAsync(postSubcategory),
    deleteSubcategory:catchAsync(deleteSubcategory),
    getEnumEmployers:catchAsync(getEnumEmployers)
}
