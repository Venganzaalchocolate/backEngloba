const express = require('express');
const router = express.Router()
const {
  upsertModuleScopeAccess,
  listModuleScopeAccess,
  updateModuleScopeAccess,
  deleteModuleScopeAccess,
  getUserModuleScopeAccess,
  tokenValid,
} = require("../controllers/indexController");

router.post("/modulescopeaccessupsert", tokenValid, upsertModuleScopeAccess);
router.post("/modulescopeaccesslist", tokenValid, listModuleScopeAccess);
router.post("/modulescopeaccessupdate", tokenValid, updateModuleScopeAccess);
router.post("/modulescopeaccessdelete", tokenValid, deleteModuleScopeAccess);
router.post("/modulescopeaccessgetuser", tokenValid, getUserModuleScopeAccess);

module.exports = router;