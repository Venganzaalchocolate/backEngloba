const { Jobs, Studies, Provinces, Work_schedule, Finantial, OfferJob, Program, User, Leavetype } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

const getEnums = async (req, res) => {
    let enumValues = {}
    enumValues['jobs'] = await Jobs.find();
    enumValues['provinces'] = await Provinces.find();
    enumValues['work_schedule'] = await Work_schedule.find();
    enumValues['studies'] = await Studies.find();
    enumValues['finantial']=await Finantial.find();
    enumValues['offer']=await OfferJob.find({active:true})

    if (enumValues.jobs == undefined) throw new ClientError('Error al solicitar los enums de los trabajos', 500)
    if (enumValues.provinces == undefined) throw new ClientError('Error al solicitar los enums de las provincias ', 500)
    if (enumValues.work_schedule == undefined) throw new ClientError('Error al solicitar los enums de los horarios', 500)
    if (enumValues.studies == undefined) throw new ClientError('Error al solicitar los enums de los estudios', 500)
    if (enumValues.finantial == undefined) throw new ClientError('Error al solicitar los enums de las financiaciones', 500)
    if (enumValues.offer == undefined) throw new ClientError('Error al solicitar los enums de las ofertas', 500)
    response(res, 200, enumValues);
}


const getEnumEmployers=async (req, res) => {
    let enumValues = {}
    enumValues['provinces'] = await Provinces.find();
    enumValues['programs'] = await Program.find().select('name _id devices.name devices._id');
    enumValues['status']= User.schema.path('employmentStatus').enumValues;
    enumValues['leavetype']=await Leavetype.find();
    enumValues['jobs']=await Jobs.find();
    enumValues['work_schedule'] = await Work_schedule.find();

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
