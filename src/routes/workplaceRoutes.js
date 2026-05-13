// routes/workplaceRoutes.js
const express = require('express');
const router = express.Router();

const {
  tokenValid,
  createWorkplace,
  listWorkplaces,
  getWorkplaceId,
  updateWorkplace,
  deleteWorkplace,
  addWorkplaceToDispositive,
  removeWorkplaceFromDispositive,
  listDispositivesByWorkplace,
} = require('../controllers/indexController');

// CRUD centros de trabajo
router.post('/workplacecreate', tokenValid, createWorkplace);
router.post('/workplacelist', tokenValid, listWorkplaces);
router.post('/workplaceget', tokenValid, getWorkplaceId);
router.post('/workplaceupdate', tokenValid, updateWorkplace);
router.post('/workplacedelete', tokenValid, deleteWorkplace);

// Relación centros de trabajo - dispositivos
router.post('/workplaceaddtodispositive', tokenValid, addWorkplaceToDispositive);
router.post('/workplaceremovefromdispositive', tokenValid, removeWorkplaceFromDispositive);
router.post('/workplacedispositives', tokenValid, listDispositivesByWorkplace);

module.exports = router;