
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const multer = require('multer');

// Configura `multer` para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/googlenotificationchange", urlencodedParser)


module.exports = router;