const mongoose = require("mongoose");
const { Schema } = mongoose;

const PeriodEndReasonSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    description: {
      type: String,
      trim: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("PeriodEndReason", PeriodEndReasonSchema);