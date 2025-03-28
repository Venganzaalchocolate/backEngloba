
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const multer = require('multer');
const { uploadFile, postUploadFile, getFile, tokenValid, deleteIdFile, tokenValidAdmin, createFileDrive, deleteFileDrive, updateFileDrive, getFileDrive} = require('../controllers/indexController');

// Configura `multer` para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/uploadcv", upload.single('file'),  postUploadFile)
router.post('/getfile', tokenValid, getFile)
router.delete('/deletefilecv', tokenValidAdmin, deleteIdFile)

router.post('/crfilemodel', tokenValid, upload.single('file'), createFileDrive)
router.post('/dlfilemodel', tokenValid, upload.single('file'), deleteFileDrive)
router.post('/upfilemodel', tokenValid, upload.single('file'), updateFileDrive)
router.post('/getfiledrive', tokenValid, getFileDrive)


module.exports = router;