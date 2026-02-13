const express = require('express');
const router = express.Router()
const {profilePhotoGetBatch, getPhotoProfile,rehireUser, postCreateUser,getUsersCvsIDs, getUserID, getUsers, UserDeleteId, userPut, tokenValid, getUsersFilter, payroll, getFileUser, getUserName, getAllUsersWithOpenPeriods, getUsersCurrentStatus, getBasicUserSearch, getUserListDays, recreateCorporateEmail, profilePhotoSet} = require('../controllers/indexController')
// Configura `multer` para almacenamiento en memoria
const multer = require('multer');


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.post("/rehireemployee", tokenValid, rehireUser); 


router.post("/users", tokenValid, getUsers)
router.post("/userscv",tokenValid, getUsersCvsIDs)
router.post("/deleteuser", tokenValid,UserDeleteId)
router.post('/filteruser', tokenValid, getUsersFilter)
router.post("/payroll", tokenValid, upload.any(), payroll)




router.post("/usersname", tokenValid, getUserName)
router.post('/user', tokenValid, getUserID)
router.post('/searchusername', tokenValid, getBasicUserSearch);
router.post("/modifyuser", tokenValid, userPut);
router.post("/getuserlistdays", tokenValid, getUserListDays)

router.post('/createemployer', tokenValid,upload.any(), postCreateUser);

router.post('/fileuser', tokenValid, getFileUser)

router.post('/usersfilternotlimit', tokenValid, getAllUsersWithOpenPeriods)

router.post('/userscurrentstatus', tokenValid, getUsersCurrentStatus)

router.post('/recreatecorporateemail', tokenValid, recreateCorporateEmail)
router.post('/getphotoprofile', tokenValid, getPhotoProfile);
router.post('/profilephotoset',tokenValid, upload.single('file'), profilePhotoSet);
router.post('/profilephotogetbatch', tokenValid, profilePhotoGetBatch)


module.exports = router;