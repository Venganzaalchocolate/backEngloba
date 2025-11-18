const express = require('express');
const router = express.Router()
// Controlador específico de Hiring (ESM, default export con métodos)
const {createHiring,updateHiring,closeHiring,softDeleteHiring,hardDeleteHiring,listHirings,getHiringById,tokenValid, getLastHiringForUser, relocateHirings} = require('../controllers/indexController')



/**
 * Todas las rutas reciben datos por body:
 *  - createHiring:   { idUser, position, device, workShift:{type, nota?}, startDate, endDate?, category?, selectionProcess?, active?, reason?{dni?} }
 *  - updateHiring:   { hiringId, ...patch }
 *  - closeHiring:    { hiringId, endDate?, active? }
 *  - softDelete:     { hiringId }
 *  - hardDelete:     { hiringId }
 *  - listHirings:    { userId?, device?, position?, category?, openOnly?, active?, dateFrom?, dateTo?, page?, limit? }
 *  - getHiringById:  { hiringId }
 */

// Crear un periodo de contratación
router.post('/hiringcreate', tokenValid, createHiring);

// Actualizar (patch) un periodo de contratación existente
router.post('/hiringupdate', tokenValid, updateHiring);

// Cerrar un periodo (set endDate y opcionalmente active=false)
router.post('/hiringclose', tokenValid, closeHiring);

// Baja lógica (active=false)
router.post('/hiringsoftdelete', tokenValid, softDeleteHiring);

// Baja física (borra Period y sus Leaves asociados)
router.post('/hiringharddelete', tokenValid, hardDeleteHiring);

// Listado con filtros y paginación
router.post('/hiringlist', tokenValid, listHirings);

// Obtener un periodo por ID
router.post('/hiringget', tokenValid, getHiringById);

router.post('/lasthiringforuser', tokenValid, getLastHiringForUser);

router.post('/relocatehirings', tokenValid, relocateHirings);

module.exports = router;
