const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const { tokenValid } = require('../controllers/authController');
const { getDocumentation } = require('../controllers/documentationController');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.post("/documentation", urlencodedParser, tokenValid, getDocumentation);

module.exports = router;