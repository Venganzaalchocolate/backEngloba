const mongoose = require('mongoose');
const { Schema } = mongoose;

// Cada descarga/acción queda registrada aquí.
// No meto "view" porque ahora mismo no existe esa opción,
// solo nos interesa descarga, petición de firma y firma completada.
const auditEventSchema = new Schema(
  {
    // tipo de evento que ha ocurrido
    type: {
      type: String,
      enum: ['download', 'sign_request', 'sign_complete'],
      required: true,
    },

    // cuándo ocurrió
    at: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Filedrive relacionado si existe
    // por ejemplo, el recibí firmado ya creado
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'Filedrive',
      default: null,
    },

    // id de Drive por si queremos trazar directamente el archivo real en Drive
    driveId: {
      type: String,
      default: null,
    },

    // info opcional por si mañana quieres guardar algo más
    // ej: ip, userAgent, origen, etc
    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

// Aquí guardamos los recibís firmados asociados a este documento.
// Lo dejo separado para no tener que rebuscar luego dentro de events.
const receiptSchema = new Schema(
  {
    // Filedrive creado para el recibí firmado
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'Filedrive',
      required: true,
    },

    // id real en Drive del recibí
    driveId: {
      type: String,
      required: true,
    },

    // fecha de firma
    signedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const userDocumentationAuditSchema = new Schema(
  {
    // usuario al que se le exige/relaciona este documento
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // documento oficial (Documentation)
    documentationId: {
      type: Schema.Types.ObjectId,
      ref: 'Documentation',
      required: true,
      index: true,
    },

    // si queremos dejar constancia de cuándo quedó asociado/asignado
    assignedAt: {
      type: Date,
      default: Date.now,
    },

    // primera vez que se descargó
    firstDownloadedAt: {
      type: Date,
      default: null,
    },

    // última vez que se descargó
    lastDownloadedAt: {
      type: Date,
      default: null,
    },

    // número total de descargas
    downloadCount: {
      type: Number,
      default: 0,
    },

    // si ya hay constancia de recibí firmado
    acknowledged: {
      type: Boolean,
      default: false,
    },

    // última fecha en la que se firmó recibí
    acknowledgedAt: {
      type: Date,
      default: null,
    },

    // lista de recibís firmados asociados a este documento y usuario
    receipts: {
      type: [receiptSchema],
      default: [],
    },

    // historial completo de eventos
    events: {
      type: [auditEventSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Un único registro por usuario + documento.
// Todo el histórico cuelga de aquí.
userDocumentationAuditSchema.index(
  { userId: 1, documentationId: 1 },
  { unique: true }
);

module.exports = mongoose.model('UserDocumentationAudit', userDocumentationAuditSchema);