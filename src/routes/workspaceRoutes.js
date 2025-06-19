const express = require('express');
const router = express.Router()
const {tokenValid, infoGroupWS, addGroupWS, createGroupWS, deleteMemberGroupWS, deleteGroupWS} = require('../controllers/indexController')

router.post('/infogroupws', tokenValid, infoGroupWS);
router.post('/addgroupws', tokenValid, addGroupWS);
router.post('/creategroupws', tokenValid, createGroupWS);
router.post('/deletememberws', tokenValid, deleteMemberGroupWS);
router.post('/deletegroupws', tokenValid, deleteGroupWS);
//deletememberws

module.exports = router;