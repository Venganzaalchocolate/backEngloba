const mongoose = require('mongoose');

const fileHistorySchema = new mongoose.Schema({
  id: String,
  name: String,
  mimeType: String,
  modifiedTime: String,
  isFolder: Boolean,
  backupType: String // p.ej.: "12h" o "3d"
});

// Índice único compuesto (id + backupType), 
// evita duplicar el mismo archivo en el mismo tipo de backup.
fileHistorySchema.index({ id: 1, backupType: 1 }, { unique: true });

module.exports = mongoose.model('FileHistory', fileHistorySchema);
