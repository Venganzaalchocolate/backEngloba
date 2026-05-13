const {
  postSesameGetOfficeEmployees,
  postSesameGetDepartmentEmployees,
  postSesameDeleteEmployeeOfficeRole,
  postSesameGetEmployee,
  postSesameListEmployees,
  tokenValid,
  postSesameGetEmployeeContext,
  postSesameAssignEmployeeOffice,
  postSesameDeleteEmployeeOfficeAssignation,
  postSesameAssignEmployeeOfficeRole,
  postSesameAssignOfficeEmployee,
  postSesameDeleteOfficeEmployee,
  postSesameAssignDepartmentEmployee,
  postSesameDeleteDepartmentEmployee,
  postSesameUpdateEmployeeManagersByEmployee,
  postSesameEligibleManagersByEmployee,
  postSesameCreateDepartmentForUser,
  postSesameDeleteDepartment,
  postSesameToggleEmployeeForUser,
  postSesameInviteEmployeeForUser,
  postSesameGetOfficeManagers,
  postSesameAssignDispositiveDepartmentAdminToUser,
  postSesameRemoveDepartmentAdminRoleFromUser,
  postSesameAssignEmployeeToDispositiveScopes
} = require("../controllers/indexController");

const express = require("express");
const router = express.Router();

// EMPLOYEES
router.post("/sesameemployeelist", tokenValid, postSesameListEmployees);
router.post("/sesameemployeeget", tokenValid, postSesameGetEmployee);
router.post("/sesameemployeegetcontext", tokenValid, postSesameGetEmployeeContext);

// OFFICE ASSIGNATION DEL EMPLEADO ACTUAL
router.post("/sesameemployeeofficeassign", tokenValid, postSesameAssignEmployeeOffice);
router.post("/sesameemployeeofficedelete", tokenValid, postSesameDeleteEmployeeOfficeAssignation);

// ROLE OFFICE MANAGER
router.post("/sesameemployeeofficeassignrole", tokenValid, postSesameAssignEmployeeOfficeRole);
router.post("/sesameemployeeofficeroledelete", tokenValid, postSesameDeleteEmployeeOfficeRole);

// EMPLEADOS DE OFICINA / DEPARTAMENTO
router.post("/sesamegetofficeemployees", tokenValid, postSesameGetOfficeEmployees);
router.post("/sesamegetdepartmentemployees", tokenValid, postSesameGetDepartmentEmployees);

// AÑADIR / QUITAR EMPLEADOS EN OFICINA
router.post("/sesameofficeemployeeassign", tokenValid, postSesameAssignOfficeEmployee);
router.post("/sesameofficeemployeedelete", tokenValid, postSesameDeleteOfficeEmployee);

// AÑADIR / QUITAR EMPLEADOS EN DEPARTAMENTO
router.post("/sesamedepartmentemployeeassign", tokenValid, postSesameAssignDepartmentEmployee);
router.post("/sesamedepartmentemployeedelete", tokenValid, postSesameDeleteDepartmentEmployee);

router.post( "/sesameemployeemanagersbyemployeeupdate",  tokenValid,  postSesameUpdateEmployeeManagersByEmployee);

router.post( "/sesameeligiblemanagersbyemployee", tokenValid, postSesameEligibleManagersByEmployee);

router.post("/sesamedepartmentcreateforuser", tokenValid, postSesameCreateDepartmentForUser);
router.post("/sesamedepartmentdelete", tokenValid, postSesameDeleteDepartment);


router.post("/sesameemployeetoggleforuser", tokenValid, postSesameToggleEmployeeForUser);
router.post("/sesameemployeeinviteforuser", tokenValid, postSesameInviteEmployeeForUser);

router.post("/sesamegetofficemanagers", tokenValid, postSesameGetOfficeManagers);

router.post("/assigndispositivedepartmentadmintouser", tokenValid, postSesameAssignDispositiveDepartmentAdminToUser)
router.post("/postsesameremovedepartmentadminrolefromuser", tokenValid, postSesameRemoveDepartmentAdminRoleFromUser)
router.post("/assignemployeetodispositivescopes", tokenValid, postSesameAssignEmployeeToDispositiveScopes);

module.exports = router;