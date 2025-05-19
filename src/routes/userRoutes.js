const express = require('express');
const router = express.Router()
const {postCreateUser,getUsersCvsIDs, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter, payroll, hirings, getFileUser, getUserName, getAllUsersWithOpenPeriods} = require('../controllers/indexController')
// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/users", tokenValid, getUsers)
router.post("/userscv",tokenValid, getUsersCvsIDs)
router.post("/deleteuser", tokenValid,UserDeleteId)
router.post('/filteruser', tokenValid, getUsersFilter)
router.post("/payroll", upload.single('pdf'), payroll)
router.post("/hirings", tokenValid, hirings)
router.post("/usersname", tokenValid, getUserName)
router.post('/user', tokenValid, getUserID)

router.put("/modifyuser", upload.any(), tokenValid, userPut);

router.post('/createemployer', upload.any(), postCreateUser);

router.post('/fileuser', tokenValid, getFileUser)

router.post('/usersfilternotlimit', tokenValid, getAllUsersWithOpenPeriods)

module.exports = router;