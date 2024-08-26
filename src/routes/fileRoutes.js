
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const multer = require('multer');
const { uploadFile, postUploadFile, getFile, tokenValid, deleteIdFile, tokenValidAdmin} = require('../controllers/indexController');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/uploadcv", upload.single('file'),  postUploadFile)
router.post('/getfile', tokenValid, getFile)
router.delete('/deletefilecv', tokenValidAdmin, deleteIdFile)


module.exports = router;