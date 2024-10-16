const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { resError } = require('../utils/indexUtils');

// Configuración de Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // Limitar a 5000 solicitudes por IP cada 15 minutos
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

// Middleware para verificar solicitudes de Google
const verifyGoogleRequest = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  const googleToken = req.get('X-Goog-Channel-Token'); // Revisa encabezados específicos de Google
  
  if (userAgent && userAgent.includes('APIs-Google') && googleToken) {
    return next(); // Es una solicitud válida de Google
  } else {
    resError(res, 403, 'Acceso no permitido');
  }
};

// Middleware para verificar los encabezados `origin` y `referer`
const verifyOriginAndReferer = (req, res, next) => {
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
  corsOptions,
  verifyGoogleRequest, // Añadido para verificar solicitudes de Google
  verifyOriginAndReferer,
};
