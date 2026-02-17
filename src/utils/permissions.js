// constants/permissions.js
// ============================================================================
// Enums centralizados de permisos
// ----------------------------------------------------------------------------
// Lo centralizo para evitar:
// - strings mágicos en 20 controladores
// - typos ("offerJobs" vs "offerjobs")
// - duplicación de lógica en front/back
//
// Si mañana añadimos un módulo nuevo (carpeta nueva en /components),
// se añade aquí y ya.
// ============================================================================

module.exports = {
  // Estos módulos son EXACTAMENTE las carpetas de /components del front.
  // Es una decisión consciente: el módulo de permisos se alinea con la UI real.
  FRONT_MODULES: [
    "audits",
    "cv",
    "employer",
    "globals",
    "jobs",
    "lists",
    "myself",
    "offerJobs",
    "payroll",
    "programsanddispositives",
    "root",
    "social",
    "styles",
    "volunteer",
    "workspace",
  ],

  // Acciones estándar por módulo.
  // "*" significa "todas las acciones".
  // (Si en el futuro queremos acciones más finas por módulo, se puede ampliar.)
  MODULE_ACTIONS: ["read", "manage", "approve", "reject", "export", "delete", "*"],

  // Tipos de recursos que vamos a controlar con responsabilidades:
  // program/dispositive están claros; province/area son para scoping más amplio.
  RESOURCE_TYPES: ["program", "dispositive", "province", "area"],

  // Roles dentro del recurso.
  // Jerarquía típica: responsable > coordinator > viewer
  RESOURCE_ROLES: ["responsable", "coordinator", "viewer"],

  PRESETS : {
  rrhh: {
    moduleGrants: [
      { module: "employer", actions: ["read", "manage", "export"] },
      { module: "payroll", actions: ["read", "manage", "export"] },
      { module: "globals", actions: ["read"] },
    ],
    resourceMemberships: [],
  },
  volunteer_manager: {
    moduleGrants: [
      { module: "volunteer", actions: ["read", "manage", "export"] },
      { module: "lists", actions: ["read", "export"] },
    ],
    resourceMemberships: [],
  },
}
};
