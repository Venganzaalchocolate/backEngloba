const { login, validToken, tokenValid } = require("../controllers/indexController");
const express = require('express');
const router = express.Router()
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })

router.post("/login", urlencodedParser, login)
router.post("/validtoken", urlencodedParser, tokenValid, validToken)

module.exports = router;