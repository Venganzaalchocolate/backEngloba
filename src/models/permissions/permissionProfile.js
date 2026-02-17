// models/PermissionProfile.js
// ============================================================================
// ✅ PermissionProfile = "perfil/plantilla" de permisos por MÓDULO (front)
// ----------------------------------------------------------------------------
// ¿Para qué sirve?
// - Evita tener que dar ModuleGrant usuario por usuario cuando hay perfiles típicos
//   (RRHH, Voluntariado, Ofertas, Coordinación, etc.).
// - Un perfil define "qué módulos" y "qué acciones" incluye.
// - NO da permisos por sí mismo: se asigna mediante UserProfileAssignment y luego
//   se materializa (sync) a ModuleGrant.
// ----------------------------------------------------------------------------
// Idea mental:
//   PermissionProfile (plantilla)  +  UserProfileAssignment (asignación)
//                └────────── SYNC ──────────► ModuleGrant (permiso final)
// ============================================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

const ProfileModuleGrantSchema = new Schema(
  {
    // Módulo del front (mismo nombre que la carpeta en /components)
    // Ej: "volunteer", "jobs", "payroll", "programsanddispositives", ...
    module: {
      type: String,
      required: true,
      trim: true,
    },

    // Acciones que habilita dentro de ese módulo.
    // Ej: ["read"] o ["read","manage","export"]
    actions: {
      type: [String],
      default: ["read"],
    },

    // Permite desactivar una línea concreta sin borrar el perfil entero.
    active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const PermissionProfileSchema = new Schema(
  {
    // Activar/desactivar el perfil completo (por si lo “retiramos”)
    active: { type: Boolean, default: true },

    // Nombre único del perfil (lo verá el admin)
    // Ej: "RRHH", "Voluntariado (gestión)", "Ofertas (lectura)", ...
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },

    // Descripción humana (para explicar qué hace el perfil)
    description: { type: String, default: "" },

    // Plantilla de permisos por módulo
    moduleGrants: { type: [ProfileModuleGrantSchema], default: [] },

    // Nota interna (por qué existe, decisiones, etc.)
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Índice útil para listados y búsquedas
PermissionProfileSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model("PermissionProfile", PermissionProfileSchema);
