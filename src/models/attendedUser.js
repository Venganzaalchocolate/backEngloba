const mongoose = require("mongoose");
const { Schema } = mongoose;

const aliasSchema = new Schema({
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
}, { _id: false });

const staySchema = new Schema({
  dispositive: {
    type: Schema.Types.ObjectId,
    ref: "Dispositive",
    required: true,
  },
  program: {
    type: Schema.Types.ObjectId,
    ref: "Program",
    default: null,
  },
  province: {
    type: Schema.Types.ObjectId,
    ref: "Provinces",
    default: null,
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
  },
  notes: {
    type: String,
    trim: true,
    default: "",
  },
}, { _id: true });

const fileSchema = new Schema({
  filesId: {
    type: Schema.Types.ObjectId,
    ref: "Filedrive",
  },
  fileName: {
    type: String,
  },
  fileTag: {
    type: String,
  },
  description: {
    type: String,
  },
  date: {
    type: String,
  },
}, { _id: true });

const attendedUserSchema = new Schema({
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

  stays: {
    type: [staySchema],
    default: [],
  },

  files: {
    type: [fileSchema],
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
  documentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true,
  },
}, { timestamps: true });

attendedUserSchema.index({ firstName: 1, lastName: 1 });
attendedUserSchema.index({ "stays.dispositive": 1 });
attendedUserSchema.index({ "stays.program": 1 });
attendedUserSchema.index({ "stays.province": 1 });
attendedUserSchema.index({ "stays.active": 1 });

module.exports = mongoose.model("AttendedUser", attendedUserSchema);