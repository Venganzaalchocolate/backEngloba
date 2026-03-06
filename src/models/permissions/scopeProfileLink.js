// models/ScopeProfileLink.js
const mongoose = require("mongoose");

const ScopeProfileLinkSchema = new mongoose.Schema(
  {
    resourceType: { type: String, required: true, trim: true, index: true },
    role: { type: String, required: true, trim: true, index: true },


    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: "Provinces", default: null, index: true },

    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PermissionProfile", required: true, index: true },

    active: { type: Boolean, default: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// evita duplicar links
ScopeProfileLinkSchema.index(
  { resourceType: 1, role: 1, provinceId: 1, profileId: 1 },
  { unique: true }
);

module.exports = mongoose.model("ScopeProfileLink", ScopeProfileLinkSchema);