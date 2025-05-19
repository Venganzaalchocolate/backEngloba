const express = require('express');
const router = express.Router()
const { getEnums, tokenValid, putEnums, postEnums, deleteEnums } = require('../controllers/indexController');
const { postSubcategory, deleteSubcategory, getEnumEmployers } = require('../controllers/enumsController');

router.get('/infodata', getEnums)
router.get('/infodataemployer', getEnumEmployers)
router.put('/changedata', tokenValid, putEnums)
router.post('/createdata', tokenValid, postEnums)
router.delete('/deletedata', tokenValid, deleteEnums)
router.delete('/deletesubdata', tokenValid, deleteSubcategory)
router.post('/createsubcategory', tokenValid, postSubcategory)

module.exports = router;