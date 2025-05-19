const { User } = require('../models/indexModels');
const { verifyToken } = require('../utils/indexUtils');

// Verifica que el token sea válido
const tokenValid = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const verificacion = await verifyToken(token);
    
    if (!verificacion) {
      return res.status(401).send({ error: true, message: "El token no es válido" });
    }

    // Puedes pasar datos en `req.user` si lo necesitas después
    req.user = verificacion;
    next();
  } catch (error) {
    return res.status(401).send({ error: true, message: "El token no es válido" });
  }
};

// Verifica que el token sea válido y que el usuario sea administrador
const tokenValidAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const verificacion = await verifyToken(token);

    if (!verificacion) {
      return res.status(401).send({ error: true, message: "Token inválido" });
    }

    if (verificacion.role === 'root') {
      req.user = verificacion;
      return next();
    }

    return res.status(401).send({ error: true, message: "El usuario no está autorizado" });
  } catch (error) {
    return res.status(401).send({ error: true, message: "Token inválido" });
  }
};

module.exports = {
  tokenValid,
  tokenValidAdmin,
};
