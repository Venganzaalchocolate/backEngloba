const { User, Dispositive } = require("../models/indexModels");
const sesameService = require("../services/sesameServices");

const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const SESAME_COMPANY_ID = process.env.SESAME_COMPANY_ID;

if (!SESAME_COMPANY_ID) {
  throw new Error("Falta SESAME_COMPANY_ID en .env");
}

const mapUserGenderToSesame = (gender) => {
  if (gender === "male") return "male";
  if (gender === "female") return "female";
  return undefined;
};

const mapEmploymentStatusToSesame = (employmentStatus) => {
  if (employmentStatus === "activo") return "active";
  if (employmentStatus === "ya no trabaja con nosotros") return "inactive";
  return undefined;
};

const buildSesameEmployeeFromUser = (user, extra = {}) => {
  const payload = {
    companyId: SESAME_COMPANY_ID,
  };

  if (user.firstName !== undefined) payload.firstName = user.firstName;
  if (user.lastName !== undefined) payload.lastName = user.lastName;
  if (extra.invitation !== undefined) payload.invitation = extra.invitation;

  const mappedStatus = mapEmploymentStatusToSesame(user.employmentStatus);
  if (extra.status !== undefined) payload.status = extra.status;
  else if (mappedStatus !== undefined) payload.status = mappedStatus;

  const mappedGender = mapUserGenderToSesame(user.gender);
  if (extra.gender !== undefined) payload.gender = extra.gender;
  else if (mappedGender !== undefined) payload.gender = mappedGender;

  if (user.email !== undefined) payload.email = user.email;
  if (extra.contractId !== undefined) payload.contractId = extra.contractId;
  if (extra.code !== undefined) payload.code = extra.code;
  if (extra.pin !== undefined) payload.pin = extra.pin;

  if (user.dni !== undefined) payload.nid = user.dni;
  if (extra.identityNumberType !== undefined) payload.identityNumberType = extra.identityNumberType;
  else if (user.dni) payload.identityNumberType = "dni";

  if (extra.secondaryIdentityNumberType !== undefined) payload.secondaryIdentityNumberType = extra.secondaryIdentityNumberType;
  if (extra.secondaryNid !== undefined) payload.secondaryNid = extra.secondaryNid;

  if (user.socialSecurityNumber !== undefined) payload.ssn = user.socialSecurityNumber;
  if (user.phone !== undefined) payload.phone = user.phone;

  if (user.birthday instanceof Date && !Number.isNaN(user.birthday.getTime())) {
    payload.dateOfBirth = user.birthday.toISOString().slice(0, 10);
  }

  if (Array.isArray(extra.customFields)) payload.customFields = extra.customFields;
  if (Array.isArray(extra.nationalities)) payload.nationalities = extra.nationalities;
  if (extra.maritalStatus !== undefined) payload.maritalStatus = extra.maritalStatus;
  if (extra.address !== undefined) payload.address = extra.address;
  if (extra.postalCode !== undefined) payload.postalCode = extra.postalCode;
  if (extra.emergencyPhone !== undefined) payload.emergencyPhone = extra.emergencyPhone;
  if (extra.childrenCount !== undefined) payload.childrenCount = extra.childrenCount;

  if (user.disability?.percentage !== undefined) payload.disability = user.disability.percentage;

  if (user.email_personal !== undefined) payload.personalEmail = user.email_personal;
  if (user.notes !== undefined) payload.description = user.notes;

  if (extra.city !== undefined) payload.city = extra.city;
  if (extra.province !== undefined) payload.province = extra.province;
  if (extra.country !== undefined) payload.country = extra.country;
  if (extra.salaryRange !== undefined) payload.salaryRange = extra.salaryRange;
  if (extra.studyLevel !== undefined) payload.studyLevel = extra.studyLevel;
  if (extra.professionalCategoryDescription !== undefined) payload.professionalCategoryDescription = extra.professionalCategoryDescription;
  if (extra.bic !== undefined) payload.bic = extra.bic;

  if (user.bankAccountNumber !== undefined) payload.accountNumber = user.bankAccountNumber;
  if (extra.jobChargeId !== undefined) payload.jobChargeId = extra.jobChargeId;
  if (extra.jobChargeDescription !== undefined) payload.jobChargeDescription = extra.jobChargeDescription;
  if (extra.jobChargeCompetencies !== undefined) payload.jobChargeCompetencies = extra.jobChargeCompetencies;

  if (user.phoneJob?.number !== undefined) payload.workPhone = user.phoneJob.number;

  if (extra.mainRecruiter !== undefined) payload.mainRecruiter = extra.mainRecruiter;
  if (extra.nfc !== undefined) payload.nfc = extra.nfc;
  if (extra.contributionGroupId !== undefined) payload.contributionGroupId = extra.contributionGroupId;

  return payload;
};

const buildSesameWorkplaceFromDispositive = (dispositive, extra = {}) => {
  const payload = {
    companyId: SESAME_COMPANY_ID,
  };

  payload.name = extra.name !== undefined ? extra.name : dispositive.name;

  if (extra.code !== undefined) payload.code = extra.code;

  if (extra.description !== undefined) {
    payload.description = extra.description;
  } else {
    const parts = [];
    if (dispositive.program?.name) parts.push(`Programa: ${dispositive.program.name}`);
    if (dispositive.email) parts.push(`Email: ${dispositive.email}`);
    if (parts.length) payload.description = parts.join(" | ");
  }

  if (extra.address !== undefined) payload.address = extra.address;
  else if (dispositive.address !== undefined) payload.address = dispositive.address;

  if (extra.postalCode !== undefined) payload.postalCode = extra.postalCode;
  if (extra.city !== undefined) payload.city = extra.city;

  if (extra.province !== undefined) payload.province = extra.province;
  else if (dispositive.province?.name !== undefined) payload.province = dispositive.province.name;

  if (extra.country !== undefined) payload.country = extra.country;

  if (extra.phone !== undefined) payload.phone = extra.phone;
  else if (dispositive.phone !== undefined) payload.phone = dispositive.phone;

  return payload;
};



// EMPLOYEES
const postSesameCreateEmployee = async (req, res) => {
  const { userId, ...extra } = req.body;

  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (!extra.companyId) throw new ClientError("Falta companyId", 400);
  if (!user.firstName || !user.email || !user.dni) {
    throw new ClientError("El usuario no tiene los datos mínimos para crear el empleado en Sesame", 400);
  }

  const payload = buildSesameEmployeeFromUser(user, extra);
  const data = await sesameService.createEmployee(payload);

  response(res, 200, data);
};

const postSesameListEmployees = async (req, res) => {
  const params = req.body?.params || {};
  const data = await sesameService.listEmployees(params);
  response(res, 200, data);
};

const postSesameGetEmployee = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.getEmployeeById(id);
  response(res, 200, data);
};

const putSesameEmployee = async (req, res) => {
  const { id, userId, ...extra } = req.body;

  if (!id) throw new ClientError("Falta id", 400);
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const payload = buildSesameEmployeeFromUser(user, extra);
  const data = await sesameService.updateEmployee(id, payload);

  response(res, 200, data);
};

const deleteSesameEmployee = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.deleteEmployee(id);
  response(res, 200, data);
};

// WORKPLACES
const postSesameCreateWorkplace = async (req, res) => {
  const { dispositiveId, ...extra } = req.body;

  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .populate("program", "name")
    .populate("province", "name");

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!extra.companyId) throw new ClientError("Falta companyId", 400);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);

  const payload = buildSesameWorkplaceFromDispositive(dispositive, extra);
  const data = await sesameService.createWorkplace(payload);

  response(res, 200, data);
};

const postSesameListWorkplaces = async (req, res) => {
  const params = req.body?.params || {};
  const data = await sesameService.listWorkplaces(params);
  response(res, 200, data);
};

const postSesameGetWorkplace = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.getWorkplaceById(id);
  response(res, 200, data);
};

const putSesameWorkplace = async (req, res) => {
  const { id, dispositiveId, ...extra } = req.body;

  if (!id) throw new ClientError("Falta id", 400);
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .populate("program", "name")
    .populate("province", "name");

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);

  const payload = buildSesameWorkplaceFromDispositive(dispositive, extra);
  const data = await sesameService.updateWorkplace(id, payload);

  response(res, 200, data);
};

const deleteSesameWorkplace = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.deleteWorkplace(id);
  response(res, 200, data);
};

// DEPARTMENTS
const postSesameCreateDepartment = async (req, res) => {
  const { companyId, name, code, description } = req.body;

  if (!companyId || !name) {
    throw new ClientError("Faltan datos obligatorios del departamento", 400);
  }

  const payload = {};
  if (companyId !== undefined) payload.companyId = companyId;
  if (name !== undefined) payload.name = name;
  if (code !== undefined) payload.code = code;
  if (description !== undefined) payload.description = description;

  const data = await sesameService.createDepartment(payload);
  response(res, 200, data);
};

const postSesameListDepartments = async (req, res) => {
  const params = req.body?.params || {};
  const data = await sesameService.listDepartments(params);
  response(res, 200, data);
};

const postSesameGetDepartment = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.getDepartmentById(id);
  response(res, 200, data);
};

const putSesameDepartment = async (req, res) => {
  const { id, companyId, name, code, description } = req.body;

  if (!id) throw new ClientError("Falta id", 400);

  const payload = {};
  if (companyId !== undefined) payload.companyId = companyId;
  if (name !== undefined) payload.name = name;
  if (code !== undefined) payload.code = code;
  if (description !== undefined) payload.description = description;

  const data = await sesameService.updateDepartment(id, payload);
  response(res, 200, data);
};

const deleteSesameDepartment = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);

  const data = await sesameService.deleteDepartment(id);
  response(res, 200, data);
};

module.exports = {
  postSesameCreateEmployee: catchAsync(postSesameCreateEmployee),
  postSesameListEmployees: catchAsync(postSesameListEmployees),
  postSesameGetEmployee: catchAsync(postSesameGetEmployee),
  putSesameEmployee: catchAsync(putSesameEmployee),
  deleteSesameEmployee: catchAsync(deleteSesameEmployee),

  postSesameCreateDepartment: catchAsync(postSesameCreateDepartment),
  postSesameListDepartments: catchAsync(postSesameListDepartments),
  postSesameGetDepartment: catchAsync(postSesameGetDepartment),
  putSesameDepartment: catchAsync(putSesameDepartment),
  deleteSesameDepartment: catchAsync(deleteSesameDepartment),

  postSesameCreateWorkplace: catchAsync(postSesameCreateWorkplace),
  postSesameListWorkplaces: catchAsync(postSesameListWorkplaces),
  postSesameGetWorkplace: catchAsync(postSesameGetWorkplace),
  putSesameWorkplace: catchAsync(putSesameWorkplace),
  deleteSesameWorkplace: catchAsync(deleteSesameWorkplace),
};