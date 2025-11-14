const mongoose = require('mongoose');
const { Schema } = mongoose;

const dynamicDocFieldSchema = new Schema({
  key: {
    type: String,
    required: true, // ej: "aceptaProteccionDatos"
  },
  label: {
    type: String,
    required: true, // ej: "Acepta la política de protección de datos"
  },
  type: {
    type: String,
    enum: [
      'text',       // input texto corto
      'textarea',   // texto largo
      'checkbox',
      'radio',
      'select',
      'date',
      'number',
    ],
    required: true,
  },
  required: {
    type: Boolean,
    default: false,
  },
  options: [{
    // solo para 'radio' y 'select'
    value: String,     // valor interno
    label: String,     // texto que ve el usuario
  }],
  helperText: {
    type: String,      // descripción opcional
  },
  order: {
    type: Number,
    default: 0,        // para ordenar campos en el formulario
  },
  showInSummary: {
    type: Boolean,
    default: true,     // si quieres mostrar este campo en listados/resúmenes
  },
}, { _id: false });

const dynamicDocTemplateSchema = new Schema({
  name: {
    type: String,
    required: true,        // "Autorización acceso a datos"
  },
  code: {
    type: String,
    required: true,
    unique: true,          // "AUT_DATOS_V1"
    trim: true,
  },
  description: {
    type: String,
  },

  // A quién se aplica principalmente este documento
  targetModel: {
    type: String,
    enum: ['User', 'Program', 'Device', 'Other'],
    default: 'User',
  },

  // Texto base con placeholders, por ejemplo:
  // "Yo, [[campo_nombre]], con DNI [[auto_dni_usuario]]..."
  templateBody: {
    type: String,
    required: true,
  },

  // Campos interactivos que se rellenan en el formulario antes de firmar
  fields: [dynamicDocFieldSchema],

  // Config opcional para el PDF
  pdfConfig: {
    showLogo: { type: Boolean, default: true },
    showHeader: { type: Boolean, default: true },
    showFooter: { type: Boolean, default: true },
    marginTop: { type: Number, default: 40 },
    marginBottom: { type: Number, default: 40 },
  },

  active: {
    type: Boolean,
    default: true,
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true, // createdAt, updatedAt
});

const DynamicDocTemplate = mongoose.model('DynamicDocTemplate', dynamicDocTemplateSchema);

module.exports = DynamicDocTemplate;
