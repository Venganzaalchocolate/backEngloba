const express = require('express');
const router = express.Router();
const {tokenValid, getCurrentHeadcountStats, getUserCvStats, getLeavesStats}= require('../controllers/indexController');



router.post('/currentheadcountstats', tokenValid, getCurrentHeadcountStats);
router.post('/getusercvstats', tokenValid, getUserCvStats);
router.post('/getleavesstats', tokenValid, getLeavesStats);

module.exports = router;