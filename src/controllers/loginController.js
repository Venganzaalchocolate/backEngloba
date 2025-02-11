const { User } = require('../models/indexModels');
const OneTimeCode = require('../models/OneTimeCode');
const { catchAsync, response, ClientError, comprobarPass, generarToken, verifyToken, generarHashpass } = require('../utils/indexUtils')
const jwt = require('jsonwebtoken');
const { sendEmail, generateEmailHTML } = require('./emailController');


// Función para generar un código de 6 dígitos
function generarCodigoTemporal() {
    // O simplemente Math.floor(100000 + Math.random() * 900000)
    return ("" + Math.floor(Math.random() * 999999)).padStart(6, "0");
}



// //comprueba un usuario
// const login= async (req,res)=>{
//     const emailAux=req.body.email
//     const passAux=req.body.password
//     // Utiliza el método findOne() de Mongoose para obtener 1 usuario
//     const user = await User.findOne({ email: emailAux});
//     if(user == null) throw new ClientError("El nombre no es correcto", 403);
//     if (!await comprobarPass(passAux, user.pass)) throw new ClientError("La contraseña no es correcta", 403);
//     const token = await generarToken(user)
//     // Responde con la lista de usuario + el token generado y código de estado 200 (OK)
//     const respuesta={user,token}
//     response(res, 200, respuesta);
// }


const login = async (req, res) => {
    const emailAux = req.body.email;
    // 1. Encontrar usuario por email
    const user = await User.findOne({ email: emailAux });
    if (!user) throw new ClientError("El email no es correcto", 403);

    // if (emailAux == 'responsable@engloba.org.es' || emailAux == 'root@engloba.org.es') {
    //     const passAux = req.body.password
    //     if (!await comprobarPass(passAux, user.pass)) throw new ClientError("La contraseña no es correcta", 403);
    //     const token = await generarToken(user)

    //     // Responde con la lista de usuario + el token generado y código de estado 200 (OK)
    //     const respuesta = { user, token }
    //     response(res, 200, respuesta);
    // } else {
        // 2. Generar código de un solo uso
        const codigo = generarCodigoTemporal();

        // 3. Actualizar (o crear) documento en MongoDB con upsert
        await OneTimeCode.findOneAndUpdate(
            { userId: user._id },
            {
                code: codigo,
                createdAt: new Date(),  // Renueva la fecha de creación para el TTL
                attempts: 0            // Resetea intentos en caso de que existan de un código anterior
            },
            { upsert: true, new: true }
        );

        // 5. Enviar el email al usuario con el código
        const asunto = "Tu código de verificación";
        const textoPlano = `Este es tu código de verificación de un solo uso: ${codigo}. Es válido durante 5 minutos.`;

        const htmlContent = generateEmailHTML({
            logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
            title: "Tu Código de Verificación",
            greetingName: user.firstName, // o user.nombre
            bodyText: "Este es tu código de verificación de un solo uso. Es válido durante 5 minutos. Por favor, no lo compartas.",
            highlightText: codigo, // el código que quieras resaltar
            footerText: "Gracias por usar nuestra plataforma. Si tienes dudas, contáctanos."
        });

        await sendEmail(user.email, asunto, textoPlano, htmlContent);

        // 6. Responder
        response(res, 200, {
            message: `Código de verificación enviado a tu correo ${user.email}. Tienes 5 minutos para usarlo.`,
            userId: user._id
        });
    // }

};



const verifyCode = async (req, res) => {
    const { userId, code } = req.body;

    // 1. Buscar el documento OneTimeCode
    const codeDoc = await OneTimeCode.findOne({ userId });
    if (!codeDoc) {
        throw new ClientError("El código no existe o ha expirado.", 403);
    }

    // 2. Verificar reintentos
    if (codeDoc.attempts >= 3) {
        await OneTimeCode.deleteOne({ _id: codeDoc._id });
        throw new ClientError("Has superado el máximo de reintentos. Vuelve a iniciar sesión.", 403);
    }

    // 3. Comparar el código
    if (codeDoc.code !== code) {
        // Incrementar attempts
        codeDoc.attempts += 1;
        await codeDoc.save();

        if (codeDoc.attempts >= 3) {
            await OneTimeCode.deleteOne({ _id: codeDoc._id });
            throw new ClientError("Has superado el máximo de reintentos. Vuelve a iniciar sesión.", 403);
        }

        throw new ClientError("El código introducido es incorrecto.", 403);
    }

    // 4. Código correcto -> eliminamos el documento (ya no se puede reutilizar)
    await OneTimeCode.deleteOne({ _id: codeDoc._id });

    // 5. Generar el token y responder
    const user = await User.findById(userId);
    const token = await generarToken(user); // Ajusta según tu lógica de JWT

    response(res, 200, {
        user,
        token
    });

};



const validToken = async (req, res) => {
    const token = req.body.token
    if (verifyToken(token)) {
        const id = jwt.decode(token)._id
        const usuario = await User.findOne({ _id: id });
        response(res, 200, usuario)
    } else {
        throw new ClientError("El token no es correcto", 401);
    }


}



module.exports = {
    //gestiono los errores con catchAsync
    login: catchAsync(login),
    validToken: catchAsync(validToken),
    verifyCode: catchAsync(verifyCode)
}