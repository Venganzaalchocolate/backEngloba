const mongoose = require("mongoose");

const SesameWorkEntryAlertSchema =
  new mongoose.Schema(
    {
      workEntryId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      employeeId: {
        type: String,
        required: true,
        index: true,
      },

      clockInDate: {
        type: Date,
        required: true,
      },

      employee8hNotifiedAt: {
        type: Date,
        default: null,
      },

      responsible24hNotifiedAt: {
        type: Date,
        default: null,
      },

      admin48hNotifiedAt: {
        type: Date,
        default: null,
      },

      lastSeenOpenAt: {
        type: Date,
        default: Date.now,
      },

      /*
       * Seguridad adicional:
       * Mongo eliminará el registro cuando llegue esta fecha.
       */
      expiresAt: {
        type: Date,
        expires: 0,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports = mongoose.model(
  "SesameWorkEntryAlert",
  SesameWorkEntryAlertSchema
);