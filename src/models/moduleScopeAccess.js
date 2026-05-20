const mongoose = require("mongoose");
const { Schema } = mongoose;

const moduleScopeAccessSchema = new Schema({
  active: {
    type: Boolean,
    default: true,
    index: true,
  },

  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  module: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },

  scopeType: {
    type: String,
    enum: ["program", "dispositive"],
    required: true,
    index: true,
  },

  program: {
    type: Schema.Types.ObjectId,
    ref: "Program",
    default: null,
    index: true,
  },

  dispositive: {
    type: Schema.Types.ObjectId,
    ref: "Dispositive",
    default: null,
    index: true,
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
}, { timestamps: true });

moduleScopeAccessSchema.index(
  { user: 1, module: 1, scopeType: 1, program: 1 },
  {
    unique: true,
    partialFilterExpression: {
      scopeType: "program",
      program: { $type: "objectId" },
    },
  }
);

moduleScopeAccessSchema.index(
  { user: 1, module: 1, scopeType: 1, dispositive: 1 },
  {
    unique: true,
    partialFilterExpression: {
      scopeType: "dispositive",
      dispositive: { $type: "objectId" },
    },
  }
);

module.exports = mongoose.model("ModuleScopeAccess", moduleScopeAccessSchema);