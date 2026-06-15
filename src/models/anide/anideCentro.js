const mongoose = require("mongoose");
const { Schema } = mongoose;

const camaSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    active: {
      type: Boolean,
      default: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const habitacionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    active: {
      type: Boolean,
      default: true,
    },

    camas: {
      type: [camaSchema],
      default: [],
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const anideCentroSchema = new Schema(
  {
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    province: {
      type: Schema.Types.ObjectId,
      ref: "Provinces",
      required: true,
      index: true,
    },

    habitaciones: {
      type: [habitacionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

anideCentroSchema.index(
  { name: 1, province: 1 },
  { unique: true }
);

module.exports = mongoose.model("AnideCentro", anideCentroSchema);