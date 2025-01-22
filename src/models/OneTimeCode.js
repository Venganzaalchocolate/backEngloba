// models/OneTimeCode.js
const mongoose = require("mongoose");

const oneTimeCodeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  code: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // El documento se eliminará automáticamente 5 minutos (300s) después de createdAt
    expires: 300 
  },
  attempts: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model("OneTimeCode", oneTimeCodeSchema);
