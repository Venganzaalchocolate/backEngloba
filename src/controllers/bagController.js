const {Bag, Program} = require('../models/indexModels');
const {prevenirInyeccionCodigo, esPassSegura, validName, validEmail, catchAsync, response, generarHashpass, ClientError, sendEmail } = require('../utils/indexUtils');
const { getSpainCurrentDate } = require('../utils/utils');

// crear usuario
const postCreateBag = async (req, res) => {
    if (!req.body.sepe || !req.body.dispositive || !req.body.create) throw new ClientError("Los datos no son correctos", 400);

    const nameDispositive= await Program.findOne(
        { 'devices._id': req.body.dispositive },
        { 'devices.$': 1 } // Esto proyecta solo el dispositivo que coincide con el ID
    );
    const newBag=new Bag({
        name: nameDispositive.devices[0].name+'_'+getSpainCurrentDate(),
        sepe: req.body.sepe,
        date: new Date(),
        dispositive:{
            name: nameDispositive.devices[0].name,
            id: req.body.dispositive
        },
        create: req.body.create,
    })
    const savedBag = await newBag.save();
    response(res, 200, savedBag)
}

//recoge todos los usuarios
const getBags= async (req,res)=>{
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const bags = await Bag.find();
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, bags);
}

const getBagsFilter= async (req,res)=>{
    const filter = {name: {$regex: `.*${req.body.name}.*`}}
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const bags = await Bag.find(filter);
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, bags);
}


//busca un usuario por ID
const getBagID= async (req,res)=>{
    // Obtén el ID del parámetro de la solicitud
    const id = req.params.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const bag = await Bag.findById(id).catch(error => {throw new ClientError('Bolsa no encontrado', 404)});
    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, bag);
}

// borrar un usuario
const BagDeleteId=async (req, res)=>{
    const id = req.params.id;
    const BagDelete = await Bag.deleteOne({_id:id});
    response(res, 200, BagDelete);
}

// modificar el usuario
const BagPut=async (req, res)=>{
    if (!req.body._id) throw new ClientError("Los datos no son correctos", 400);
    const filter = { _id: req.body._id };
    const updateText = {};

    if (req.body.user) {
        const user = req.body.user;
        updateText['$addToSet'] = {
            userCv: user
        };
    }

    let doc = await Bag.findOneAndUpdate(filter, updateText, { new: true });
    if (doc) {
        response(res, 200, doc);
    } else {
        throw new ClientError("La bolsa no existe", 400);
    }
}

const BagPutDeleteUser = async (req, res) => {
    if (!req.body._id) throw new ClientError("Los datos no son correctos", 400);
    
    const filter = { _id: req.body._id };
    const updateText = {};
    
    if (req.body.user) {
        const user = req.body.user;
        updateText['$pull'] = {
            userCv: user._id
        };
    }

    let doc = await Bag.findOneAndUpdate(filter, updateText, { new: true });
    if (doc) {
            response(res, 200, doc);
    } else {
            throw new ClientError("La bolsa no existe", 400);
    }

};




module.exports = {
    //gestiono los errores con catchAsync
    postCreateBag:catchAsync(postCreateBag),
    getBags:catchAsync(getBags),
    getBagID:catchAsync(getBagID),
    BagDeleteId:catchAsync(BagDeleteId),
    BagPut:catchAsync(BagPut),
    getBagsFilter:catchAsync(getBagsFilter),
    BagPutDeleteUser:catchAsync(BagPutDeleteUser)
}
