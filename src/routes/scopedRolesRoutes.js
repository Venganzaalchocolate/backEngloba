const express = require('express');
const router = express.Router();

const {
  tokenValid,
  handleScopedRole,
  listScopedRoles,
  getUserScopedRoles,
  getOrganizationChart,
  createScopedRoleRule,
  listScopedRoleRules,
  updateScopedRoleRule,
  deleteScopedRoleRule
} = require('../controllers/indexController');

// Scoped roles directos
router.post('/scopedrole', tokenValid, handleScopedRole);
router.post('/listscopedroles', tokenValid, listScopedRoles);
router.post('/userscopedroles', tokenValid, getUserScopedRoles);

// Scoped role rules
router.post('/scopedrolerulecreate', tokenValid, createScopedRoleRule);
router.post('/scopedrolerulelist', tokenValid, listScopedRoleRules);
router.post('/scopedroleruleupdate', tokenValid, updateScopedRoleRule);
router.post('/scopedroleruledelete', tokenValid, deleteScopedRoleRule);

// Organigrama
router.post('/organizationchart', tokenValid, getOrganizationChart);

module.exports = router;