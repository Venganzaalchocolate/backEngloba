// routes/leaveRoutes.js
const express = require('express');
const router = express.Router();

const {
  createLeave,
  updateLeave,
  closeLeave,
  softDeleteLeave,
  hardDeleteLeave,
  listLeaves,
  getLeaveById,
  tokenValid,
} = require('../controllers/indexController');

/**
 * Todas las rutas reciben datos por body:
 *  - createLeave:  { idUser, idPeriod, leaveType, startLeaveDate, expectedEndLeaveDate?, actualEndLeaveDate?, active? }
 *  - updateLeave:  { leaveId, ...patch }
 *  - closeLeave:   { leaveId, actualEndLeaveDate?, active? }
 *  - softDelete:   { leaveId }
 *  - hardDelete:   { leaveId }
 *  - listLeaves:   { userId?, periodId?, leaveType?, active?, openOnly?, dateFrom?, dateTo?, page?, limit? }
 *  - getLeaveById: { leaveId }
 */

// Crear una baja/excedencia
router.post('/leavecreate', tokenValid, createLeave);

// Actualizar (patch) una baja/excedencia
router.post('/leaveupdate', tokenValid, updateLeave);

// Cerrar una baja/excedencia (poner actualEndLeaveDate)
router.post('/leaveclose', tokenValid, closeLeave);

// Baja lógica (active=false)
router.post('/leavesoftdelete', tokenValid, softDeleteLeave);

// Baja física (borrado definitivo)
router.post('/leaveharddelete', tokenValid, hardDeleteLeave);

// Listado con filtros y paginación
router.post('/leavelist', tokenValid, listLeaves);

// Obtener una baja por ID
router.post('/leaveget', tokenValid, getLeaveById);

module.exports = router;
