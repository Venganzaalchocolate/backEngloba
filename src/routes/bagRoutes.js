
const express = require('express');
const router = express.Router()
const {tokenValid, postCreateBag, getBags, BagPut, BagPutDeleteUser, bagDeactivateId} = require('../controllers/indexController');


router.post("/createbag", tokenValid,  postCreateBag)
router.get("/getbags", tokenValid,  getBags)
router.post("/addemployerbag", tokenValid,  BagPut)
router.post("/deleteemployerbag", tokenValid, BagPutDeleteUser)
router.post("/bagdeactivate", tokenValid, bagDeactivateId)


module.exports = router;