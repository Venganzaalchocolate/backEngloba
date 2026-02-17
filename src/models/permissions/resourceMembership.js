// models/ResourceMembership.js
// ============================================================
// ✅ ResourceMembership (Responsabilidad / alcance por RECURSO)
// ------------------------------------------------------------
// Esta es la capa de "quién manda sobre qué" en Programas/Dispositivos/Provincias/Áreas.
// Sirve para filtrar listados y autorizar acciones sobre recursos concretos.
//
// Ejemplo:
// - Usuario A es responsable del Dispositivo D1 -> puede gestionar lo que cuelga de D1
// - Usuario B es coordinator del Dispositivo D1 -> puede gestionar tareas operativas en D1
// - Usuario C es viewer del Programa P2 -> solo lectura de P2
//
// Importante:
// - NO es el acceso al módulo (eso es ModuleGrant + roles globales).
// - Es el alcance dentro del módulo.
// ============================================================

const mongoose = require("mongoose");
const { Schema } = mongoose;

const ResourceMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Tipo de recurso que gobierna el alcance
    resourceType: {
      type: String,
      required: true,
      index: true,
      enum: ["program", "dispositive", "province", "area"],
    },

    // ID del recurso (Program._id, Dispositive._id, Provinces._id, etc.)
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Rol dentro del recurso (jerarquía típica: responsable > coordinator > viewer)
    role: {
      type: String,
      required: true,
      index: true,
      enum: ["responsable", "coordinator", "viewer"],
    },

    active: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: null, index: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Evitar duplicados exactos
ResourceMembershipSchema.index(
  { userId: 1, resourceType: 1, resourceId: 1, role: 1 },
  { unique: true }
);

// Query típica: "dame responsables/coordinadores de este dispositivo"
ResourceMembershipSchema.index(
  { resourceType: 1, resourceId: 1, role: 1, active: 1 }
);

module.exports = mongoose.model("ResourceMembership", ResourceMembershipSchema);
