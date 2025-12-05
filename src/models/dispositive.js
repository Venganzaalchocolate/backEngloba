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
  cronology: [cronologySchema],
  program: { type: Schema.Types.ObjectId, ref: 'Program' }, // 👈 SIN index: true
}, { timestamps: true });

// Índice único compuesto (ya cubre consultas por program y program+name)
dispositiveSchema.index(
  { program: 1, name: 1 },
  { unique: true, partialFilterExpression: { program: { $type: 'objectId' } } }
);

// Índice por provincia (bien para filtrar por provincia sola)
dispositiveSchema.index({ province: 1 });

// (Opcional) si haces muchas queries program+province:
dispositiveSchema.index({ program: 1, province: 1 });


module.exports = mongoose.model('Dispositive', dispositiveSchema);
