const express = require('express');
const router = express.Router()
const {auditMissingFieldsInfoUser, tokenValid, auditMissingFieldsProgram, auditMissingFieldsDevice, auditMissingFieldsDocumentationUser, auditMissingFieldsDocumentationProgram, auditMissingFieldsDocumentationDevice} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.post("/auditinfouser", urlencodedParser, tokenValid, auditMissingFieldsInfoUser)
router.post("/auditinfoprogram", urlencodedParser, tokenValid, auditMissingFieldsProgram)
router.post("/auditinfodevice", urlencodedParser, tokenValid, auditMissingFieldsDevice)
router.post('/auditdocumentuser', urlencodedParser, tokenValid, auditMissingFieldsDocumentationUser)
router.post('/auditdocumentprogram', urlencodedParser, tokenValid, auditMissingFieldsDocumentationProgram)
router.post('/auditdocumentdevice', urlencodedParser, tokenValid, auditMissingFieldsDocumentationDevice)


module.exports = router;