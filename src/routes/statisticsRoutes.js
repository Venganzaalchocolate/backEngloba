const express = require('express');
const router = express.Router();
const { tokenValid } = require("../controllers/authController");
const { getWorkersPyramid,getWorkersPie,getWorkersHiredEnded,getWorkersWorkShift,getWorkersTenure,getCvOverview, getCvMonthly, getCvDistribution, getCvConversion, auditWorkersStats } = require("../controllers/statisticsController");


router.post("/overview", tokenValid, getCvOverview);
router.post('/cvmonthly', tokenValid, getCvMonthly);
router.post('/cvdistribution', tokenValid, getCvDistribution);
router.post('/cvconversion', tokenValid, getCvConversion);
router.post('/auditworkersstats', tokenValid, auditWorkersStats);

router.post('/getworkerspyramid',        tokenValid, getWorkersPyramid);
router.post('/getworkerspie',            tokenValid, getWorkersPie);          // field opcional
router.post('/getworkershiredended',     tokenValid, getWorkersHiredEnded);
router.post('/getworkersworkshift',      tokenValid, getWorkersWorkShift);
router.post('/getworkerstenure',         tokenValid, getWorkersTenure);



module.exports = router;