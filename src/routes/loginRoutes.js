const { login, validToken, tokenValid, verifyCode } = require("../controllers/indexController");
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })

router.post("/login", urlencodedParser, login)
router.post("/validtoken", urlencodedParser, tokenValid, validToken)
router.post("/validCode", urlencodedParser, verifyCode)

module.exports = router;