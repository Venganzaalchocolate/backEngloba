const { UserCv } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, validName, validEmail, catchAsync, response, generarHashpass, ClientError, sendEmail } = require('../utils/indexUtils');
const { dateAndHour, getSpainCurrentDate } = require('../utils/utils');

// crear usuario
const postCreateUserCv = async (req, res) => {

    if (!req.body.name || !req.body.email || !req.body.phone || !req.body.jobs || !req.body.studies || !req.body.provinces || !req.body.work_schedule) throw new ClientError("Los datos no son correctos", 400);

    const spainDate = getSpainCurrentDate();
    req.body.name.toLowerCase()
    let dataUser = {
        date: spainDate,
        name: req.body.name.toLowerCase(),
        email: req.body.email.toLowerCase(),
        phone: req.body.phone,
        jobs: req.body.jobs,
        studies:req.body.studies,
        provinces: req.body.provinces,
        work_schedule:req.body.work_schedule
    }
    if (!!req.body.about) dataUser['about'] = req.body.about
    if (!!req.body.offer) dataUser['offer'] = req.body.offer
    if (!!req.body.job_exchange) dataUser['job_exchange'] = req.body.job_exchange


    const newUserCv = new UserCv(dataUser)
    const savedUserCv = await newUserCv.save();
    response(res, 200, savedUserCv)
}

//recoge todos los usuarios
const getUserCvs = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);
    const page = parseInt(req.body.page) || 1; // Página actual, por defecto página 1
    const limit = parseInt(req.body.limit) || 10; // Tamaño de página, por defecto 10 documentos por página


    const filters = {};
    if (req.body.name) filters["name"] = { $regex: req.body.name, $options: 'i' };
    if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
    if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
    if (req.body.jobs && req.body.jobs.length > 0) filters["jobs"] = { $in: req.body.jobs };
    if (req.body.provinces && req.body.provinces.length > 0) filters["provinces"] = { $in: req.body.provinces };
    if (req.body.work_schedule && req.body.work_schedule.length > 0) filters["work_schedule"] = { $in: req.body.work_schedule };
    if (req.body.studies && req.body.studies.length > 0) filters["studies"] = { $in: req.body.studies };
    if (req.body.offer) filters["offer"] = { $regex: req.body.offer, $options: 'i' };
    if (req.body.users) filters["_id"]={ $in: req.body.users }

    if (req.body.view) (req.body.view=='0') ?filters["view"]=null:filters["view"] ={$ne:null}
    if (req.body.favorite) (req.body.view=='0') ?filters["favorite"]=null:filters["favorite"] ={$ne:null}
    if (req.body.reject) (req.body.view=='0') ? filters["reject"]=null : filters["reject"] ={$ne:null}

    try {
        // Obtener el total de documentos en la colección
        const totalDocs = await UserCv.countDocuments(filters);
        // Calcular el número total de páginas
        const totalPages = Math.ceil(totalDocs / limit);

        // Utiliza el método find() de Mongoose con skip() y limit() para paginar
        const users = await UserCv.find(filters).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('offer')
        // Responde con la lista de usuarios paginada y código de estado 200 (OK)
        response(res, 200, { users, totalPages });
    } catch (error) {
        // Manejo de errores
        response(res, 500, { error: 'Error al obtener los usuarios' });
    }
}

const getUserCvsFilter = async (req, res) => {
    let filter={}
    if(!!req.body.phone) filter = { phone: req.body.phone };
    if(!!req.body.id) filter = { _id: req.body.id };
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const usuarios = await UserCv.find(filter);
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, usuarios);
}


//busca un usuario por ID
const getUserCvID = async (req, res) => {
    // Obtén el ID del parámetro de la solicitud
    const id = req.params.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const usuario = await UserCv.findById(id).catch(error => { throw new ClientError('Usuario no encontrado', 404) });
    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, usuario);
}

// borrar un usuario
const UserCvDeleteId = async (req, res) => {
    const id = req.params.id;
    const UserCvDelete = await UserCv.deleteOne({ _id: id });
    response(res, 200, UserCvDelete);
}

// modificar el usuario
const UserCvPut = async (req, res) => {
    const filter = { _id: req.body._id };
    const updateText = {};
    if (!!req.body.name) updateText['name'] = req.body.name;
    if (!!req.body.email) updateText['email'] = req.body.email;
    if (!!req.body.phone) updateText['phone'] = req.body.phone;
    if (!!req.body.jobs) updateText['jobs'] = req.body.jobs;
    if (!!req.body.studies) updateText['studies'] = req.body.studies;
    if (!!req.body.provinces) updateText['provinces'] = req.body.provinces;
    if (!!req.body.about) updateText['about'] = req.body.about
    if (!!req.body.offer) updateText['offer'] = req.body.offer
    if (!!req.body.work_schedule) updateText['work_schedule'] = req.body.work_schedule
    if (!!req.body.job_exchange) updateText['job_exchange'] = req.body.job_exchange
    if (!!req.body.numberCV) updateText['numberCV'] = req.body.numberCV
    // Manejo de comentarios
    const dateNow = new Date();
    // Manejar comentarios independientes


    if (req.body.commentsPhone) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsPhone: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsPhone
            }
        };
    }

    if (req.body.commentsVideo) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsVideo: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsVideo
            }
        };
    }

    if (req.body.commentsInperson) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsInperson: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsInperson
            }
        };
    }



    if (!!req.body.view || req.body.view==null) updateText['view'] = req.body.view
    if (!!req.body.favorite || req.body.favorite==null) updateText['favorite'] = req.body.favorite
    if (!!req.body.reject || req.body.reject==null) updateText['reject'] = req.body.reject


    let doc = await UserCv.findOneAndUpdate(filter, updateText,  { new: true });
    if (doc == null)  throw new ClientError("No existe el usuario", 400)
    response(res, 200, doc);
}

// const getEnums = async (req, res) => {
//     let enumValues = {}
//     enumValues['jobs'] = await UserCv.schema.path("jobs").caster.enumValues;
//     enumValues['provinces'] = await UserCv.schema.path("provinces").caster.enumValues;
//     enumValues['work_schedule'] = await UserCv.schema.path("work_schedule").caster.enumValues;
//     enumValues['studies'] = await UserCv.schema.path("studies").caster.enumValues;
//     if(enumValues.jobs==undefined) throw new ClientError('Error al solicitar los enums de los trabajos', 500)
//     if(enumValues.provinces==undefined) throw new ClientError('Error al solicitar los enums de las provincias ', 500)
//     if(enumValues.work_schedule==undefined) throw new ClientError('Error al solicitar los enums de los horarios', 500)
//     if(enumValues.studies==undefined) throw new ClientError('Error al solicitar los enums de los estudios', 500)
//     response(res, 200, enumValues);
// }


//work_schedule

module.exports = {
    //gestiono los errores con catchAsync
    postCreateUserCv: catchAsync(postCreateUserCv),
    getUserCvs: catchAsync(getUserCvs),
    getUserCvID: catchAsync(getUserCvID),
    UserCvDeleteId: catchAsync(UserCvDeleteId),
    UserCvPut: catchAsync(UserCvPut),
    getUserCvsFilter: catchAsync(getUserCvsFilter),
}
