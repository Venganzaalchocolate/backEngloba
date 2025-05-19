const express = require('express');
const router = express.Router()
const {postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, tokenValid, tokenValidAdmin, getUserCvsFilter, getEnums} = require('../controllers/indexController')



router.post("/usercvs", tokenValid, getUserCvs)
router.get("/usercv/:id",tokenValid, getUserCvID)
router.post("/createusercv",postCreateUserCv)
router.delete("/deleteusercv", tokenValidAdmin,UserCvDeleteId)
router.put("/modifyusercv", UserCvPut)
router.post('/filterusercv', getUserCvsFilter)


module.exports = router;