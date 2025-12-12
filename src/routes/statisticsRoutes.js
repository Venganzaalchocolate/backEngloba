const express = require('express');
const router = express.Router();
const {tokenValid, getCurrentHeadcountStats, getUserCvStats}= require('../controllers/indexController');



router.post('/currentheadcountstats', tokenValid, getCurrentHeadcountStats);
router.post('/getusercvstats', tokenValid, getUserCvStats);

module.exports = router;