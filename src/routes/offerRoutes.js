const express = require('express');
const router = express.Router()
const {getOfferJobs, getOfferJobID, postCreateOfferJob, OfferJobDeleteId, OfferJobPut, tokenValid, tokenValidAdmin} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.get("/offerjobs", urlencodedParser, getOfferJobs)
router.post("/offerjob", urlencodedParser, getOfferJobID)
router.post("/createofferjob", urlencodedParser,postCreateOfferJob)
router.delete("/deleteofferjob/:id", urlencodedParser, tokenValidAdmin,OfferJobDeleteId)
router.put("/modifyofferjob", urlencodedParser, OfferJobPut)


module.exports = router;