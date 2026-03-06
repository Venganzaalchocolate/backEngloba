// models/UserProfileAssignment.js
const mongoose = require("mongoose");

const UserProfileAssignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PermissionProfile", required: true, index: true },

    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null, index: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// evita duplicados user+profile
UserProfileAssignmentSchema.index({ userId: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.model("UserProfileAssignment", UserProfileAssignmentSchema);