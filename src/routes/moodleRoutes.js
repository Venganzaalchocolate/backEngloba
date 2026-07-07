// routes/moodleRoutes.js
const express = require("express");
const router = express.Router();

const {
  tokenValid,
  postMoodleTest,
  postMoodleSyncUser,
  postMoodleGetRoles,
  postMoodleInfo,
  postMoodleGetCourseUsers,
  postMoodleManageCourseEnrolments,
  postMoodleManageSystemRole,
  postMoodleUndoAssignment,
} = require("../controllers/indexController");

// Moodle
router.post("/moodletest", tokenValid, postMoodleTest);
router.post("/moodlesyncuser", tokenValid, postMoodleSyncUser);
router.post("/moodleroles", tokenValid, postMoodleGetRoles);
router.post("/moodleinfo", tokenValid, postMoodleInfo);
router.post("/moodlecourseusers", tokenValid, postMoodleGetCourseUsers);
router.post("/moodlecourseenrolments", tokenValid, postMoodleManageCourseEnrolments);
router.post("/moodlesystemrole", tokenValid, postMoodleManageSystemRole);
router.post("/moodleassignmentundo", tokenValid, postMoodleUndoAssignment);

module.exports = router;