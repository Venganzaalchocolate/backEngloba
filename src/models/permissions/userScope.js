// models/UserScope.js
const mongoose = require("mongoose");

const UserScopeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    resourceType: { type: String, required: true, trim: true, index: true }, // program|dispositive|area|province...
    role: { type: String, required: true, trim: true, index: true },         // responsable|coordinator|viewer...
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    resourceKey: { type: String, default: "", trim: true, index: true },
    // null => todas las provincias (*)
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: "Provinces", default: null, index: true },

    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null, index: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// evita duplicar el mismo alcance en el mismo usuario
UserScopeSchema.index(
  { userId: 1, resourceType: 1, role: 1, provinceId: 1 },
  { unique: true }
);

module.exports = mongoose.model("UserScope", UserScopeSchema);