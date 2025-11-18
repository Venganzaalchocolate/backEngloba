const express = require('express');
const router = express.Router()
const { tokenValid, auditInfoUsers, auditInfoPrograms, auditInfoDevices, auditActiveLeaves, } = require('../controllers/indexController')



// ================================
//      AUDITORÍA — INFORMACIÓN
// ================================
router.post('/auditinfouser', tokenValid, auditInfoUsers);
router.post('/auditinfoprogram', tokenValid, auditInfoPrograms);
router.post('/auditinfodevice', tokenValid, auditInfoDevices);
router.post('/auditactiveleaves', tokenValid, auditActiveLeaves)

// router.post('/auditdocumentuser', tokenValid, auditMissingFieldsDocumentationUser)
// router.post('/auditdocumentprogram', tokenValid, auditMissingFieldsDocumentationProgram)
// router.post('/auditdocumentdevice', tokenValid, auditMissingFieldsDocumentationDevice)
// router.post('/audituserperiod', tokenValid, auditMissingFieldsContractAndLeave)


module.exports = router;