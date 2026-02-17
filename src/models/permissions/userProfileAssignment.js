// models/UserProfileAssignment.js
// ============================================================================
// ✅ UserProfileAssignment = asignación de perfiles a usuarios
// ----------------------------------------------------------------------------
// ¿Para qué sirve?
// - Relación N:M usuario <-> perfil.
// - Permite bulk fácil (asignar perfil a todos los miembros de un dispositivo).
// - Permite caducidad (expiresAt) y desactivar (active) sin perder histórico.
// - Es la "fuente de verdad" de qué perfiles tiene un usuario.
// ----------------------------------------------------------------------------
// Flujo típico:
// 1) Admin asigna perfiles (crea/activa assignments)
// 2) Se ejecuta SYNC que materializa permisos en ModuleGrant
// ----------------------------------------------------------------------------
// OJO: esto NO reemplaza ModuleGrant.
// - ModuleGrant sigue siendo el permiso final (lo que consume el front/back).
// - El assignment solo es “cómo gestionamos” esos permisos sin hacerlo a mano.
// ============================================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserProfileAssignmentSchema = new Schema(
  {
    // Usuario al que se le asigna el perfil
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Perfil asignado
    profileId: {
      type: Schema.Types.ObjectId,
      ref: "PermissionProfile",
      required: true,
      index: true,
    },

    // Activo/inactivo (desactivar sin borrar)
    active: { type: Boolean, default: true },

    // Caducidad (opcional).
    // - null => no caduca
    // - Date => deja de considerarse activo cuando pasa la fecha
    expiresAt: { type: Date, default: null },

    // Nota interna: quién lo pidió, por qué, ticket, etc.
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Evita duplicar el mismo perfil en el mismo usuario.
// Si intentas asignarlo dos veces, en vez de crear otro, haces upsert/update.
UserProfileAssignmentSchema.index(
  { userId: 1, profileId: 1 },
  { unique: true }
);

// Índices útiles para queries típicas:
// - "dame todos los usuarios con perfil X activos"
// - "dame assignments caducados para limpiar"
UserProfileAssignmentSchema.index({ profileId: 1, active: 1 });
UserProfileAssignmentSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("UserProfileAssignment", UserProfileAssignmentSchema);
