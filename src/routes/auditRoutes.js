const express = require('express');
const router = express.Router()
const {auditMissingFieldsInfoUser, tokenValid, auditMissingFieldsProgram, auditMissingFieldsDevice, auditMissingFieldsDocumentationUser} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.post("/auditinfouser", urlencodedParser, tokenValid, auditMissingFieldsInfoUser)
router.post("/auditinfoprogram", urlencodedParser, tokenValid, auditMissingFieldsProgram)
router.post("/auditinfodevice", urlencodedParser, tokenValid, auditMissingFieldsDevice)
router.post('/auditdocumentuser', urlencodedParser, tokenValid, auditMissingFieldsDocumentationUser)


module.exports = router;