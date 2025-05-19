const express = require('express');
const router = express.Router();


const {
    getPrograms,
    getProgramID,
    postCreateProgram,
    ProgramPut,
    ProgramDeleteId,
    addDispositive,
    getDispositive,
    updateDispositive,
    deleteDispositive,
    tokenValid,
    getDispositiveResponsable,
    handleCoordinators,
    handleResponsibles,
    listsResponsiblesAndCoordinators,
} = require('../controllers/indexController');

// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rutas para Programas
router.get("/programs", getPrograms);
router.post('/createprogram', tokenValid, postCreateProgram);
router.put('/updateprogram', tokenValid, ProgramPut);
router.delete('/deleteprogram', tokenValid, ProgramDeleteId);

// Rutas para Dispositivos dentro de Programas usando el cuerpo de la solicitud
router.post('/createdispositive', tokenValid, addDispositive); // Añadir un dispositivo a un programa
router.post('/programs/device', tokenValid, getDispositive); // Obtener un dispositivo específico dentro de un programa
router.put('/updatedevice', tokenValid, updateDispositive); // Actualizar un dispositivo específico dentro de un programa
router.delete('/deletedispositive', tokenValid, deleteDispositive); // Eliminar un dispositivo específico dentro de un programa
router.post('/dispositiveresponsable', getDispositiveResponsable);
router.post('/coordinators', tokenValid, handleCoordinators);
router.post('/responsibles', tokenValid, handleResponsibles);
router.post('/listsresponsiblesprogram', tokenValid, listsResponsiblesAndCoordinators)
// router.post("/fileProgram", tokenValid, upload.single('pdf'), filesProgram)

module.exports = router;
