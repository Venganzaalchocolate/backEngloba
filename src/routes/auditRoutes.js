const express = require('express');
const router = express.Router()
const {auditMissingFieldsContractAndLeave, auditMissingFieldsInfoUser, tokenValid, auditMissingFieldsProgram, auditMissingFieldsDevice, auditMissingFieldsDocumentationUser, auditMissingFieldsDocumentationProgram, auditMissingFieldsDocumentationDevice} = require('../controllers/indexController')


router.post("/auditinfouser", tokenValid, auditMissingFieldsInfoUser)
router.post("/auditinfoprogram", tokenValid, auditMissingFieldsProgram)
router.post("/auditinfodevice", tokenValid, auditMissingFieldsDevice)
router.post('/auditdocumentuser', tokenValid, auditMissingFieldsDocumentationUser)
router.post('/auditdocumentprogram', tokenValid, auditMissingFieldsDocumentationProgram)
router.post('/auditdocumentdevice', tokenValid, auditMissingFieldsDocumentationDevice)
router.post('/audituserperiod', tokenValid, auditMissingFieldsContractAndLeave)


module.exports = router;