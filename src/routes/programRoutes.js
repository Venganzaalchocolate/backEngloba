const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const {crearProgrmasPrueba, getPrograms, tokenValid, postCreateProgram} = require('../controllers/indexController');


router.get("/crearprogramasprueba",urlencodedParser, crearProgrmasPrueba);
router.get("/programs",urlencodedParser, getPrograms);
router.post('/createprogram', urlencodedParser, tokenValid, postCreateProgram);



module.exports = router;