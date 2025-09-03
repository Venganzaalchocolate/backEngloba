const express = require('express');
const router = express.Router();
const { 
  getPreferents,
  getPreferentById,
  filterPreferents,
  createPreferent,
  updatePreferent,
  deletePreferent
} = require('../controllers/preferentsController');
const { tokenValid } = require('../controllers/authController');

router.post('/preferents', tokenValid,getPreferents);
router.post('/preferentsid', tokenValid,getPreferentById);
router.post('/preferentsfilter', tokenValid,filterPreferents);
router.post('/preferentscreate', tokenValid, createPreferent);
router.post('/preferentsupdate', tokenValid, updatePreferent);
router.post('/preferentdelete', tokenValid, deletePreferent);

module.exports = router;
