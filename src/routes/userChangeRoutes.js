// routes/changeRequestRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadMem = multer({ storage: multer.memoryStorage() });

const {
  tokenValid,
  postCreateChangeRequest,
  getMyChangeRequests,
  getPendingChangeRequests,
  postApproveChangeRequest,
  postRejectChangeRequest,
  postCancelChangeRequest,
  postCreateTimeOffChangeRequest,
} = require('../controllers/indexController');

router.post('/createchangerequest', tokenValid, uploadMem.array('uploads', 10), postCreateChangeRequest);
router.post('/getmychangerequest', tokenValid, getMyChangeRequests);
router.post('/getpendingrequest', tokenValid, getPendingChangeRequests);
router.post('/approvechangerequest', tokenValid, postApproveChangeRequest);
router.post('/rejectchangerequest', tokenValid, postRejectChangeRequest);
router.post('/cancelchangerequest', tokenValid, postCancelChangeRequest);
router.post('/createtimeoffrequest',tokenValid, postCreateTimeOffChangeRequest);

module.exports = router;
