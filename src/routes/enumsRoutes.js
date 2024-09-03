const express = require('express');
const router = express.Router()

const bodyParser = require('body-parser');
const { getEnums, tokenValid, putEnums, postEnums, deleteEnums } = require('../controllers/indexController');
const { postSubcategory, deleteSubcategory, getEnumEmployers } = require('../controllers/enumsController');
const urlencodedParser = bodyParser.urlencoded({ extended: false })

router.get('/infodata', urlencodedParser, getEnums)
router.get('/infodataemployer', urlencodedParser, getEnumEmployers)
router.put('/changedata', urlencodedParser, tokenValid, putEnums)
router.post('/createdata', urlencodedParser, tokenValid, postEnums)
router.delete('/deletedata', urlencodedParser, tokenValid, deleteEnums)
router.delete('/deletesubdata', urlencodedParser, tokenValid, deleteSubcategory)
router.post('/createsubcategory', urlencodedParser, tokenValid, postSubcategory)

module.exports = router;