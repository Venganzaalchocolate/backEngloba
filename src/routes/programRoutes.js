const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const {crearProgrmasPrueba, getPrograms, tokenValid} = require('../controllers/indexController');


router.get("/crearprogramasprueba",urlencodedParser, crearProgrmasPrueba);
router.get("/programs",urlencodedParser,tokenValid, getPrograms);



module.exports = router;