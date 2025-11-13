// models/Device.js (CJS)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cronologySchema=new Schema({
    open:{
        type: Date,
    },
    closed:{
        type:Date
    }
})
const dispositiveSchema = new Schema({
  active: { type: Boolean, default: true },
  name: { type: String, required: true },
  address: String,
  email: String,
  phone: String,
  responsible: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  province: { type: Schema.Types.ObjectId, ref: 'Provinces' },
  coordinators: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  files: [{ type: Schema.Types.ObjectId, ref: 'Filedrive' }],
  groupWorkspace: String,
  subGroupWorkspace: { type: [String], default: [] },
  cronology:[cronologySchema],
  program: { type: Schema.Types.ObjectId, ref: 'Program', index: true }, // NUEVO
}, { timestamps: true });

// Índice único compuesto (con partial para no romper docs antiguos sin program)
dispositiveSchema.index(
  { program: 1, name: 1 },
  { unique: true, partialFilterExpression: { program: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Dispositive', dispositiveSchema);
