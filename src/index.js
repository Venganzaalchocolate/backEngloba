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
const documentationRoutes=require('./routes/documentationRoutes')
const auditRoutes=require('./routes/auditRoutes')
const { connectToDatabase } = require('./database/connect');
require('./controllers/cronScheduleController');

require('dotenv').config();
const port = process.env.PORT || 10000;

// Crear la aplicación Express
const app = express();



app.get('/healthz', (_, res) => res.sendStatus(200));

// Middleware para parsear JSON
app.use(express.json());

app.use(express.urlencoded({ extended: false }));

// 1) Aplicar CORS globalmente
app.use(cors(corsOptions));

// Aplicar Rate Limiting a todas las rutas
app.use(limiter);

// Verificar encabezados `origin`, `referer` y solicitudes de Google
app.use(verifyOriginAndReferer);



// Rutas con prefijo `/api`
app.use('/api', userRoutes);
app.use('/api', loginRoutes);
app.use('/api', userCvRoutes);
app.use('/api', filesRoutes);
app.use('/api', bagRoutes);
app.use('/api', programRoutes);
app.use('/api', offerRoutes);
app.use('/api', enumsRoutes);
app.use('/api', documentationRoutes)
app.use('/api', auditRoutes)

// Middleware para manejar rutas no encontradas (404)
app.use((req, res, next) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejador de errores compatible con Express 5
app.use((err, req, res) => {
  if (res.headersSent) {
    return;
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

  await connectToDatabase();

  app.listen(port, () => {
    console.log(`Servidor ejecutándose en el puerto ${port}`);
  });
};

// Llamar a la función para iniciar el servidor
startServer();
