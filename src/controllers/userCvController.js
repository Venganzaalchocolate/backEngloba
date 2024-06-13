const {UserCv} = require('../models/indexModels');
const {prevenirInyeccionCodigo, esPassSegura, validName, validEmail, catchAsync, response, generarHashpass, ClientError, sendEmail } = require('../utils/indexUtils');

// crear usuario
const postCreateUserCv = async (req, res) => {
    if (!req.body.name || !req.body.email || !req.body.phone || !req.body.jobs) throw new ClientError("Los datos no son correctos", 400);

    const newUserCv=new UserCv({
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        jobs: req.body.jobs
    })
    const savedUserCv = await newUserCv.save();
    response(res, 200, savedUserCv)
}

//recoge todos los usuarios
const getUserCvs= async (req,res)=>{
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const usuarios = await UserCv.find();
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, usuarios);
}

const getUserCvsFilter= async (req,res)=>{
    const filter = {phone: req.body.phone}
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const usuarios = await UserCv.find(filter);
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, usuarios);
}


//busca un usuario por ID
const getUserCvID= async (req,res)=>{
    // Obtén el ID del parámetro de la solicitud
    const id = req.params.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const usuario = await UserCv.findById(id).catch(error => {throw new ClientError('Usuario no encontrado', 404)});
    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, usuario);
}

// borrar un usuario
const UserCvDeleteId=async (req, res)=>{
    const id = req.params.id;
    const UserCvDelete = await UserCv.deleteOne({_id:id});
    response(res, 200, UserCvDelete);
}

// modificar el usuario
const UserCvPut=async (req, res)=>{
    const filter = { _id: req.body.id};
    const updateText={};
    if(req.body.nombre!=null) updateText['name']=prevenirInyeccionCodigo(req.body.nombre);
    if(req.body.email!=null) updateText['email']=prevenirInyeccionCodigo(req.body.email);
    if(req.body.direccion!=null) updateText['direction']=prevenirInyeccionCodigo(req.body.direccion);
    if(req.body.password!=null && esPassSegura(req.body.password) ) updateText['pass']=await generarHashpass(req.body.password);
    if(req.body.role!=null && (req.body.role=='normal' || req.body.role=='admin')) updateText['role']=req.body.role;
    let doc = await UserCv.findOneAndUpdate(filter, updateText);
    if(doc!=null)doc= await UserCv.findById(req.body.id)
    else throw new ClientError("No existe el usuario", 400)
    response(res, 200, doc);
}

module.exports = {
    //gestiono los errores con catchAsync
    postCreateUserCv:catchAsync(postCreateUserCv),
    getUserCvs:catchAsync(getUserCvs),
    getUserCvID:catchAsync(getUserCvID),
    UserCvDeleteId:catchAsync(UserCvDeleteId),
    UserCvPut:catchAsync(UserCvPut),
    getUserCvsFilter:catchAsync(getUserCvsFilter)
}
