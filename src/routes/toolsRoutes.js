// routes/toolsRoutes.js (ejemplo)
const express = require('express');
const multer = require('multer');
const { removeBgProfile512FromBuffer, tokenValid } = require('../controllers/indexController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/profile',tokenValid, upload.single('file'), removeBgProfile512FromBuffer);

module.exports = router;
