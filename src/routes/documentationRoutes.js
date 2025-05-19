const express = require('express');
const router = express.Router()
const { tokenValid } = require('../controllers/authController');
const { getDocumentation } = require('../controllers/documentationController');



router.post("/documentation", tokenValid, getDocumentation);

module.exports = router;