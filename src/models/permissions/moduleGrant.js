// models/ModuleGrant.js
// ============================================================
// ✅ ModuleGrant (Permisos por MÓDULO = carpetas/componentes del FRONT)
// ------------------------------------------------------------
// En nuestra app, los "módulos" son literalmente los bloques principales del front
// (las carpetas de /components). Por tanto, el campo `module` usa esas mismas claves.
//
// Objetivo:
// - Dar acceso a usuarios concretos a un módulo, sin necesidad de hacerlos "global"
//   ni responsables/coordinadores de recursos.
// - Controlar acciones dentro del módulo (leer / gestionar / exportar / etc).
//
// Importante:
// - Esto SOLO es "puede entrar y usar el módulo" (y qué acciones).
// - El alcance por programas/dispositivos/provincias se resuelve en otro modelo
//   (ResourceMembership), porque es otra dimensión del problema.
// ============================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

// Acciones estándar (ajústalas si necesitas más granularidad)
const MODULE_ACTIONS = ["read", "manage", "approve", "reject", "export", "delete", "*"];

// Módulos = carpetas de /components (según tu captura)
// Si mañana se añade una carpeta nueva, se añade aquí y listo.
// ⚠️ Recomendación: mantener estas claves en minúsculas y sin espacios.
const FRONT_MODULES = [
  "audits",
  "cv",
  "employer",
  "jobs",
  "lists",
  "myself",
  "offerJobs",
  "payroll",
  "programsanddispositives",
  "root",
  "social",
  "volunteer",
  "workspace",
];

const ModuleGrantSchema = new Schema(
  {
    // Usuario al que damos acceso a un módulo
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Módulo del front (carpeta /components)
    module: {
      type: String,
      required: true,
      index: true,
      enum: FRONT_MODULES,
    },

    // Acciones permitidas dentro del módulo:
    // - read: puede ver/listar/consultar
    // - manage: puede crear/editar/cambiar estados
    // - approve/reject: para flujos tipo solicitudes (si aplica)
    // - export: exportar a Excel, descargar listados, etc.
    // - delete: borrar (si existe esa acción)
    // - "*": comodín (equivale a todas las acciones)
    actions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.every((a) => MODULE_ACTIONS.includes(a)),
        message: "Acciones inválidas en ModuleGrant.actions",
      },
    },

    // Permite activar/desactivar sin borrar (muy útil para accesos temporales)
    active: { type: Boolean, default: true, index: true },

    // Caducidad opcional (sustituciones, apoyos puntuales, etc.)
    expiresAt: { type: Date, default: null, index: true },

    // Nota interna: por qué se dio el permiso
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Normalmente tiene sentido que por usuario+módulo haya 1 grant.
// Si quieres “varios grants por módulo” (raro), quita el unique.
ModuleGrantSchema.index({ userId: 1, module: 1 }, { unique: true });

// Para sacar rápidamente "quién tiene acceso a X"
ModuleGrantSchema.index({ module: 1, active: 1 });

module.exports = mongoose.model("ModuleGrant", ModuleGrantSchema);
