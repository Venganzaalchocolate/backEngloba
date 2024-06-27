
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const multer = require('multer');
const { uploadFile, listBucketContents, postUploadFile, getFile} = require('../controllers/indexController');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/uploadcv", upload.single('file'),  postUploadFile)
router.post('/getfile', getFile)
router.get('/listar', listBucketContents )


module.exports = router;