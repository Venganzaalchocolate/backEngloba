// models/SesameResponsibility.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

const sesameResponsibilitySchema = new Schema(
  {
    // Usuario en nuestra app
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Identidad en Sesame
    employeeIdSesame: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    employeeCodeSesame: {
      type: Number,
      default: null,
    },
    employeeName: {
      type: String,
      default: "",
      trim: true,
    },
    employeeEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    // Rol materializado para uso interno
    responsibilityType: {
      type: String,
      enum: ["company_admin", "office_manager", "department_manager"],
      required: true,
      index: true,
    },

    // Rol real de Sesame
    roleAssignationIdSesame: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    roleIdSesame: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    roleName: {
      type: String,
      default: "",
      trim: true,
    },

    // Entidad afectada en Sesame
    entityType: {
      type: String,
      enum: ["company", "office", "department"],
      required: true,
      index: true,
    },
    entityIdSesame: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityName: {
      type: String,
      default: "",
      trim: true,
    },

    // Relación con nuestros datos
    dispositiveId: {
      type: Schema.Types.ObjectId,
      ref: "Dispositive",
      default: null,
      index: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      default: null,
      index: true,
    },

    // Para departamentos, de momento dejamos un campo libre
    departmentExternalKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // Control de sincronización
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Para depuración si lo necesitas
    raw: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Un mismo usuario no debería tener duplicada la misma responsabilidad
sesameResponsibilitySchema.index(
  {
    userId: 1,
    responsibilityType: 1,
    entityIdSesame: 1,
  },
  {
    unique: true,
    name: "uniq_user_responsibility_entity",
  }
);

// Útiles para consultas rápidas
sesameResponsibilitySchema.index(
  { responsibilityType: 1, active: 1 },
  { name: "idx_type_active" }
);

sesameResponsibilitySchema.index(
  { entityType: 1, entityIdSesame: 1, active: 1 },
  { name: "idx_entity_active" }
);

module.exports = mongoose.model("SesameResponsibility", sesameResponsibilitySchema);