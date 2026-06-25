const mongoose = require("mongoose");

const oidcRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    id: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

oidcRecordSchema.index(
  { type: 1, id: 1 },
  { unique: true }
);

oidcRecordSchema.index({
  "payload.grantId": 1,
});

oidcRecordSchema.index({
  "payload.uid": 1,
});

oidcRecordSchema.index({
  "payload.userCode": 1,
});

module.exports = mongoose.model("OidcRecord", oidcRecordSchema);