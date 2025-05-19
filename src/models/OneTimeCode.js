const mongoose = require("mongoose");

const oneTimeCodeSchema = new mongoose.Schema({
  // ID del usuario que solicita la firma (o login OTP)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Código OTP de un solo uso
  code: {
    type: String,
    required: true
  },
  // Fecha de creación (TTL de 5 minutos)
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // Se eliminará 5 minutos después de createdAt
  },
  // Número de intentos fallidos
  attempts: {
    type: Number,
    default: 0
  },
  // Tipo de documento a firmar (opcional para flujos de firma)
  docType: {
    type: String,
    enum: ["payroll", "contract", "recibi"],
    default: null
  },
  // Identificador del documento en Drive (opcional para flujos de firma)
  docId: {
    type: String,
    default: null
  },
  // Metadatos adicionales (por ejemplo: año y mes para nóminas)
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

module.exports = mongoose.model("OneTimeCode", oneTimeCodeSchema);