const mongoose = require('mongoose');

const fileMappingSchema = new mongoose.Schema({
  originalId: String, 
  backupId: String,
  backupType: String // "12h" o "3d"
});

// Queremos que (originalId + backupType) sea único, 
// para no duplicar la misma cosa en el mismo backup.
fileMappingSchema.index({ originalId: 1, backupType: 1 }, { unique: true });

module.exports = mongoose.model('FileMapping', fileMappingSchema);
