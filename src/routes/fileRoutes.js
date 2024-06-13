const { postUploadFile } = require("../controllers/indexController");
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post("/uploadfile", upload.single('file'), postUploadFile)


module.exports = router;