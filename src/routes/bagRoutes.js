
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const {tokenValid, postCreateBag, getBags, BagPut, BagPutDeleteUser} = require('../controllers/indexController');


router.post("/createbag",urlencodedParser, tokenValid,  postCreateBag)
router.get("/getbags",urlencodedParser, tokenValid,  getBags)
router.post("/addemployerbag",urlencodedParser, tokenValid,  BagPut)
router.post("/deleteemployerbag", urlencodedParser, tokenValid, BagPutDeleteUser)


module.exports = router;