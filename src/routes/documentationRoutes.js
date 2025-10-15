const express = require('express');
const router = express.Router()
const { tokenValid } = require('../controllers/authController');
const { getDocumentation, getDocumentationUnified } = require('../controllers/indexController');



router.post("/documentation", tokenValid, getDocumentation);
router.post("/getdocumentationunified", tokenValid,getDocumentationUnified)

module.exports = router;