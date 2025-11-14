// routes/indexRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const path = require('path');
const {
  uploadFile,
  postUploadFile,
  getFile,
  tokenValid,
  deleteIdFile,
  tokenValidAdmin,
  createFileDrive,
  deleteFileDrive,
  updateFileDrive,
  getFileDrive,
  confirmSignature,
  requestSignature,
  getCvPresignPut,
  getCvPresignGet,
  zipMultipleFiles,
  zipPayrolls
} = require('../controllers/indexController');

// Multer en memoria (CV, FileDrive)
const uploadMem = multer({ storage: multer.memoryStorage() });

// RUTAS EXISTENTES
router.post(   '/uploadcv',        uploadMem.single('file'),postUploadFile);
router.post(   '/getfile',         tokenValid, getFile);
router.delete( '/deletefilecv',    tokenValidAdmin, deleteIdFile);
router.post(   '/crfilemodel',     tokenValid, uploadMem.single('file'), createFileDrive);
router.post(   '/dlfilemodel',     tokenValid, uploadMem.single('file'), deleteFileDrive);
router.post(   '/upfilemodel',     tokenValid, uploadMem.single('file'), updateFileDrive);
router.post(   '/getfiledrive',    tokenValid, getFileDrive);

router.post('/cv/presign-put', getCvPresignPut);
router.post('/cv/presign-get',  tokenValid, getCvPresignGet);


// NUEVAS RUTAS PARA FIRMA DE PDF
router.post('/pdf/request-sign', tokenValid, requestSignature);
router.post('/pdf/confirm-sign', tokenValid, confirmSignature);

router.post("/zip-files", tokenValid, zipMultipleFiles);
router.post("/zip-payrolls", tokenValid, zipPayrolls);


module.exports = router;
