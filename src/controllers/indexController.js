// controllers/indexController.js
// ============================================================================
// Export centralizado de controladores (tu estilo: routes importan desde index)
// ============================================================================

// ----------------------------- USERS / EMPLOYEES ----------------------------
const {
  recreateCorporateEmail,
  postCreateUser,
  getUserID,
  getUsers,
  UserDeleteId,
  userPut,
  getUsersFilter,
  payroll,
  getFileUser,
  getUserName,
  getAllUsersWithOpenPeriods,
  rehireUser,
  getUsersCurrentStatus,
  getBasicUserSearch,
  getUserListDays,
  getPhotoProfile,
  profilePhotoSet,
  profilePhotoGetBatch,
} = require("./userController");

// ----------------------------- LOGIN ----------------------------------------
const { login, validToken, verifyCode } = require("./loginController");

// ----------------------------- AUTH (MIDDLEWARES) ---------------------------
const { tokenValid, tokenValidAdmin } = require("./authController");

// ----------------------------- USER CVS -------------------------------------
const {
  getUserCvsFilter,
  postCreateUserCv,
  getUsersCvsIDs,
  getUserCvs,
  UserCvDeleteId,
  UserCvPut,
  getUserCvID,
} = require("./userCvController");

// ----------------------------- OVH ------------------------------------------
const {
  uploadFile,
  listBucketContents,
  getFileCv,
  deleteFile,
  getPresignedPut,
  getPresignedGet,
} = require("./ovhController");

// ----------------------------- FILEDRIVE / FILES ----------------------------
const {
  postUploadFile,
  getFile,
  deleteIdFile,
  createFileDrive,
  updateFileDrive,
  deleteFileDrive,
  getFileDrive,
  getCvPresignPut,
  getCvPresignGet,
  zipMultipleFiles,
  zipPayrolls,
  listFile,
} = require("./fileController");

// ----------------------------- BAGS -----------------------------------------
const {
  postCreateBag,
  getBags,
  getBagID,
  bagDeactivateId,
  BagPut,
  getBagsFilter,
  BagPutDeleteUser,
} = require("./bagController");

// ----------------------------- OFFERS ---------------------------------------
const {
  offerList,
  offerCreate,
  offerUpdate,
  offerHardDelete,
  offerId,
} = require("./offerController");

// ----------------------------- ENUMS ----------------------------------------
const {
  getEnums,
  putEnums,
  postEnums,
  deleteEnums,
  deleteSubcategory,
  getEnumEmployers,
  deleteFileEnums,
  postSubcategory,
} = require("./enumsController");

// ----------------------------- EMAIL ----------------------------------------
const { sendEmail, generateEmailHTML, sendWelcomeEmail } = require("./emailControllerGoogle");

// ----------------------------- DOCUMENTATION --------------------------------
const {
  getDocumentation,
  getDocumentationUnified,
  getDocumentationProgramDispositive,
  addProgramOrDispositiveToDocumentation,
  syncProgramDocsToDevices,
} = require("./documentationController");

// ----------------------------- PDF SIGN -------------------------------------
const { confirmSignature, requestSignature } = require("./pdfSignController");

// ----------------------------- AUDITS ---------------------------------------
const {
  auditInfoDevices,
  auditInfoPrograms,
  auditInfoUsers,
  auditActiveLeaves,
  auditDocsProgram,
  auditDocsDispo,
  auditPayrolls,
  auditDocsUser,
} = require("./auditorController");

// ----------------------------- STATS ----------------------------------------
const { getCurrentHeadcountStats, getUserCvStats } = require("./statisticsController");

// ----------------------------- WORKSPACE ------------------------------------
const {
  addGroupAliasWS,
  deleteGroupAliasWS,
  deleteGroupWS,
  deleteMemberGroupWS,
  addGroupWS,
  createGroupWS,
  infoGroupWS,
  addUserToGroup,
  createUserWS,
  deleteUserByEmailWS,
  deleteMemeberAllGroups,
  deleteDeviceGroupsWS,
  getModelWorkspaceGroups,
  moveUserBetweenDevicesWS,
} = require("./workspaceController");

// ----------------------------- PREFERENTS -----------------------------------
const {
  getPreferents,
  getPreferentById,
  createPreferent,
  updatePreferent,
  deletePreferent,
  filterPreferents,
} = require("./preferentsController");

// ----------------------------- LEAVES ---------------------------------------
const {
  createLeave,
  updateLeave,
  closeLeave,
  softDeleteLeave,
  hardDeleteLeave,
  listLeaves,
  getLeaveById,
} = require("./leaveController");

// ----------------------------- HIRINGS --------------------------------------
const {
  createHiring,
  updateHiring,
  closeHiring,
  softDeleteHiring,
  hardDeleteHiring,
  listHirings,
  getHiringById,
  getLastHiringForUser,
  relocateHirings,
} = require("./hiringController");

// ----------------------------- CHANGE REQUESTS ------------------------------
const {
  postCancelChangeRequest,
  postRejectChangeRequest,
  postApproveChangeRequest,
  getPendingChangeRequests,
  getMyChangeRequests,
  postCreateChangeRequest,
  postCreateTimeOffChangeRequest,
} = require("./userChangeRequestController");

// ----------------------------- GOOGLE DRIVE ---------------------------------
const { moveDriveFile, adoptDriveFileIntoFiledrive } = require("./googleController");

// ----------------------------- PROGRAMS -------------------------------------
const {
  getPrograms,
  postCreateProgram,
  getProgramID,
  ProgramPut,
  ProgramDeleteId,
  getProgramId,
} = require("./programController");

// ----------------------------- DISPOSITIVES ---------------------------------
const {
  getDispositiveId,
  createDispositive,
  updateDispositive,
  deleteDispositive,
  handleCoordinators,
  handleResponsibles,
  listsResponsiblesAndCoordinators,
  getDispositiveResponsable,
} = require("./dispositiveController");

// ----------------------------- VOLUNTEER APPLICATIONS -----------------------
const {
  volunteerGetNotLimit,
  enableVolunteerApplication,
  disableVolunteerApplication,
  deleteVolunteerApplication,
  updateVolunteerApplication,
  listVolunteerApplications,
  getVolunteerApplicationById,
  createVolunteerApplication,
  addInternalNote,
  volunteerAddChronology,
  volunteerChronologyUpdate,
  volunteerChronologyDelete,
  setVolunteerInterview,
  deleteInternalNote,
} = require("./volunteerApplicationController");

// ----------------------------- TOOLS SERVICE --------------------------------
const { removeBgProfile512FromBuffer } = require("./toolsServiceController");

// ----------------------------- PERMISSIONS (ADMIN + PROFILES) ---------------
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

  // UX
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
} = require("./permissionsAdminController");

// ============================================================================
// EXPORTS (sin duplicados, sin comas raras)
// ============================================================================
module.exports = {
  // Users
  profilePhotoGetBatch,
  profilePhotoSet,
  getPhotoProfile,
  recreateCorporateEmail,
  getAllUsersWithOpenPeriods,
  postCreateUser,
  getUserID,
  getUsers,
  UserDeleteId,
  userPut,
  getUsersFilter,
  rehireUser,
  getUsersCurrentStatus,
  getUserListDays,
  payroll,
  getFileUser,
  getUserName,
  getBasicUserSearch,

  // Login/Auth
  login,
  validToken,
  verifyCode,
  tokenValid,
  tokenValidAdmin,

  // UserCV
  getUserCvsFilter,
  postCreateUserCv,
  getUsersCvsIDs,
  getUserCvs,
  UserCvDeleteId,
  UserCvPut,
  getUserCvID,

  // Files / OVH
  listFile,
  createFileDrive,
  updateFileDrive,
  deleteFileDrive,
  postUploadFile,
  getFileDrive,
  getFile,
  deleteIdFile,
  uploadFile,
  listBucketContents,
  getFileCv,
  deleteFile,
  getPresignedPut,
  getPresignedGet,
  getCvPresignPut,
  getCvPresignGet,
  zipPayrolls,
  zipMultipleFiles,
  moveDriveFile,
  adoptDriveFileIntoFiledrive,

  // Bags
  postCreateBag,
  getBags,
  getBagID,
  bagDeactivateId,
  BagPut,
  getBagsFilter,
  BagPutDeleteUser,

  // Programs / Devices
  getPrograms,
  postCreateProgram,
  getProgramID,
  ProgramPut,
  ProgramDeleteId,
  getProgramId,

  getDispositiveId,
  createDispositive,
  updateDispositive,
  deleteDispositive,
  handleCoordinators,
  handleResponsibles,
  listsResponsiblesAndCoordinators,
  getDispositiveResponsable,

  // Offers
  offerList,
  offerCreate,
  offerUpdate,
  offerHardDelete,
  offerId,

  // Enums
  getEnums,
  putEnums,
  postEnums,
  deleteEnums,
  deleteSubcategory,
  getEnumEmployers,
  deleteFileEnums,
  postSubcategory,

  // Email
  sendEmail,
  generateEmailHTML,
  sendWelcomeEmail,

  // Docs
  getDocumentation,
  getDocumentationUnified,
  getDocumentationProgramDispositive,
  addProgramOrDispositiveToDocumentation,
  syncProgramDocsToDevices,

  // PDF Sign
  requestSignature,
  confirmSignature,

  // Audits
  auditDocsUser,
  auditInfoUsers,
  auditInfoPrograms,
  auditInfoDevices,
  auditActiveLeaves,
  auditDocsProgram,
  auditDocsDispo,
  auditPayrolls,

  // Stats
  getCurrentHeadcountStats,
  getUserCvStats,

  // Workspace
  addGroupAliasWS,
  deleteGroupAliasWS,
  moveUserBetweenDevicesWS,
  deleteGroupWS,
  deleteMemberGroupWS,
  addGroupWS,
  createGroupWS,
  infoGroupWS,
  addUserToGroup,
  createUserWS,
  deleteUserByEmailWS,
  deleteMemeberAllGroups,
  deleteDeviceGroupsWS,
  getModelWorkspaceGroups,

  // Preferents
  getPreferents,
  getPreferentById,
  createPreferent,
  updatePreferent,
  deletePreferent,
  filterPreferents,

  // Leaves
  createLeave,
  updateLeave,
  closeLeave,
  softDeleteLeave,
  hardDeleteLeave,
  listLeaves,
  getLeaveById,

  // Hirings
  createHiring,
  updateHiring,
  closeHiring,
  softDeleteHiring,
  hardDeleteHiring,
  listHirings,
  getHiringById,
  getLastHiringForUser,
  relocateHirings,

  // Change Requests
  postCreateTimeOffChangeRequest,
  postCreateChangeRequest,
  getMyChangeRequests,
  getPendingChangeRequests,
  postApproveChangeRequest,
  postRejectChangeRequest,
  postCancelChangeRequest,

  // Volunteer Applications
  volunteerGetNotLimit,
  enableVolunteerApplication,
  disableVolunteerApplication,
  deleteInternalNote,
  setVolunteerInterview,
  createVolunteerApplication,
  getVolunteerApplicationById,
  listVolunteerApplications,
  updateVolunteerApplication,
  deleteVolunteerApplication,
  addInternalNote,
  volunteerAddChronology,
  volunteerChronologyUpdate,
  volunteerChronologyDelete,

  // Tools
  removeBgProfile512FromBuffer,

  // Permissions
  listModuleGrants,
  getModuleGrantById,
  upsertModuleGrant,
  updateModuleGrant,
  toggleModuleGrant,
  deleteModuleGrant,

  listResourceMemberships,
  getResourceMembershipById,
  upsertResourceMembership,
  updateResourceMembership,
  toggleResourceMembership,
  deleteResourceMembership,

  getUserPermissions,
  setUserPermissions,
  applyPermissionsPreset,

  listPermissionProfiles,
  getPermissionProfileById,
  createPermissionProfile,
  updatePermissionProfile,
  togglePermissionProfile,
  deletePermissionProfile,

  listUserProfileAssignments,
  upsertUserProfileAssignment,
  updateUserProfileAssignment,
  deleteUserProfileAssignment,

  syncUserProfiles,
  applyProfileToResourceMembers,
};
