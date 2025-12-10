const express = require('express');
const router = express.Router();
const {tokenValid, getCvOverview, getCvMonthly, getCvDistribution, getCvConversion, getWorkersStats, getCurrentHeadcountStats}= require('../controllers/indexController');


router.post("/workersstats", tokenValid, getWorkersStats);

router.post("/overview", tokenValid, getCvOverview);
router.post('/cvmonthly', tokenValid, getCvMonthly);
router.post('/cvdistribution', tokenValid, getCvDistribution);
router.post('/cvconversion', tokenValid, getCvConversion);

router.post('/currentheadcountstats', tokenValid, getCurrentHeadcountStats);
module.exports = router;