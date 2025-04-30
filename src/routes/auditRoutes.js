const express = require('express');
const router = express.Router()
const {auditMissingFieldsInfoUser, tokenValid, auditMissingFieldsProgram} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.post("/auditinfouser", urlencodedParser, tokenValid, auditMissingFieldsInfoUser)
router.post("/auditinfoprogram", urlencodedParser, tokenValid, auditMissingFieldsProgram)


module.exports = router;