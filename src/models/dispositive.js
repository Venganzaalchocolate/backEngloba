const mongoose = require('mongoose');
const { Schema } = mongoose;

const cronologySchema = new Schema({
  open: { type: Date },
  closed: { type: Date }
});

const dispositiveSchema = new Schema({
  active: { type: Boolean, default: true },
  name: { type: String, required: true },
  address: String,
  email: String,
  phone: String,

  responsible: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  supervisors: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  coordinators: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],

  province: { type: Schema.Types.ObjectId, ref: 'Provinces' },
  files: [{ type: Schema.Types.ObjectId, ref: 'Filedrive' }],
  groupWorkspace: String,
  subGroupWorkspace: { type: [String], default: [] },
  cronology: [cronologySchema],
  program: { type: Schema.Types.ObjectId, ref: 'Program' },
  officeIdSesame: {
    type: String,
    index: true,
    default: null,
  },
  coordinates: {
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
},
resolvedAddress: {
  formatted: { type: String, default: null },
  province: { type: String, default: null },
  city: { type: String, default: null },
  postcode: { type: String, default: null },
  country: { type: String, default: null },
  source: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
},

departamentSesame:{
  type: String,
  index: true,
},

workplaces: [{ type: Schema.Types.ObjectId, ref: 'Workplace', default: [] }],

}, { timestamps: true });

dispositiveSchema.index(
  { program: 1, name: 1 },
  { unique: true, partialFilterExpression: { program: { $type: 'objectId' } } }
);

dispositiveSchema.index({ province: 1 });
dispositiveSchema.index({ program: 1, province: 1 });

// importantes para búsquedas por usuario
dispositiveSchema.index({ responsible: 1 });
dispositiveSchema.index({ supervisors: 1 });
dispositiveSchema.index({ coordinators: 1 });

module.exports = mongoose.model('Dispositive', dispositiveSchema);