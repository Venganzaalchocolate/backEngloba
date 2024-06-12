const express = require('express');
const router = express.Router()
const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })


router.get("/users", urlencodedParser, getUsers)
router.get("/user/:id", urlencodedParser,tokenValid, getUserID)
router.post("/crearusuario", urlencodedParser,postCreateUser)
router.delete("/borrarusuario/:id", urlencodedParser, tokenValidAdmin,UserDeleteId)
router.put("/actualizarusuario", urlencodedParser,tokenValid, userPut)
router.post('/usersfilter', urlencodedParser, tokenValidAdmin, getUsersFilter)

module.exports = router;