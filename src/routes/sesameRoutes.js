const router = require("express").Router();

const {
  tokenValid,

  // Sesame - Employees
  postSesameCreateEmployee,
  postSesameListEmployees,
  postSesameGetEmployee,
  putSesameEmployee,
  deleteSesameEmployee,

  // Sesame - Departments
  postSesameCreateDepartment,
  postSesameListDepartments,
  postSesameGetDepartment,
  putSesameDepartment,
  deleteSesameDepartment,

  // Sesame - Workplaces
  postSesameCreateWorkplace,
  postSesameListWorkplaces,
  postSesameGetWorkplace,
  putSesameWorkplace,
  deleteSesameWorkplace,
} = require("../controllers/indexController");

// EMPLOYEES
router.post("/employees/list", tokenValid, postSesameListEmployees);
router.post("/employees/get", tokenValid, postSesameGetEmployee);
router.post("/employees/create", tokenValid, postSesameCreateEmployee);
router.post("/employees/update", tokenValid, putSesameEmployee);
router.post("/employees/delete", tokenValid, deleteSesameEmployee);

// DEPARTMENTS
router.post("/departments/list", tokenValid, postSesameListDepartments);
router.post("/departments/get", tokenValid, postSesameGetDepartment);
router.post("/departments/create", tokenValid, postSesameCreateDepartment);
router.post("/departments/update", tokenValid, putSesameDepartment);
router.post("/departments/delete", tokenValid, deleteSesameDepartment);

// WORKPLACES
router.post("/workplaces/list", tokenValid, postSesameListWorkplaces);
router.post("/workplaces/get", tokenValid, postSesameGetWorkplace);
router.post("/workplaces/create", tokenValid, postSesameCreateWorkplace);
router.post("/workplaces/update", tokenValid, putSesameWorkplace);
router.post("/workplaces/delete", tokenValid, deleteSesameWorkplace);

module.exports = router;