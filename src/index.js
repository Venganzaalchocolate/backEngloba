const express = require('express');
const { limiter, corsOptions, verifyOriginAndReferer, verifyGoogleRequest } = require('./middleware/securityMiddleware');
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
const googleRoutes=require('./routes/googleRoutes')
const { connectToDatabase } = require('./database/connect');
const { listFiles, watchFolder } = require('./controllers/googleController');


require('dotenv').config();
const port = process.env.PORT || 10000;

// Crear la aplicación Express
const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Middleware para CORS y UTF-8
app.use((req, res, next) => {
  // Aplicar CORS con las opciones definidas
  cors(corsOptions)(req, res, () => {
    next();
  });
});

// Middleware para solicitudes preflight OPTIONS
app.options('*', cors(corsOptions), (req, res) => {
  res.sendStatus(200);
});

// Aplicar Rate Limiting a todas las rutas
app.use(limiter);

// Verificar encabezados `origin`, `referer` y solicitudes de Google
app.use(verifyOriginAndReferer);

// Solo aplica verificación de Google en las rutas relevantes
app.use('/api/googlenotificationchange', verifyGoogleRequest);

// Rutas con prefijo `/api`
app.use('/api', userRoutes);
app.use('/api', loginRoutes);
app.use('/api', userCvRoutes);
app.use('/api', filesRoutes);
app.use('/api', bagRoutes);
app.use('/api', programRoutes);
app.use('/api', offerRoutes);
app.use('/api', enumsRoutes);

// Middleware para manejar rutas no encontradas (404)
app.use((req, res, next) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejador de errores personalizado
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  res.header('Access-Control-Allow-Origin', process.env.CORS_ALLOWED_ORIGIN);
  
  const statusCode = err.status || 500;
  const message = (statusCode === 429)
    ? "Ha alcanzado el número máximo de solicitudes, inténtelo más tarde"
    : (statusCode === 500)
    ? 'Error interno en el servidor'
    : err.message;

  resError(res, statusCode, message);
});

// Iniciar el servidor
const startServer = async () => {
  // await watchFolder('1CWzMZ0EnMwQdYbvFJuwnqXTQULxU4uox', 'https://backengloba.onrender.com/api/googlenotificationchange');
  await connectToDatabase();
  
  app.listen(port, () => {
    console.log(`Servidor ejecutándose en el puerto ${port}`);
  });
};

// Llamar a la función para iniciar el servidor
startServer();
