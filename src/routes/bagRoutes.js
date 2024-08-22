
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const {tokenValid, postCreateBag, getBags, BagPut, BagPutDeleteUser, bagDeactivateId} = require('../controllers/indexController');


router.post("/createbag",urlencodedParser, tokenValid,  postCreateBag)
router.get("/getbags",urlencodedParser, tokenValid,  getBags)
router.post("/addemployerbag",urlencodedParser, tokenValid,  BagPut)
router.post("/deleteemployerbag", urlencodedParser, tokenValid, BagPutDeleteUser)
router.post("/bagdeactivate", urlencodedParser, tokenValid, bagDeactivateId)


module.exports = router;