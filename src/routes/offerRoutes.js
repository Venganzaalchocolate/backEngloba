const express = require('express');
const router = express.Router()
const {getOfferJobs, getOfferJobID, postCreateOfferJob, OfferJobDeleteId, OfferJobPut, tokenValid, tokenValidAdmin} = require('../controllers/indexController')



router.get("/offerjobs", getOfferJobs)
router.post("/offerjob", getOfferJobID)
router.post("/createofferjob",postCreateOfferJob)
router.delete("/deleteofferjob/:id", tokenValidAdmin,OfferJobDeleteId)
router.put("/modifyofferjob", OfferJobPut)


module.exports = router;