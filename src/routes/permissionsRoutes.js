// routes/permissionsRoutes.js
// ============================================================================
// RUTAS ADMIN para gestión de permisos
// ----------------------------------------------------------------------------
// Incluye:
// 1) ModuleGrant (permisos por módulo)
// 2) ResourceMembership (scoping por recurso)
// 3) UX: get/set permisos usuario + presets
// 4) Perfiles:
//    - PermissionProfile (plantillas de módulos/acciones)
//    - UserProfileAssignment (asignación de perfiles a usuarios)
//    - Sync perfiles -> ModuleGrant
//    - Bulk: aplicar perfil a miembros de un recurso
// ============================================================================

const express = require("express");
const router = express.Router();

// Middleware auth (valida token y mete req.user)
const { tokenValid } = require("../controllers/indexController");

// Todo lo demás lo sacamos del index (para que routes nunca “salte” de un sitio a otro)
const {
  // ModuleGrant
  listModuleGrants,
  getModuleGrantById,
  upsertModuleGrant,
  updateModuleGrant,
  toggleModuleGrant,
  deleteModuleGrant,

  // ResourceMembership
  listResourceMemberships,
  getResourceMembershipById,
  upsertResourceMembership,
  updateResourceMembership,
  toggleResourceMembership,
  deleteResourceMembership,

  // UX usuario
  getUserPermissions,
  setUserPermissions,
  applyPermissionsPreset,

  // Profiles
  listPermissionProfiles,
  getPermissionProfileById,
  createPermissionProfile,
  updatePermissionProfile,
  togglePermissionProfile,
  deletePermissionProfile,

  // Assignments
  listUserProfileAssignments,
  upsertUserProfileAssignment,
  updateUserProfileAssignment,
  deleteUserProfileAssignment,

  // Sync / Bulk
  syncUserProfiles,
  applyProfileToResourceMembers,
} = require("../controllers/indexController");

// ============================================================================
// MODULE GRANT
// ============================================================================
router.post("/modulegrant/list", tokenValid, listModuleGrants);
router.post("/modulegrant/get", tokenValid, getModuleGrantById);
router.post("/modulegrant/upsert", tokenValid, upsertModuleGrant);
router.post("/modulegrant/update", tokenValid, updateModuleGrant);
router.post("/modulegrant/toggle", tokenValid, toggleModuleGrant);
router.post("/modulegrant/delete", tokenValid, deleteModuleGrant);

// ============================================================================
// RESOURCE MEMBERSHIP
// ============================================================================
router.post("/resourcemembership/list", tokenValid, listResourceMemberships);
router.post("/resourcemembership/get", tokenValid, getResourceMembershipById);
router.post("/resourcemembership/upsert", tokenValid, upsertResourceMembership);
router.post("/resourcemembership/update", tokenValid, updateResourceMembership);
router.post("/resourcemembership/toggle", tokenValid, toggleResourceMembership);
router.post("/resourcemembership/delete", tokenValid, deleteResourceMembership);

// ============================================================================
// UX USUARIO (en bloque)
// ============================================================================
router.post("/user/getpermissions", tokenValid, getUserPermissions);
router.post("/user/setpermissions", tokenValid, setUserPermissions);
router.post("/user/applypreset", tokenValid, applyPermissionsPreset);

// ============================================================================
// PERFILES (PermissionProfile)
// ============================================================================
router.post("/profile/list", tokenValid, listPermissionProfiles);
router.post("/profile/get", tokenValid, getPermissionProfileById);
router.post("/profile/create", tokenValid, createPermissionProfile);
router.post("/profile/update", tokenValid, updatePermissionProfile);
router.post("/profile/toggle", tokenValid, togglePermissionProfile);
router.post("/profile/delete", tokenValid, deletePermissionProfile);

// ============================================================================
// ASIGNACIONES (UserProfileAssignment)
// ============================================================================
router.post("/assignment/list", tokenValid, listUserProfileAssignments);
router.post("/assignment/upsert", tokenValid, upsertUserProfileAssignment);
router.post("/assignment/update", tokenValid, updateUserProfileAssignment);
router.post("/assignment/delete", tokenValid, deleteUserProfileAssignment);

// ============================================================================
// SYNC / BULK
// ============================================================================
router.post("/sync/userprofiles", tokenValid, syncUserProfiles);
router.post("/bulk/applyprofiletoresourcemembers", tokenValid, applyProfileToResourceMembers);

module.exports = router;
