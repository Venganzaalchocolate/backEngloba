const express = require('express');
const router = express.Router()
const { getEnums, tokenValid, putEnums, postEnums, deleteEnums, deleteFileEnums, postSubcategory, deleteSubcategory, getEnumEmployers } = require('../controllers/indexController');
const multer = require('multer');

// Multer en memoria (CV, FileDrive)
const uploadMem = multer({ storage: multer.memoryStorage() });
router.get('/infodata', getEnums)
router.get('/infodataemployer', getEnumEmployers)
router.put('/changedata', tokenValid, uploadMem.single('file'), putEnums)
router.post('/createdata', tokenValid, uploadMem.single('file'), postEnums)
router.delete('/deletedata', tokenValid, deleteEnums)
router.delete('/deletesubdata', tokenValid, deleteSubcategory)
router.post('/createsubcategory', tokenValid, postSubcategory)
router.delete('/deletefileenums', tokenValid, deleteFileEnums)

module.exports = router;