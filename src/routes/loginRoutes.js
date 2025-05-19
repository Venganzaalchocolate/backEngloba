const { login, validToken, tokenValid, verifyCode } = require("../controllers/indexController");
const express = require('express');
const router = express.Router()

router.post("/login", login)
router.post("/validtoken", tokenValid, validToken)
router.post("/validCode",verifyCode)

module.exports = router;