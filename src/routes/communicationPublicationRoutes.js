const express = require("express");
const router = express.Router();

const {
  tokenValid,
  getWordpressPosts,
  getInstagramMedia,
  getCommunicationConnections,
  postCreateCommunicationPublication,
  getCommunicationPublications,
  getCommunicationPublicationById,
  postUpdateCommunicationPublication,
  postDeleteCommunicationPublication,
} = require("../controllers/indexController");

router.post("/communicationconnections", tokenValid, getCommunicationConnections);
router.post("/communicationwordpressposts",tokenValid, getWordpressPosts);
router.post("/communicationinstagrammedia",tokenValid,getInstagramMedia);
router.post( "/communicationpublicationcreate",tokenValid, postCreateCommunicationPublication);
router.post("/communicationpublications",tokenValid,getCommunicationPublications);
router.post("/communicationpublication",tokenValid,getCommunicationPublicationById);
router.post("/communicationpublicationupdate",tokenValid,postUpdateCommunicationPublication);
router.post("/communicationpublicationdelete",tokenValid,postDeleteCommunicationPublication);

module.exports = router;