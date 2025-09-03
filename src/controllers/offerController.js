const mongoose = require('mongoose');
const { Offer } = require('../models/indexModels');
const {  catchAsync, response, ClientError } = require('../utils/indexUtils');
const { validateRequiredFields } = require('../utils/utils');


// crear usuario
const postCreateOfferJob = async (req, res) => {

    const requiredFields=["programId","entity","job_title","functions", "work_schedule", "province", "location", "create", "expected_incorporation_date", "dispositiveId", "studies", "sepe"]
    const {
        functions,
        work_schedule,
        essentials_requirements,
        optionals_requirements,
        conditions,
        province,
        location,
        create,
        expected_incorporation_date,
        dispositiveId,
        studies,
        sepe,
        job_title,
        entity,
        programId,
        type,
        datecreate,
        jobId,
        provinceId,
      } = req.body;

    validateRequiredFields(req.body, requiredFields);

    const dataOfferJob = {
        entity:entity,
        job_title:job_title,
        functions:functions,
        work_schedule:work_schedule,
        essentials_requirements: essentials_requirements || "",
        optionals_requirements: optionals_requirements || "",
        conditions:conditions,
        province:province,
        location:location,
        create: new mongoose.Types.ObjectId(create),
        expected_incorporation_date: expected_incorporation_date, // Asegurar formato string
        dispositive: {
            programId: new mongoose.Types.ObjectId(programId),
            dispositiveId: new mongoose.Types.ObjectId(dispositiveId)
        },
        studies: Array.isArray(studies) ? studies : [], // Asegurar array
        sepe: sepe === "si", // Convertir a booleano
        type: type || "external",
        datecreate:datecreate || new Date(),
        jobId:jobId,
        provinceId:provinceId
    };

    const savedOfferJob = await Offer.create(dataOfferJob);

    response(res, 200, savedOfferJob)
}



//recoge todos los usuarios
const getOfferJobs = async (req, res) => {
    const OfferJobs = await Offer.find()
    // Responde con la lista de usuarios paginada y código de estado 200 (OK)
    response(res, 200, OfferJobs);
}

const getOfferJobID = async (req, res) => {
    // Obtén el ID del parámetro de la solicitud
    const id = req.body.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const offerJobData = await Offer.findById(id).catch(error => { throw new ClientError('OfferJob no encontrado', 404) });
    // Responde con el usuario encontrado y código de estado 200 (OK)ç
    response(res, 200, offerJobData);
}

const OfferJobDeleteId = async (req, res) => {
    const id = req.params.id;
    const OfferJobDelete = await Offer.deleteOne({ _id: id });
    response(res, 200, OfferJobDelete);
}

// modificar el usuario
const OfferJobPut = async (req, res) => {
    const requiredFields=["id"]
    validateRequiredFields(req.body, requiredFields);

    const {
        functions,
        work_schedule,
        essentials_requirements,
        optionals_requirements,
        conditions,
        province,
        location,
        create,
        expected_incorporation_date,
        dispositiveId,
        studies,
        sepe,
        job_title,
        entity,
        programId,
        id,
        active,
        userCv, 
        type,
        datecreate
    } = req.body;

    // Verificar si la oferta existe
    const existingOffer = await Offer.findById(id);
    if (!existingOffer) {
        return response(res, 404, { error: "Oferta no encontrada." });
    }

    // Construir objeto con los campos a actualizar (solo los enviados)
    const updatedFields = {};
    if (entity) updatedFields.entity = entity;
    
    if (job_title) updatedFields.job_title = job_title;
    if (functions) updatedFields.functions = functions;
    if (userCv) updatedFields.userCv = userCv;
    if (work_schedule) updatedFields.work_schedule = work_schedule;
    if (essentials_requirements) updatedFields.essentials_requirements = essentials_requirements;
    if (optionals_requirements) updatedFields.optionals_requirements = optionals_requirements;
    if (conditions) updatedFields.conditions = conditions;
    if (province) updatedFields.province = province;
    if (location) updatedFields.location = location;
    if (create) updatedFields.create = new mongoose.Types.ObjectId(create);
    if (expected_incorporation_date) updatedFields.expected_incorporation_date = expected_incorporation_date;
    if (studies) updatedFields.studies = Array.isArray(studies) ? studies : [];
    if (typeof sepe !== "undefined") updatedFields.sepe = sepe === "si";
    if(type) updatedFields.type=type
    if(datecreate) updatedFields.datecreate=datecreate

    if (active){
        if(active === "si"){
            updatedFields.active = true
        } else if (active === "no"){
            updatedFields.active = false
        }
    } 
    // Actualizar dispositive si se envían nuevos valores
    if (programId && dispositiveId) {
        updatedFields.dispositive = {
            programId: new mongoose.Types.ObjectId(programId),
            dispositiveId: new mongoose.Types.ObjectId(dispositiveId),
        };
    }

    // Actualizar en la base de datos
    const updatedOffer = await Offer.findByIdAndUpdate(id, updatedFields, { new: true });

    response(res, 200, updatedOffer);
}



module.exports = {
    //gestiono los errores con catchAsync
    postCreateOfferJob: catchAsync(postCreateOfferJob),
    getOfferJobs: catchAsync(getOfferJobs),
    getOfferJobID: catchAsync(getOfferJobID),
    OfferJobDeleteId: catchAsync(OfferJobDeleteId),
    OfferJobPut: catchAsync(OfferJobPut),
}
