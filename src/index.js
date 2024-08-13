//usamos express como freamwork
const express=require('express');
const mongoose=require("mongoose")
const cors = require('cors'); // Importa el paquete cors
const userRoutes=require("./routes/userRoutes");
const loginRoutes=require("./routes/loginRoutes");
const userCvRoutes=require("./routes/userCvRoutes");
const filesRoutes=require("./routes/fileRoutes");
const bagRoutes=require("./routes/bagRoutes");
const {resError} = require('./utils/indexUtils');
const programRoutes=require('./routes/programRoutes')
const offerRoutes=require('./routes/offerRoutes')
const enumsRoutes=require('./routes/enumsRoutes')


// usamos dtenv para las variables de entorno 
require('dotenv').config()
const port = process.env.PORT || 10000;

const app=express();
// Middleware para parsear el cuerpo de la solicitud como JSON
app.use(express.json());
// le asignamos una constante a las rutas de usuario

// donde escucha el servidor 
app.listen(port);

const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;

app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes desde el frontend o desde herramientas de desarrollo como Postman
    if (!origin || origin === allowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  }
}));

// Middleware para verificar los encabezados `origin` y `referer`
app.use((req, res, next) => {
  const origin = req.get('origin');
  const referer = req.get('referer');

  // Verificar que la solicitud provenga del origen permitido
  if (origin === allowedOrigin || (referer && referer.startsWith(allowedOrigin))) {
    next(); // Continuar con la siguiente función middleware o la ruta
  } else {
    resError(res,403,'Solicitud no permitida url no valida')
   
  }
});

//le ponemos un "prefijo" a las rutas
app.use('/api',userRoutes)
app.use('/api',loginRoutes)
app.use('/api',userCvRoutes)
app.use('/api',filesRoutes)
app.use('/api',bagRoutes)
app.use('/api',programRoutes)
app.use('/api',offerRoutes)
app.use('/api',enumsRoutes)

//le pasamos el manejador de errores en vez del suyo para no mostrar la ruta del error
app.use((err,req,res,next)=>{
  const statusCode=err.status || 500;
  const message=err.message || 'Error interno del servidor';
  resError(res,statusCode,message)
})


const uri = `mongodb+srv://comunicacion:${process.env.PASS}@engloba.knu8mxl.mongodb.net/?retryWrites=true&w=majority&appName=${process.env.BBDDNAME}`
mongoose.connect(uri);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
db.once('open', () => {
  console.log('Conexión exitosa a MongoDB al puerto '+port);
});