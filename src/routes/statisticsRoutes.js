const express = require('express');
const router = express.Router();
const { tokenValid } = require("../controllers/authController");
const { getCvOverview, getCvMonthly, getCvDistribution, getCvConversion } = require("../controllers/statisticsController");


router.post("/overview", tokenValid, getCvOverview);
router.post('/cvmonthly', tokenValid, getCvMonthly);
router.post('/cvdistribution', tokenValid, getCvDistribution);
router.post('/cvconversion', tokenValid, getCvConversion);


module.exports = router;