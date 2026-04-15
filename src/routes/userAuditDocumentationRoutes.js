const express = require('express');
const router = express.Router();

const {
  tokenValid,
  getDocumentationAuditByUserAndDocument,
  getDocumentationAuditsByUser,
  postRegisterDocumentationAuditDownload,
  postRegisterDocumentationAuditSignRequest,
  postRegisterDocumentationAuditSignComplete,
  postCanUserSignDocumentationReceipt,
} = require('../controllers/indexController');

router.post("/documentationauditget", tokenValid, getDocumentationAuditByUserAndDocument);
router.post("/documentationaudituserlist", tokenValid, getDocumentationAuditsByUser);
router.post("/documentationauditdownload", tokenValid, postRegisterDocumentationAuditDownload);
router.post("/documentationauditsignrequest", tokenValid, postRegisterDocumentationAuditSignRequest);
router.post("/documentationauditsigncomplete", tokenValid, postRegisterDocumentationAuditSignComplete);
router.post("/documentationauditcansign", tokenValid, postCanUserSignDocumentationReceipt);

module.exports = router;