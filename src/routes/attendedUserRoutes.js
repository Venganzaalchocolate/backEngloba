const express = require("express");
const router = express.Router();

const {
  tokenValid,
  createAttendedUser,
  listAttendedUsers,
  getAttendedUserById,
  updateAttendedUser,
  openChronologyAttendedUser,
  closeChronologyAttendedUser,
  deleteAttendedUser,
  importAttendedUsersExcel,
  exportAttendedUsers
} = require("../controllers/indexController");
const multer = require('multer');

// Multer en memoria (CV, FileDrive)
const uploadMem = multer({ storage: multer.memoryStorage() });

router.post("/attendedusercreate", tokenValid, createAttendedUser);
router.post("/attendeduserlist", tokenValid, listAttendedUsers);
router.post("/attendeduserget", tokenValid, getAttendedUserById);
router.post("/attendeduserupdate", tokenValid, updateAttendedUser);
router.post("/attendeduseropenchronology", tokenValid, openChronologyAttendedUser);
router.post("/attendeduserclosechronology", tokenValid, closeChronologyAttendedUser);
router.post("/attendeduserdelete", tokenValid, deleteAttendedUser);
router.post("/attendeduserimportexcel", tokenValid, uploadMem.single('file'), importAttendedUsersExcel);
router.post("/attendedusersexport", tokenValid, exportAttendedUsers);

module.exports = router;