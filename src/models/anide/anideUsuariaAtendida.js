const mongoose = require("mongoose");
const { Schema } = mongoose;

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
      default: null,
      index: true,
    },

    camaId: {
      type: Schema.Types.ObjectId,
      default: null,
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

    companions: {
      children: {
        type: Number,
        default: 0,
        min: 0,
      },

      dependents: {
        type: Number,
        default: 0,
        min: 0,
      },

      adults: {
        type: Number,
        default: 0,
        min: 0,
      },

      notes: {
        type: String,
        trim: true,
        default: "",
      },
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

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

    familyUnit: {
      children: {
        type: Number,
        default: 0,
        min: 0,
      },

      dependents: {
        type: Number,
        default: 0,
        min: 0,
      },

      adults: {
        type: Number,
        default: 0,
        min: 0,
      },

      notes: {
        type: String,
        trim: true,
        default: "",
      },
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