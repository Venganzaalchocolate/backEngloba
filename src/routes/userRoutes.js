const express = require('express');
const router = express.Router()
const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, tokenValid, tokenValidAdmin, getUsersFilter, postCreateUserRandom} = require('../controllers/indexController')
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false })
// Configura `multer` para almacenamiento en memoria
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/users", urlencodedParser, tokenValid, getUsers)
router.get("/user/:id", urlencodedParser,tokenValid, getUserID)
router.delete("/deleteuser/:id", urlencodedParser, tokenValidAdmin,UserDeleteId)
router.post('/filteruser', urlencodedParser, tokenValidAdmin, getUsersFilter)
router.get('/createusertest', urlencodedParser, postCreateUserRandom)


router.put("/modifyuser",  upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'sexualOffenseCertificate', maxCount: 1 },
  { name: 'model145', maxCount: 1 },
  { name: 'firePrevention', maxCount: 1 },
  { name: 'contract', maxCount: 1 },
  { name: 'employmentHistory', maxCount: 1 },
  { name: 'dataProtection', maxCount: 1 },
  { name: 'ethicalChannel', maxCount: 1 },
  { name: 'dniCopy', maxCount: 1 }
]), tokenValid, userPut)

router.post('/createemployer', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'sexualOffenseCertificate', maxCount: 1 },
    { name: 'model145', maxCount: 1 },
    { name: 'firePrevention', maxCount: 1 },
    { name: 'contract', maxCount: 1 },
    { name: 'employmentHistory', maxCount: 1 },
    { name: 'dataProtection', maxCount: 1 },
    { name: 'ethicalChannel', maxCount: 1 },
    { name: 'dniCopy', maxCount: 1 }
  ]), postCreateUser);

module.exports = router;