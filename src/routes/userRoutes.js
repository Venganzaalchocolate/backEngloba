const express = require('express');
const router = express.Router()
const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.get("/users", urlencodedParser, tokenValidAdmin, getUsers)
router.get("/user/:id", urlencodedParser,tokenValid, getUserID)
router.post("/createemployer", urlencodedParser, tokenValidAdmin,postCreateUser)
router.delete("/deleteuser/:id", urlencodedParser, tokenValidAdmin,UserDeleteId)
router.put("/modifyuser", urlencodedParser,tokenValid, userPut)
router.post('/filteruser', urlencodedParser, tokenValidAdmin, getUsersFilter)

module.exports = router;