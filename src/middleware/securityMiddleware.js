// middleware/securityMiddleware.js
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { resError } = require('../utils/indexUtils');

// Configuración de Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Limitar a 2 solicitudes por IP cada 15 minutos para pruebas
  message: 'Has excedido el límite de solicitudes. Por favor, intenta de nuevo más tarde.',
  standardHeaders: true, // Devuelve información de límite en los headers `RateLimit-*`
  legacyHeaders: false, // Desactiva los headers `X-RateLimit-*`
  handler: (req, res) => {  // Asegúrate de definir un handler personalizado
    res.header('Access-Control-Allow-Origin', process.env.CORS_ALLOWED_ORIGIN); // Asegura CORS en el handler de errores
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
  optionsSuccessStatus: 200, // Para lidiar con navegadores que manejen mal CORS
  credentials: true, // Permitir envío de cookies y credenciales si es necesario
};

// Middleware para verificar los encabezados `origin` y `referer`
const verifyOriginAndReferer = (req, res, next) => {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;

  if (origin === allowedOrigin || (referer && referer.startsWith(allowedOrigin))) {
    next(); // Continuar con la siguiente función middleware o la ruta
  } else {
    resError(res, 403, 'Solicitud no permitida, URL no válida');
  }
};

// Exportar los middlewares
module.exports = {
  limiter,
  corsOptions,
  verifyOriginAndReferer,
};
