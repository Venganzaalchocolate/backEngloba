const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cronologySchema = new Schema({
  open: { type: Date },
  closed: { type: Date }
});

const programSchema = new Schema({
  entity: {
    type: Schema.Types.ObjectId,
    ref: 'Entity'
  },
  entinty: {
    type: String,
    enum: ['ASOCIAIÓN ENGLOBA', 'ANIDE', 'APAFA'],
    default: 'ASOCIAIÓN ENGLOBA'
  },
  area: {
    type: String,
    enum: [
      'igualdad',
      'desarrollo comunitario',
      'lgtbiq',
      'infancia y juventud',
      'personas con discapacidad',
      'mayores',
      'migraciones',
      'no identificado'
    ],
    default: 'no identificado'
  },
  email: {
    type: String
  },
  active: {
    type: Boolean,
    default: true
  },

  responsible: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  supervisors: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  coordinators: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],

  finantial: {
    type: [Schema.Types.ObjectId],
    ref: 'Finantial'
  },
  name: {
    type: String,
    required: true
  },
  acronym: {
    type: String,
    required: true
  },
  files: {
    type: [Schema.Types.ObjectId],
    ref: 'Filedrive'
  },
  cronology: [cronologySchema],
  about: {
    description: { type: String },
    objectives: { type: String },
    profile: { type: String }
  },
  resindencial: {
    type: Boolean,
    default: false,
  },
  groupWorkspace: {
    type: String
  },
  subGroupWorkspace: {
    type: [String],
    default: []
  }
});

// importantes para búsquedas por usuario
programSchema.index({ responsible: 1 });
programSchema.index({ supervisors: 1 });
programSchema.index({ coordinators: 1 });

module.exports = mongoose.model('Program', programSchema);