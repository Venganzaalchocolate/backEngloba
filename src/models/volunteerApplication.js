// models/VolunteerApplication.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const OCCUPATION_ENUM = [
  "estudiando",
  "trabajando_media_jornada",
  "trabajando_jornada_completa",
  "jubilado",
  "desempleado",
  "otro",
];

// OJO: lo saco de tu programSchema.area
const PROGRAM_AREA_ENUM = [
  "igualdad",
  "desarrollo comunitario",
  "lgtbiq",
  "infancia y juventud",
  "personas con discapacidad",
  "mayores",
  'migraciones',
  "no identificado",
];

const internalNoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const VolunteerChronologySchema = new mongoose.Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },

    // Dispositivo al que se deriva
    dispositive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dispositive",
      required: true,
    },

    // Cantidad de horas dedicadas / previstas
    hours: { type: Number, required: true, min: 0 },

    notes: { type: String, default: "" },

    // Auditoría
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const VolunteerApplicationSchema = new Schema(
  {
    // --- Datos personales ---
    firstName: { type: String, required: true, trim: true, maxlength: 120 },
    lastName: { type: String, required: true, trim: true, maxlength: 180 },
    birthDate: { type: Date, required: true },

    documentId: { type: String, required: true, unique: true, index: true },

    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },

    // --- Ubicación ---
    province: { type: Schema.Types.ObjectId, ref: "Provinces", required: true, index: true },
    localidad: { type: String, required: true, trim: true, maxlength: 120 },

    // --- Ocupación (multi-select) ---
    occupation: [{ type: String, enum: OCCUPATION_ENUM, required: true }],
    occupationOtherText: { type: String, trim: true, maxlength: 200, default: "" },

    // --- Estudios (linked) ---
    studies: [{ type: Schema.Types.ObjectId, ref: "Studies" }],
    studiesOtherText: { type: String, trim: true, maxlength: 300, default: "" },

    // --- Cuestionario ---
    availability: { type: String, required: true, trim: true, maxlength: 2000 },

    // Programas concretos que le interesan (puede no conocer ninguno)
    programInterest: [{ type: Schema.Types.ObjectId, ref: "Program", default: [] }],

    // Si NO conoce programas, elige áreas (puede convivir con programInterest si quieres)
    areaInterest: [{ type: String, enum: PROGRAM_AREA_ENUM, default: [] }],

    referralSource: { type: String, required: true, trim: true, maxlength: 500 },

    // Nota libre que escribe la persona (carta de presentación, etc.)
    userNote: { type: String, trim: true, maxlength: 10000, default: "" },

    // Notas internas del equipo responsable (con autor y fecha)
    internalNotes: { type: [internalNoteSchema], default: [] },

    chronology: { type: [VolunteerChronologySchema], default: [] },
    files: [{ type: Schema.Types.ObjectId, ref: 'Filedrive' }],

    // --- Estado / Auto-deshabilitado ---
    active: { type: Boolean, default: true, index: true },
    disableAt: { type: Date, index: true },       // createdAt + 2 años
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, trim: true, maxlength: 200, default: "" },

  },
  { timestamps: true }
);

// Índices útiles
VolunteerApplicationSchema.index({ email: 1 });
VolunteerApplicationSchema.index({ disableAt: 1, active: 1 });


// Método para deshabilitar caducados (ejecutar con cron/agenda)
VolunteerApplicationSchema.statics.disableExpired = function () {
  const now = new Date();
  return this.updateMany(
    { active: true, disableAt: { $lte: now } },
    { $set: { active: false, disabledAt: now, disabledReason: "auto_disable_2y" } }
  );
};



module.exports = mongoose.model("VolunteerApplication", VolunteerApplicationSchema);
