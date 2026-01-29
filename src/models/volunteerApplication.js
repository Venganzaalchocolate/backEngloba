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

const STATE_ENUM = ["no asignado", "activo", "descartado", "pendiente"];

const PROGRAM_AREA_ENUM = [
  "igualdad",
  "desarrollo comunitario",
  "lgtbiq",
  "infancia y juventud",
  "personas con discapacidad",
  "mayores",
  "migraciones",
  "no identificado",
];

const StatusEventSchema = new Schema(
  {
    type: { type: String, enum: ["disable", "enable"], required: true },
    at: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 200, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);


const internalNoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const VolunteerChronologySchema = new Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },

    dispositives: [
      { type: Schema.Types.ObjectId, ref: "Dispositive", default: [] },
    ],

    areas: [{ type: String, enum: PROGRAM_AREA_ENUM, default: [] }],
    provinces: [{ type: Schema.Types.ObjectId, ref: "Provinces", default: [] }],

    hours: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" },

    createdAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const InterviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  date: { type: Date, default: null },
  status: {
    type: String,
    enum: ["pendiente", "realizada", "cancelada"],
    default: "pendiente",
  },
  notes: { type: String, trim: true, maxlength: 2000, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const VolunteerApplicationSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 120 },
    lastName: { type: String, required: true, trim: true, maxlength: 180 },
    birthDate: { type: Date, required: true },

    // ✅ gender aquí
    gender: {
      type: String,
      enum: ["male", "female", "others", "nonBinary"],
    },

    interview: { type: [InterviewSchema], default: [] },
    documentId: { type: String, unique: true, index: true },

    phone: { type: String, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },

    province: { type: Schema.Types.ObjectId, ref: "Provinces", index: true },
    localidad: { type: String, trim: true, maxlength: 120 },

    occupation: [{ type: String, enum: OCCUPATION_ENUM }],
    occupationOtherText: { type: String, trim: true, maxlength: 200, default: "" },

    studies: [{ type: Schema.Types.ObjectId, ref: "Studies" }],
    studiesOtherText: { type: String, trim: true, maxlength: 300, default: "" },

    availability: { type: String, trim: true, maxlength: 2000 },

    programInterest: [{ type: Schema.Types.ObjectId, ref: "Program", default: [] }],
    areaInterest: [{ type: String, enum: PROGRAM_AREA_ENUM, default: [] }],

    referralSource: { type: String, trim: true, maxlength: 500 },
    userNote: { type: String, trim: true, maxlength: 10000, default: "" },

    internalNotes: { type: [internalNoteSchema], default: [] },

    chronology: { type: [VolunteerChronologySchema], default: [] },
    files: [{ type: Schema.Types.ObjectId, ref: "Filedrive" }],

    active: { type: Boolean, default: true, index: true },
    disableAt: { type: Date, index: true },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, trim: true, maxlength: 200, default: "" },
    state: { type: String, enum: STATE_ENUM, default: "no asignado" },
    statusEvents: { type: [StatusEventSchema], default: [] },
  },
  { timestamps: true }
);

VolunteerApplicationSchema.index({ email: 1 });
VolunteerApplicationSchema.index({ disableAt: 1, active: 1 });

VolunteerApplicationSchema.statics.disableExpired = function () {
  const now = new Date();
  return this.updateMany(
    { active: true, disableAt: { $lte: now } },
    { $set: { active: false, disabledAt: now, disabledReason: "auto_disable_2y" } }
  );
};

module.exports = mongoose.model("VolunteerApplication", VolunteerApplicationSchema);
