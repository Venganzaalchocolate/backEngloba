require('dotenv').config();
const express = require('express');
const { limiter, corsOptions, verifyOriginAndReferer} = require('./middleware/securityMiddleware');
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
const statisticsRoutes=require('./routes/statisticsRoutes')
const workspaceRoutes=require('./routes/workspaceRoutes')
const { connectToDatabase } = require('./database/connect');
require('./controllers/cronScheduleController');


const port = process.env.PORT || 10000;

// Crear la aplicación Express
const app = express();

// Middleware para parsear JSON
app.use(express.json());

app.use(express.urlencoded({ extended: false }));

// 1) Aplicar CORS globalmente
app.use(cors(corsOptions));


// Aplicar Rate Limiting a todas las rutas
app.use(limiter);

  

app.use((req, res, next) => {

  // Deja pasar los preflight
  if (req.method === 'OPTIONS') return next();
  verifyOriginAndReferer(req, res, next);
});

/* ----------  Health check ---------- */
app.get('/healthz', (_, res) => res.sendStatus(200));


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
app.use('/api', statisticsRoutes);
app.use('/api', workspaceRoutes);


 

/* ----------  Manejador de errores ---------- */
app.use((err, req, res, next) => {            // <-- ¡las 4 params!
  const status = err.status || 500;

  const message =
    status === 429 ? 'Ha alcanzado el número máximo de solicitudes, inténtelo más tarde'
  : status === 500 ? 'Error interno en el servidor'
  : status === 404 ? 'Ruta no encontrada'
  : err.message;

  resError(res, status, message);
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
