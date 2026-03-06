// models/PermissionProfile.js
const mongoose = require("mongoose");

const PermissionProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true},
    description: { type: String, default: "" },

    // permisos por módulo
    moduleGrants: [
      {
        module: { type: String, required: true, trim: true },
        actions: [{ type: String, required: true }], // ["read","manage"] o ["*"]
        active: { type: Boolean, default: true },
      },
    ],

    note: { type: String, default: "" },
    active: { type: Boolean, default: true },

    // si quieres hard delete, elimina esto. Si quieres soft, úsalo.
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// Único por nombre “vivo” (si usas soft delete)
PermissionProfileSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

module.exports = mongoose.model("PermissionProfile", PermissionProfileSchema);