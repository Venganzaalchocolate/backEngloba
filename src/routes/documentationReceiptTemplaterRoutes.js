const express = require("express");
const router = express.Router();

const {
  tokenValid,
  listDocumentationReceiptTemplates,
  getDocumentationReceiptTemplateById,
  getDocumentationReceiptTemplateByDocumentation,
  getActiveReceiptQuestionsByDocumentation,
  createDocumentationReceiptTemplate,
  upsertDocumentationReceiptTemplate,
  updateDocumentationReceiptTemplate,
  toggleDocumentationReceiptTemplate,
  deleteDocumentationReceiptTemplate,
  postValidateReceiptAnswers,
  previewReceiptTemplate
} = require("../controllers/indexController");

router.post("/documentationreceipttemplatelist", tokenValid, listDocumentationReceiptTemplates);
router.post("/documentationreceipttemplateget", tokenValid, getDocumentationReceiptTemplateById);
router.post("/documentationreceipttemplategetbydocumentation", tokenValid, getDocumentationReceiptTemplateByDocumentation);
router.post("/documentationreceipttemplategetactivequestions", tokenValid, getActiveReceiptQuestionsByDocumentation);
router.post("/documentationreceipttemplatecreate", tokenValid, createDocumentationReceiptTemplate);
router.post("/documentationreceipttemplateupsert", tokenValid, upsertDocumentationReceiptTemplate);
router.post("/documentationreceipttemplateupdate", tokenValid, updateDocumentationReceiptTemplate);
router.post("/documentationreceipttemplatetoggle", tokenValid, toggleDocumentationReceiptTemplate);
router.post("/documentationreceipttemplatedelete", tokenValid, deleteDocumentationReceiptTemplate);
router.post("/documentationreceipttemplatevalidateanswers", tokenValid, postValidateReceiptAnswers);
router.post("/documentationreceipttemplatepreview", tokenValid, previewReceiptTemplate);

module.exports = router;