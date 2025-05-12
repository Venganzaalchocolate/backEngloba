const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false });

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
router.get("/programs", urlencodedParser, getPrograms);
router.post('/createprogram', urlencodedParser, tokenValid, postCreateProgram);
router.put('/updateprogram', urlencodedParser, tokenValid, ProgramPut);
router.delete('/deleteprogram', urlencodedParser, tokenValid, ProgramDeleteId);

// Rutas para Dispositivos dentro de Programas usando el cuerpo de la solicitud
router.post('/createdispositive', urlencodedParser, tokenValid, addDispositive); // Añadir un dispositivo a un programa
router.post('/programs/device', urlencodedParser, tokenValid, getDispositive); // Obtener un dispositivo específico dentro de un programa
router.put('/updatedevice', urlencodedParser, tokenValid, updateDispositive); // Actualizar un dispositivo específico dentro de un programa
router.delete('/deletedispositive', urlencodedParser, tokenValid, deleteDispositive); // Eliminar un dispositivo específico dentro de un programa
router.post('/dispositiveresponsable', urlencodedParser, getDispositiveResponsable);
router.post('/coordinators', urlencodedParser, tokenValid, handleCoordinators);
router.post('/responsibles', urlencodedParser, tokenValid, handleResponsibles);
router.post('/listsresponsiblesprogram', urlencodedParser, tokenValid, listsResponsiblesAndCoordinators)
// router.post("/fileProgram", tokenValid, upload.single('pdf'), filesProgram)

module.exports = router;
