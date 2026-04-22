const mongoose = require("mongoose");
const { Schema } = mongoose;

const AREA_ENUM = [
  "igualdad",
  "desarrollo comunitario",
  "lgtbiq",
  "infancia y juventud",
  "personas con discapacidad",
  "mayores",
  "migraciones",
  "no identificado",
];

const scopedRoleRuleSchema = new Schema({
  active: { type: Boolean, default: true },

  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  roleType: {
    type: String,
    enum: ["responsible", "coordinators", "supervisors"],
    required: true,
    index: true,
  },

  scopeType: {
    type: String,
    enum: ["program", "dispositive"],
    required: true,
    index: true,
  },

  filters: {
    area: {
      type: String,
      enum: AREA_ENUM,
      default: null,
    },
    provinceId: {
      type: Schema.Types.ObjectId,
      ref: "Provinces",
      default: null,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      default: null,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      default: null,
    },
    onlyActive: {
      type: Boolean,
      default: true,
    },
  },

  note: { type: String, default: "" },
}, { timestamps: true });

scopedRoleRuleSchema.index({ userId: 1, roleType: 1, scopeType: 1, active: 1 });
scopedRoleRuleSchema.index({ scopeType: 1, roleType: 1, active: 1 });
scopedRoleRuleSchema.index({ "filters.area": 1 });
scopedRoleRuleSchema.index({ "filters.provinceId": 1 });
scopedRoleRuleSchema.index({ "filters.entityId": 1 });
scopedRoleRuleSchema.index({ "filters.programId": 1 });

module.exports = mongoose.model("ScopedRoleRule", scopedRoleRuleSchema);