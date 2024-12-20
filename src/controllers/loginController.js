const {User} = require('../models/indexModels');
const {catchAsync, response, ClientError, comprobarPass, generarToken, verifyToken, generarHashpass} = require('../utils/indexUtils')
const jwt=require('jsonwebtoken');

//comprueba un usuario
const login= async (req,res)=>{
    const emailAux=req.body.email
    const passAux=req.body.password
    // Utiliza el método findOne() de Mongoose para obtener 1 usuario
    const user = await User.findOne({ email: emailAux});
    if(user == null) throw new ClientError("El nombre no es correcto", 403);
    if (!await comprobarPass(passAux, user.pass)) throw new ClientError("La contraseña no es correcta", 403);
    const token = await generarToken(user)
    // Responde con la lista de usuario + el token generado y código de estado 200 (OK)
    const respuesta={user,token}
    response(res, 200, respuesta);
}

const validToken=async(req,res)=>{
    const token=req.body.token
    if(verifyToken(token)){
        const id=jwt.decode(token)._id
        const usuario = await User.findOne({ _id: id});
        response(res,200,usuario)
    } else{
        throw new ClientError("El token no es correcto", 401);
    }
    

}



module.exports = {
    //gestiono los errores con catchAsync
    login:catchAsync(login),
    validToken:catchAsync(validToken)
}