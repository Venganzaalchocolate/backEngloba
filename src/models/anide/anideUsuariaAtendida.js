const mongoose = require("mongoose");
const { Schema } = mongoose;

/* =====================================================
   ALIAS DE LA USUARIA PRINCIPAL
===================================================== */

const aliasSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },

    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

/* =====================================================
   ESTANCIA ANIDE
   Se reutiliza tanto para la responsable como para
   cada menor o persona dependiente.
===================================================== */

const stayAnideSchema = new Schema(
  {
    centro: {
      type: Schema.Types.ObjectId,
      ref: "AnideCentro",
      required: true,
      index: true,
    },

    province: {
      type: Schema.Types.ObjectId,
      ref: "Provinces",
      default: null,
      index: true,
    },

    habitacionId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    camaId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

/* =====================================================
   FAMILIAR A CARGO
   No es una usuaria independiente del panel general.
   Pertenece a una responsable y tiene cama/histórico propio.
===================================================== */

const familyMemberSchema = new Schema(
  {
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
    },

    birthday: {
      type: Date,
      default: null,
    },

    relationship: {
      type: String,
      required: true,
      enum: ["child", "dependent"],
    },

    documentId: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    staysAnide: {
      type: [stayAnideSchema],
      default: [],
    },
  },
  { _id: true }
);

/* =====================================================
   USUARIA PRINCIPAL / RESPONSABLE FAMILIAR
===================================================== */

const anideUsuariaAtendidaSchema = new Schema(
  {
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    aliases: {
      type: [aliasSchema],
      default: [],
    },

    documentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    birthday: {
      type: Date,
      default: null,
    },

    nationality: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "others", "nonBinary", ""],
      default: "",
    },

    familyMembers: {
      type: [familyMemberSchema],
      default: [],
    },

    staysAnide: {
      type: [stayAnideSchema],
      default: [],
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

anideUsuariaAtendidaSchema.index({ firstName: 1, lastName: 1 });

module.exports = mongoose.model(
  "AnideUsuariaAtendida",
  anideUsuariaAtendidaSchema
);