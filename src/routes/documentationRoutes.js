const express = require('express');
const router = express.Router()
const { tokenValid } = require('../controllers/authController');
const { getDocumentation, getDocumentationUnified, getDocumentationProgramDispositive, addProgramOrDispositiveToDocumentation, syncProgramDocsToDevices } = require('../controllers/indexController');



router.post("/documentation", tokenValid, getDocumentation);
router.post("/getdocumentationunified", tokenValid,getDocumentationUnified),
router.post("/getDocumentationProgramDispositive", tokenValid, getDocumentationProgramDispositive)
router.post('/addprogramordispositivetodocumentation', tokenValid, addProgramOrDispositiveToDocumentation)
router.post('/syncprogramdocs', tokenValid, syncProgramDocsToDevices)

module.exports = router;