// models/ModuleGrant.js
const mongoose = require("mongoose");

const ModuleGrantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    module: { type: String, required: true, trim: true, index: true },
    actions: [{ type: String, required: true }], // ["*"] o ["read","manage"]

    // "profiles" materializado desde perfiles; deja hueco por si mañana tienes otros sources
    source: { type: String, required: true, default: "profiles", index: true },

    // trazabilidad (qué perfiles lo generan)
    sourceProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: "PermissionProfile" }],

    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },

    computedAt: { type: Date, default: null, index: true },
    computedHash: { type: String, default: "", index: true },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

ModuleGrantSchema.index({ userId: 1, module: 1, source: 1 }, { unique: true });

module.exports = mongoose.model("ModuleGrant", ModuleGrantSchema);