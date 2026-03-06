// routes/permissionsRoutes.js
// ============================================================================
// RUTAS ADMIN permisos (UNIFIED)
// - Profiles (PermissionProfile)
// - Assignments (UserProfileAssignment)
// - UserScopes (UserScope)
// - ScopeProfileLinks (ScopeProfileLink)
// - Sync manual
// ============================================================================

const express = require("express");
const router = express.Router();

const {
  tokenValid,

  // PROFILES
  listProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  toggleProfile,
  deleteProfileHard,

  // ASSIGNMENTS
  listAssignments,
  upsertAssignment,
  updateAssignment,
  deleteAssignmentHard,

  // USER SCOPES
  listUserScopes,
  upsertUserScope,
  updateUserScope,
  deleteUserScopeHard,

  // LINKS (scope -> profile)
  listScopeProfileLinks,
  upsertScopeProfileLink,
  updateScopeProfileLink,
  deleteScopeProfileLinkHard,

  // SYNC
  syncUserNow,
} = require("../controllers/indexController");

// --------------------------------------------------------------------------
// PROFILES
// --------------------------------------------------------------------------
router.post("/profile/list", tokenValid, listProfiles);
router.post("/profile/get", tokenValid, getProfileById);
router.post("/profile/create", tokenValid, createProfile);
router.post("/profile/update", tokenValid, updateProfile);
router.post("/profile/toggle", tokenValid, toggleProfile);
router.post("/profile/delete", tokenValid, deleteProfileHard);

// --------------------------------------------------------------------------
// ASSIGNMENTS (user <-> profile)
// --------------------------------------------------------------------------
router.post("/assignment/list", tokenValid, listAssignments);
router.post("/assignment/upsert", tokenValid, upsertAssignment);
router.post("/assignment/update", tokenValid, updateAssignment);
router.post("/assignment/delete", tokenValid, deleteAssignmentHard);

// --------------------------------------------------------------------------
// USER SCOPES (user scopes)
// --------------------------------------------------------------------------
router.post("/scope/list", tokenValid, listUserScopes);
router.post("/scope/upsert", tokenValid, upsertUserScope);
router.post("/scope/update", tokenValid, updateUserScope);
router.post("/scope/delete", tokenValid, deleteUserScopeHard);

// --------------------------------------------------------------------------
// LINKS (scope -> profile)
// --------------------------------------------------------------------------
router.post("/link/list", tokenValid, listScopeProfileLinks);
router.post("/link/upsert", tokenValid, upsertScopeProfileLink);
router.post("/link/update", tokenValid, updateScopeProfileLink);
router.post("/link/delete", tokenValid, deleteScopeProfileLinkHard);

// --------------------------------------------------------------------------
// SYNC (manual)
// --------------------------------------------------------------------------
router.post("/sync/user", tokenValid, syncUserNow);

module.exports = router;