const express = require('express');
const router = express.Router()
const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter, payroll, hirings, getFileUser} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/users", urlencodedParser, tokenValid, getUsers)
router.get("/user/:id", urlencodedParser,tokenValid, getUserID)
router.delete("/deleteuser/:id", urlencodedParser, tokenValid,UserDeleteId)
router.post('/filteruser', urlencodedParser, tokenValid, getUsersFilter)
router.post("/payroll", upload.single('pdf'), payroll)
router.post("/hirings", tokenValid, hirings)

router.put("/modifyuser", upload.any(), tokenValid, userPut);

router.post('/createemployer', upload.any(), postCreateUser);

router.post('/fileuser', urlencodedParser, tokenValid, getFileUser)

module.exports = router;