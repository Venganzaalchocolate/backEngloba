const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { resError } = require('../utils/indexUtils');

const openPaths = ['/healthz']; 

// Configuración de Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // Limitar a 500 solicitudes por IP cada 15 minutos
  skip: (req) => req.path === '/healthz',   // ⬅️ nuevo,
  message: 'Has excedido el límite de solicitudes. Por favor, intenta de nuevo más tarde.',
  standardHeaders: true, 
  legacyHeaders: false, 
  handler: (req, res) => {  
    res.header('Access-Control-Allow-Origin', process.env.CORS_ALLOWED_ORIGIN);
    resError(res, 429, 'Has excedido el límite de solicitudes. Por favor, intenta de nuevo más tarde.');
  }
});

// Configuración de CORS
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;
    if (!origin || origin === allowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  optionsSuccessStatus: 200,
  credentials: true,
};



// Middleware para verificar los encabezados `origin` y `referer`
const verifyOriginAndReferer = (req, res, next) => {
  if (openPaths.includes(req.path)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;

  if (origin === allowedOrigin || (referer && referer.startsWith(allowedOrigin))) {
    next();
  } else {
    resError(res, 403, 'Solicitud no permitida, URL no válida');
  }
};

// Exportar los middlewares
module.exports = {
  limiter,
  corsOptions, // Añadido para verificar solicitudes de Google
  verifyOriginAndReferer,
};
