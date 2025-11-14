const dynamicDocInstanceSchema = new Schema({
  template: {
    type: Schema.Types.ObjectId,
    ref: 'DynamicDocTemplate',
    required: true,
  },

  // Relación principal (ej: trabajador)
  targetModel: {
    type: String,
    enum: ['User', 'Program', 'Device', 'Other'],
    default: 'User',
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: true, // id del User/Program/Device al que aplica
  },

  // Opcional: para facilitar filtros por programa/dispositivo sin joins raros
  program: {
    type: Schema.Types.ObjectId,
    ref: 'Program',
  },
  device: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
  },

  // Respuestas del formulario, tal cual las rellenó el usuario
  // { campo_nombre: "Pepe Pérez", aceptaProteccion: true, ... }
  answers: {
    type: Schema.Types.Mixed,
    default: {},
  },

  // Texto resultante final (con placeholders ya sustituidos) para tener una
  // "foto" legal de lo que se firmó en ese momento
  resolvedBody: {
    type: String,
  },

  // Estado del documento
  status: {
    type: String,
    enum: ['draft', 'signed', 'cancelled'],
    default: 'draft',
  },

  // Info de firma (adaptable al sistema que ya usas para nóminas)
  signature: {
    signedAt: Date,
    signedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User', // quién clicó en "firmar"
    },
    signerName: String, // congelado: en el momento de firmar
    signerDni: String,  // idem
    signerIp: String,
    signerUserAgent: String,
    signatureHash: String, // opcional: hash de seguridad
  },

  // Enlace al PDF generado (integración con tu sistema de ficheros)
  file: {
    type: Schema.Types.ObjectId,
    ref: 'File', // si ya tienes un modelo File
  },
  fileUrl: {
    type: String, // alternativo / redundante si quieres tener la URL directa
  },
}, {
  timestamps: true,
});

const DynamicDocInstance = mongoose.model('DynamicDocInstance', dynamicDocInstanceSchema);

module.exports = DynamicDocInstance;
