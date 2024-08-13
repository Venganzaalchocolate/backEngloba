// app.js

const express = require('express');
const mongoose = require('mongoose');
const { limiter, corsOptions, verifyOriginAndReferer } = require('./middleware/securityMiddleware');
const cors = require('cors');
const userRoutes = require("./routes/userRoutes");
const loginRoutes = require("./routes/loginRoutes");
const userCvRoutes = require("./routes/userCvRoutes");
const filesRoutes = require("./routes/fileRoutes");
const bagRoutes = require("./routes/bagRoutes");
const { resError } = require('./utils/indexUtils');
const programRoutes = require('./routes/programRoutes');
const offerRoutes = require('./routes/offerRoutes');
const enumsRoutes = require('./routes/enumsRoutes');

require('dotenv').config();
const port = process.env.PORT || 10000;

const app = express();

app.use(express.json());

// Aplicar CORS con las opciones definidas - Esto debe ser lo primero después de express.json()
app.use(cors(corsOptions));

// Manejar solicitudes preflight OPTIONS
app.options('*', cors(corsOptions), (req, res) => {
  res.sendStatus(200);
});

// Aplicar Rate Limiting a todas las rutas
app.use(limiter);

// Verificar los encabezados `origin` y `referer`
app.use(verifyOriginAndReferer);

// Asignación de rutas con prefijo `/api`
app.use('/api', userRoutes);
app.use('/api', loginRoutes);
app.use('/api', userCvRoutes);
app.use('/api', filesRoutes);
app.use('/api', bagRoutes);
app.use('/api', programRoutes);
app.use('/api', offerRoutes);
app.use('/api', enumsRoutes);

// Manejador de errores personalizado para no mostrar la ruta del error
app.use((err, req, res, next) => {
  // Asegurarse de que el encabezado CORS esté presente en las respuestas de error
  res.header('Access-Control-Allow-Origin', process.env.CORS_ALLOWED_ORIGIN);
  const statusCode = err.status || 500;
  const message =(statusCode==429)?"Ha alcanzado el número máximo de solicitudes, intentélo más tarde":'Error interno del servidor';
  resError(res, statusCode, message);
});

// Configuración y conexión a MongoDB
const uri = `mongodb+srv://comunicacion:${process.env.PASS}@engloba.knu8mxl.mongodb.net/?retryWrites=true&w=majority&appName=${process.env.BBDDNAME}`;
mongoose.connect(uri);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
db.once('open', () => {
  console.log('Conexión exitosa a MongoDB al puerto ' + port);
});

// Iniciar el servidor en el puerto especificado
app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`);
});
