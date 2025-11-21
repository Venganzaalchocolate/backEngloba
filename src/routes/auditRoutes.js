const express = require('express');
const router = express.Router()
const { tokenValid, auditInfoUsers, auditInfoPrograms, auditInfoDevices, auditActiveLeaves, auditDocsProgram,auditDocsDispo, auditPayrolls } = require('../controllers/indexController')



// ================================
//      AUDITORÍA — INFORMACIÓN
// ================================
router.post('/auditinfouser', tokenValid, auditInfoUsers);
router.post('/auditinfoprogram', tokenValid, auditInfoPrograms);
router.post('/auditinfodevice', tokenValid, auditInfoDevices);
router.post('/auditactiveleaves', tokenValid, auditActiveLeaves)
router.post('/auditdocsprogram', tokenValid, auditDocsProgram)
router.post('/auditdocsdispo', tokenValid, auditDocsDispo)
router.post('/auditpayrolls', tokenValid, auditPayrolls)



// router.post('/auditdocumentuser', tokenValid, auditMissingFieldsDocumentationUser)

// router.post('/audituserperiod', tokenValid, auditMissingFieldsContractAndLeave)


module.exports = router;