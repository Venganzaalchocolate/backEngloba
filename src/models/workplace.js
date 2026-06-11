const mongoose = require('mongoose');
const { Schema } = mongoose;

const cronologySchema = new Schema({
  open: { type: Date },
  closed: { type: Date }
}, { _id: false });

const coordinatesSchema = new Schema({
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
}, { _id: false });

const resolvedAddressSchema = new Schema({
  formatted: { type: String, default: null },
  province: { type: String, default: null },
  city: { type: String, default: null },
  postcode: { type: String, default: null },
  country: { type: String, default: null },
  source: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
}, { _id: false });

const workplaceSchema = new Schema({
  active: { type: Boolean, default: true },

  name: { type: String, required: true },
  address: String,
  phone: String,

  province: { type: Schema.Types.ObjectId, ref: 'Provinces' },

  coordinates: coordinatesSchema,
  resolvedAddress: resolvedAddressSchema,

  cronology: [cronologySchema],

  files: [{ type: Schema.Types.ObjectId, ref: 'Filedrive', default: [] }],

  officeIdSesame: {
    type: String,
    index: true,
    default: null,
  },

  entity:{
    type:String,
    enum:['Engloba', 'Quiron'],
    default:'Engloba'
  },
  codCentroOhs: {
  type: String,
  index: true,
  default: null,
}
}, { timestamps: true });

workplaceSchema.index(
  { name: 1, province: 1 },
  { unique: true, partialFilterExpression: { province: { $type: 'objectId' } } }
);

workplaceSchema.index({ province: 1 });
workplaceSchema.index({ active: 1 });

module.exports = mongoose.model('Workplace', workplaceSchema);