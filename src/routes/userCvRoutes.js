const express = require('express');
const router = express.Router()
const {postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, tokenValid, tokenValidAdmin, getUserCvsFilter, getEnums} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.post("/usercvs", urlencodedParser, tokenValid, getUserCvs)
router.get("/usercv/:id", urlencodedParser,tokenValid, getUserCvID)
router.post("/createusercv", urlencodedParser,postCreateUserCv)
router.delete("/deleteusercv", urlencodedParser, tokenValidAdmin,UserCvDeleteId)
router.put("/modifyusercv", urlencodedParser, UserCvPut)
router.post('/filterusercv', urlencodedParser, getUserCvsFilter)


module.exports = router;