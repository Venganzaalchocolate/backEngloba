const express = require("express");
const router = express.Router();

const {
  createVolunteerApplication,
  updateVolunteerApplication,
  disableVolunteerApplication,
  deleteVolunteerApplication,
  listVolunteerApplications,
  getVolunteerApplicationById,
  addInternalNote,
  tokenValid,
  volunteerAddChronology,
   volunteerChronologyUpdate,
   volunteerChronologyDelete,
   setVolunteerInterview,
   deleteInternalNote
} = require("../controllers/indexController");

/**
 * Todas las rutas reciben datos por body:
 *  - volunteercreate: { ...payload formulario }
 *  - volunteerupdate: { volunteerApplicationId, ...patch }
 *  - volunteerdisable:{ volunteerApplicationId, disabledReason? }
 *  - volunteerdelete: { volunteerApplicationId }   // hard delete
 *  - volunteerlist:   { active?, province?, programId?, area?, q?, page?, limit? }
 *  - volunteerget:    { volunteerApplicationId }
 *  - volunteeraddnote:{ volunteerApplicationId, note }  // author se saca de req.user._id si tienes auth
 */

router.post("/volunteercreate", createVolunteerApplication);
router.post("/volunteerupdate", tokenValid, updateVolunteerApplication);
router.post("/volunteerdisable", tokenValid, disableVolunteerApplication);
router.post("/volunteerdelete", tokenValid, deleteVolunteerApplication);
router.post("/volunteerlist", tokenValid, listVolunteerApplications);
router.post("/volunteerget", tokenValid, getVolunteerApplicationById);
router.post("/volunteeraddnote", tokenValid, addInternalNote);
router.post("/volunteerdeletenote", tokenValid, deleteInternalNote)

router.post("/volunteeraddchronology", tokenValid, volunteerAddChronology )
router.post("/volunteerchronologyupdate", tokenValid, volunteerChronologyUpdate);
router.post("/volunteerchronologydelete", tokenValid, volunteerChronologyDelete);

router.post('/volunteerinterview', tokenValid, setVolunteerInterview);


module.exports = router;
