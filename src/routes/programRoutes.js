const express = require('express');
const router = express.Router();


const {
    getPrograms,
    postCreateProgram,
    ProgramPut,
    ProgramDeleteId,
    getDispositiveId,
    updateDispositive,
    deleteDispositive,
    tokenValid,
    handleCoordinators,
    handleResponsibles,
    listsResponsiblesAndCoordinators,
    createDispositive,
    getDispositiveResponsable,
    getProgramId
} = require('../controllers/indexController');

// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rutas para Programas
router.get("/programs", getPrograms);
router.post("/program", tokenValid, getProgramId);
router.post('/createprogram', tokenValid, postCreateProgram);
router.put('/updateprogram', tokenValid, ProgramPut);
router.delete('/deleteprogram', tokenValid, ProgramDeleteId);

// Rutas para Dispositivos dentro de Programas usando el cuerpo de la solicitud
router.post('/createdispositive', tokenValid, createDispositive); // Añadir un dispositivo a un programa
router.post('/dispositive', tokenValid, getDispositiveId); // Obtener un dispositivo específico dentro de un programa
router.put('/updatedevice', tokenValid, updateDispositive); // Actualizar un dispositivo específico dentro de un programa
router.delete('/deletedispositive', tokenValid, deleteDispositive); // Eliminar un dispositivo específico dentro de un programa
router.post('/dispositiveresponsable', tokenValid, getDispositiveResponsable);
router.post('/coordinators', tokenValid, handleCoordinators);
router.post('/responsibles', tokenValid, handleResponsibles);
router.post('/listsresponsiblesprogram', tokenValid, listsResponsiblesAndCoordinators)
// router.post("/fileProgram", tokenValid, upload.single('pdf'), filesProgram)

module.exports = router;
