const { OfferJob } = require('../models/indexModels');
const {  catchAsync, response, ClientError } = require('../utils/indexUtils');


// crear usuario
const postCreateOfferJob = async (req, res) => {

    if (!req.body.job_title
        || !req.body.functions ||  !req.body.work_schedule 
        || !req.body.essentials_requirements ||  !req.body.conditions || !req.body.provinces
        || !req.body.location || !req.body.create ||  !req.body.expected_incorporation_date || !req.body.bag) throw new ClientError("Los datos no son correctos", 400);
    
    let dataOfferJob = {
        entity: 'ASOCIACIÓN ENGLOBA',
        job_title: req.body.job_title,
        functions: req.body.functions,
        work_schedule:req.body.work_schedule,
        essentials_requirements:req.body.essentials_requirements,
        conditions:req.body.conditions,
        province:req.body.provinces,
        location:req.body.location,
        date: new Date(),
        create: req.body.create,
        expected_incorporation_date:req.body.expected_incorporation_date,
        bag:req.body.bag
    }

    if(!!req.body.optionals_requirements) dataOfferJob['optionals_requirements']=req.body.optionals_requirements
    const newOfferJob = new OfferJob(dataOfferJob)
    const savedOfferJob = await newOfferJob.save();
    response(res, 200, savedOfferJob)
}



//recoge todos los usuarios
const getOfferJobs = async (req, res) => {
    try {
        const OfferJobs = await OfferJob.find().populate('bag')
        // Responde con la lista de usuarios paginada y código de estado 200 (OK)
        response(res, 200, OfferJobs);
    } catch (error) {
        // Manejo de errores
        response(res, 500, { error: 'Error al obtener los OfferJobas' });
    }
}

const getOfferJobID = async (req, res) => {
    // Obtén el ID del parámetro de la solicitud
    const id = req.body.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const offerJobData = await OfferJob.findById(id).populate('bag').catch(error => { throw new ClientError('OfferJoba no encontrado', 404) });
    // Responde con el usuario encontrado y código de estado 200 (OK)ç
    response(res, 200, offerJobData);
}

const OfferJobDeleteId = async (req, res) => {
    const id = req.params.id;
    const OfferJobDelete = await OfferJob.deleteOne({ _id: id });
    response(res, 200, OfferJobDelete);
}

// modificar el usuario
const OfferJobPut = async (req, res) => {
    const filter = { _id: req.body.id };
    if (!req.body.id) throw new ClientError("Los datos no son correctos", 400);
    
    const dataOfferJob = {};
    if (!!req.body.entity) dataOfferJob['entity'] = req.body.entity;
    if (!!req.body.job_title) dataOfferJob['job_title'] = req.body.job_title;
    if (!!req.body.functions) dataOfferJob['functions'] = req.body.functions;
    if (!!req.body.work_schedule) dataOfferJob['work_schedule'] = req.body.work_schedule;
    if (!!req.body.essentials_requirements) dataOfferJob['essentials_requirements'] = req.body.essentials_requirements;
    if (!!req.body.optionals_requirements) dataOfferJob['optionals_requirements'] = req.body.optionals_requirements;
    if (!!req.body.conditions) dataOfferJob['conditions'] = req.body.conditions;
    if (!!req.body.location) dataOfferJob['location'] = req.body.location;
    if (!!req.body.date) dataOfferJob['date'] = req.body.date;
    if (!!req.body.create) dataOfferJob['create'] = req.body.create;
    if (!!req.body.expected_incorporation_date) dataOfferJob['expected_incorporation_date'] = new Date(req.body.expected_incorporation_date);
    if (req.body.active!=undefined) dataOfferJob['active'] = req.body.active;
    if (!!req.body.bag) dataOfferJob['bag'] = req.body.bag;

    let doc = await OfferJob.findOneAndUpdate(filter, dataOfferJob,  { new: true });
    if (doc == null)  throw new ClientError("No existe el OfferJob", 400)
    response(res, 200, doc);
}




//work_schedule

module.exports = {
    //gestiono los errores con catchAsync
    postCreateOfferJob: catchAsync(postCreateOfferJob),
    getOfferJobs: catchAsync(getOfferJobs),
    getOfferJobID: catchAsync(getOfferJobID),
    OfferJobDeleteId: catchAsync(OfferJobDeleteId),
    OfferJobPut: catchAsync(OfferJobPut),
}
