const express = require('express');
const router = express.Router()
const {postCreateUser,getUsersCvsIDs, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter, payroll, hirings, getFileUser, getUserName, getAllUsersWithOpenPeriods} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/users", urlencodedParser, tokenValid, getUsers)
router.post("/userscv", urlencodedParser,tokenValid, getUsersCvsIDs)
router.post("/deleteuser", urlencodedParser, tokenValid,UserDeleteId)
router.post('/filteruser', urlencodedParser, tokenValid, getUsersFilter)
router.post("/payroll", upload.single('pdf'), payroll)
router.post("/hirings", tokenValid, hirings)
router.post("/usersname", tokenValid, getUserName)
router.post('/user', urlencodedParser, tokenValid, getUserID)

router.put("/modifyuser", upload.any(), tokenValid, userPut);

router.post('/createemployer', upload.any(), postCreateUser);

router.post('/fileuser', urlencodedParser, tokenValid, getFileUser)

router.post('/usersfilternotlimit', urlencodedParser, tokenValid, getAllUsersWithOpenPeriods)

module.exports = router;