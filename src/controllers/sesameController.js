const { User, Dispositive, SesameResponsibility } = require("../models/indexModels");
const sesameService = require("../services/sesameServices");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const SESAME_COMPANY_ID = process.env.SESAME_COMPANY_ID;

if (!SESAME_COMPANY_ID) throw new Error("Falta SESAME_COMPANY_ID en .env");

const SESAME_ROLE_IDS = {
  DEPARTMENT_ADMIN: "42340bb4-3355-4b12-90f9-70cf7ad86d88",
  WORKPLACE_ADMIN: "65009a48-73ca-413c-a1ac-e98ecc00da09",
  ADMIN: "d4e27835-80e2-4967-89b0-eceab254915c",
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const mapUserGenderToSesame = (gender) => gender === "male" || gender === "female" ? gender : undefined;
const mapEmploymentStatusToSesame = (employmentStatus) => employmentStatus === "activo" ? "active" : employmentStatus === "ya no trabaja con nosotros" ? "inactive" : undefined;
const normalizeDniSesame = (value = "") => String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");

const getSesameEmployeeIdFromLocalUser = async (userId, errorLabel = "Usuario") => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError(`${errorLabel} no encontrado`, 404);
  if (!user.userIdSesame) throw new ClientError(`${errorLabel} no está dado de alta en Sesame`, 400);

  return { user, employeeIdSesame: String(user.userIdSesame) };
};

const resolveManagerSesameIdFromUser = async (managerId) => {
  if (!managerId) return null;
  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(managerId, "Usuario manager");
  return employeeIdSesame;
};

const assignEmployeeToScope = async ({ scopeType, scopeId, userId, isMainOffice = null }) => {
  if (!scopeType) throw new ClientError("Falta scopeType", 400);
  if (!scopeId) throw new ClientError("Falta scopeId", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(userId, "Usuario");

  if (scopeType === "office") {
    const assignation = await sesameService.assignEmployeeOffice({employeeId: employeeIdSesame,officeId: scopeId});

    if (isMainOffice !== null) {
      const assignationId = assignation?.data?.id;
      if (!assignationId) throw new ClientError("No se pudo obtener el id de la asignación de oficina en Sesame", 500);
      await sesameService.updateEmployeeOfficeAssignation(assignationId, {isMainOffice: !!isMainOffice,});
    }
    return assignation;
  }

  if (scopeType === "department") return sesameService.assignEmployeeDepartment({employeeId: employeeIdSesame,departmentId: scopeId,});
  throw new ClientError("scopeType no válido", 400);
};

const deleteEmployeeFromScope = async ({ scopeType, scopeId, userId }) => {
  if (!scopeType) throw new ClientError("Falta scopeType", 400);
  if (!scopeId) throw new ClientError("Falta scopeId", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(userId, "Usuario");

  if (scopeType === "office") return sesameService.deleteEmployeeOfficeAssignation({ employeeId: employeeIdSesame, officeId: scopeId });
  if (scopeType === "department") return sesameService.deleteEmployeeDepartmentAssignation({ employeeId: employeeIdSesame, departmentId: scopeId });

  throw new ClientError("scopeType no válido", 400);
};

const listEmployeesByScope = async ({ scopeType, scopeId, limit = 200, page = 1 }) => {
  if (!scopeType) throw new ClientError("Falta scopeType", 400);
  if (!scopeId) throw new ClientError("Falta scopeId", 400);

  if (scopeType === "office") {
    const data = await sesameService.listOfficeEmployees({ officeId: scopeId, limit, page });
    const items = data?.data || [];
    return items.map((item) => {
      const employee = item?.employee || null;
      if (!employee) return null;
      return {
        employeeId: employee.id || null,
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        fullName: [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim(),
        email: employee.email || "",
        phone: employee.phone || "",
        workStatus: employee.workStatus || "",
        code: employee.code ?? null,
        officeId: item?.office?.id || item?.officeId || null,
        isMainOffice: item?.isMainOffice ?? false,
        raw: employee,
        rawAssignation: item,
      };
    }).filter(Boolean);
  }

  if (scopeType === "department") {
    const data = await sesameService.getDepartmentEmployees({ departmentId: scopeId, limit, page });
    const items = data?.data || [];
    return items.map((item) => {
      const employee = item?.employee || null;
      if (!employee) return null;
      return {
        employeeId: employee.id || null,
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        fullName: [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim(),
        email: employee.email || "",
        phone: employee.phone || "",
        workStatus: employee.workStatus || "",
        code: employee.code ?? null,
        departmentId: item?.department?.id || item?.departmentId || null,
        raw: employee,
        rawAssignation: item,
      };
    }).filter(Boolean);
  }

  throw new ClientError("scopeType no válido", 400);
};

const buildSesameEmployeeFromUser = (user) => {
  const payload = { companyId: SESAME_COMPANY_ID };

  const mappedStatus = mapEmploymentStatusToSesame(user.employmentStatus);
  const mappedGender = mapUserGenderToSesame(user.gender);

  if (user.firstName !== undefined) payload.firstName = user.firstName;
  if (user.lastName !== undefined) payload.lastName = user.lastName;
  if (mappedStatus !== undefined) payload.status = mappedStatus;
  if (mappedGender !== undefined) payload.gender = mappedGender;
  if (user.email !== undefined) payload.email = user.email;
  if (user.dni !== undefined) payload.nid = user.dni;
  if (user.dni) payload.identityNumberType = "dni";
  if (user.socialSecurityNumber !== undefined) payload.ssn = user.socialSecurityNumber;
  if (user.phone !== undefined) payload.phone = user.phone;
  if (user.birthday instanceof Date && !Number.isNaN(user.birthday.getTime())) payload.dateOfBirth = user.birthday.toISOString().slice(0, 10);
  if (user.disability?.percentage !== undefined) payload.disability = user.disability.percentage;
  if (user.email_personal !== undefined) payload.personalEmail = user.email_personal;
  if (user.notes !== undefined) payload.description = user.notes;
  if (user.bankAccountNumber !== undefined) payload.accountNumber = user.bankAccountNumber;
  if (user.phoneJob?.number !== undefined) payload.workPhone = user.phoneJob.number;

  return payload;
};

const buildSesameOfficeFromDispositive = (dispositive) => {
  const payload = { companyId: SESAME_COMPANY_ID };

  if (dispositive.name !== undefined) payload.name = dispositive.name;
  if (dispositive.address !== undefined) payload.address = dispositive.address;

  if (
    dispositive.coordinates &&
    Number.isFinite(Number(dispositive.coordinates.lat)) &&
    Number.isFinite(Number(dispositive.coordinates.lng))
  ) {
    payload.coordinates = {
      latitude: Number(dispositive.coordinates.lat),
      longitude: Number(dispositive.coordinates.lng),
    };
  }

  const parts = [];
  if (dispositive.program?.name) parts.push(`Programa: ${dispositive.program.name}`);
  if (dispositive.email) parts.push(`Email: ${dispositive.email}`);
  if (dispositive.phone) parts.push(`Teléfono: ${dispositive.phone}`);
  if (parts.length) payload.description = parts.join(" | ");

  payload.defaultEmployeesDateTimeZone = "Europe/Madrid";

  return payload;
};

const getDispositiveForSesame = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId).populate("program", "name").populate("province", "name");
  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);

  return dispositive;
};

const findSesameEmployeeByUser = async (user) => {
  if (!user) return null;

  const dni = normalizeDniSesame(user?.dni);

  if (dni) {
    const byDni = await sesameService.listEmployees({ dni, limit: 10 });
    const itemsByDni = byDni?.data || [];
    if (itemsByDni.length === 1) return itemsByDni[0];
    if (itemsByDni.length > 1) throw new ClientError(`Hay más de un empleado en Sesame con el DNI ${dni}`, 409);
  }

  if (user?.email) {
    const email = String(user.email).trim().toLowerCase();
    const byEmail = await sesameService.listEmployees({ email, limit: 10 });
    const itemsByEmail = byEmail?.data || [];
    if (itemsByEmail.length === 1) return itemsByEmail[0];
    if (itemsByEmail.length > 1) throw new ClientError(`Hay más de un empleado en Sesame con el email ${user.email}`, 409);
  }

  return null;
};

const ensureSesameEmployeeForUser = async (userId, options = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const { status = null } = options;

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.firstName || !user.dni) throw new ClientError("El usuario no tiene los datos mínimos para crear/sincronizar en Sesame", 400);

  let existingSesame = null;

  if (user.userIdSesame) existingSesame = await sesameService.getEmployeeById(user.userIdSesame).catch(() => null);
  if (!existingSesame) existingSesame = await findSesameEmployeeByUser(user);

  const payload = { ...buildSesameEmployeeFromUser(user), ...(status ? { status } : {}) };

  if (existingSesame) {
    const sesameId = existingSesame?.data?.id || existingSesame?.id;
    if (!sesameId) throw new ClientError("No se encontró el id del empleado en Sesame", 500);

    const updated = await sesameService.updateEmployee(sesameId, payload);

    if (!user.userIdSesame || String(user.userIdSesame) !== String(sesameId)) {
      await User.updateOne({ _id: user._id }, { $set: { userIdSesame: String(sesameId) } });
    }

    return { action: "updated", sesameId: String(sesameId), data: updated };
  }

  try {
    const created = await sesameService.createEmployee(payload);
    const createdId = created?.data?.id || created?.id;
    if (!createdId) throw new ClientError("Sesame creó el empleado pero no devolvió un identificador reconocible", 500);

    await User.updateOne({ _id: user._id }, { $set: { userIdSesame: String(createdId) } });

    return { action: "created", sesameId: String(createdId), data: created };
  } catch (error) {
    try {
      const byDni = await sesameService.listEmployees({ dni: normalizeDniSesame(user.dni), limit: 10 });
      const itemsByDni = byDni?.data || [];

      if (itemsByDni.length === 1) {
        const foundSesameId = itemsByDni[0]?.id;
        if (!foundSesameId) throw new ClientError("Se encontró el usuario en Sesame pero sin id", 500);

        await User.updateOne({ _id: user._id }, { $set: { userIdSesame: String(foundSesameId) } });

        if (status) {
          await sesameService.updateEmployee(foundSesameId, { ...buildSesameEmployeeFromUser(user), status });
        }

        return { action: "linked-existing", sesameId: String(foundSesameId), data: itemsByDni[0] };
      }

      return { action: "not-created", sesameId: null, data: null };
    } catch {
      return { action: "not-created", sesameId: null, data: null };
    }
  }
};
const disableSesameEmployeeForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) return { action: "not-found" };

  const payload = { ...buildSesameEmployeeFromUser(user), status: "inactive" };
  const updated = await sesameService.updateEmployee(user.userIdSesame, payload);

  return { action: "disabled", sesameId: String(user.userIdSesame), data: updated };
};

const deleteSesameEmployeeForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  let sesameId = user.userIdSesame;
  if (!sesameId) {
    const existing = await findSesameEmployeeByUser(user);
    sesameId = existing?.id || null;
  }

  if (!sesameId) return { action: "not-found" };

  const deleted = await sesameService.deleteEmployee(sesameId);
  await User.updateOne({ _id: user._id }, { $set: { userIdSesame: null } });

  return { action: "deleted", sesameId: String(sesameId), data: deleted };
};

const syncSesameEmployeeForUser = async (userId, options = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (user.employmentStatus === "ya no trabaja con nosotros") return disableSesameEmployeeForUser(userId);
  if (user.employmentStatus === "activo") return ensureSesameEmployeeForUser(userId, options);

  return { action: "skip-status", status: user.employmentStatus };
};

const createSesameOfficeFromDispositive = async (dispositiveId) => {
  const dispositive = await getDispositiveForSesame(dispositiveId);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);
  return sesameService.createOffice(buildSesameOfficeFromDispositive(dispositive));
};

const createSesameOfficeFromDispositiveAndSave = async (dispositiveId) => {
  const dispositive = await getDispositiveForSesame(dispositiveId);
  if (dispositive.officeIdSesame) throw new ClientError("El dispositivo ya tiene una oficina enlazada en Sesame", 409);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);

  const createdOffice = await sesameService.createOffice(buildSesameOfficeFromDispositive(dispositive));
  const officeId = createdOffice?.data?.id;
  if (!officeId) throw new ClientError("Sesame creó la oficina pero no devolvió un identificador reconocible", 500);

  await Dispositive.findByIdAndUpdate(dispositiveId, { $set: { officeIdSesame: String(officeId) } });
  return createdOffice;
};

const updateSesameOfficeFromDispositiveSaved = async (dispositiveId) => {
  const dispositive = await getDispositiveForSesame(dispositiveId);
  if (!dispositive.officeIdSesame) throw new ClientError("El dispositivo no tiene officeIdSesame", 400);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);

  return sesameService.updateOffice(dispositive.officeIdSesame, buildSesameOfficeFromDispositive(dispositive));
};

const syncSesameOfficeFromDispositive = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId).lean();
  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);

  if (dispositive.officeIdSesame) return updateSesameOfficeFromDispositiveSaved(dispositiveId);
  return createSesameOfficeFromDispositiveAndSave(dispositiveId);
};

const deleteSesameOfficeForDispositive = async (dispositiveId, { clearField = true } = {}) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId).lean();
  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!dispositive.officeIdSesame) return { action: "not-found" };

  const deleted = await sesameService.deleteOffice(dispositive.officeIdSesame);
  if (clearField) await Dispositive.updateOne({ _id: dispositiveId }, { $set: { officeIdSesame: null } });

  return { action: "deleted", officeIdSesame: String(dispositive.officeIdSesame), data: deleted };
};

const syncSesameOfficeForDispositive = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId).lean();
  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);

  if (dispositive.active === false) return deleteSesameOfficeForDispositive(dispositiveId);
  return syncSesameOfficeFromDispositive(dispositiveId);
};

const getSesameEmployeeContext = async (employeeId) => {
  if (!employeeId) return null;

  const employeeResponse = await sesameService.getEmployeeById(employeeId);
  const employee = employeeResponse?.data || null;
  if (!employee) return null;

  const [officeAssignationsResponse, departmentAssignationsResponse, absencesManagersResponse, checksManagersResponse, roleAssignationsResponse] = await Promise.all([
    sesameService.getEmployeeOfficeAssignations({ employeeId, limit: 20, page: 1 }),
    sesameService.getDepartmentEmployees({ employeeId, limit: 50, page: 1 }),
    sesameService.getEmployeeManagers({ employeeId, permission: "absencesManagement", limit: 20, page: 1 }),
    sesameService.getEmployeeManagers({ employeeId, permission: "checksManageRequestsAndIncidences", limit: 20, page: 1 }),
    sesameService.listEmployeeRoleAssignations(employeeId, { limit: 100, page: 1 }),
  ]);

  const officeAssignations = officeAssignationsResponse?.data || [];
  const departmentAssignations = departmentAssignationsResponse?.data || [];
  const absencesManagers = absencesManagersResponse?.data || [];
  const checksManagers = checksManagersResponse?.data || [];
  const roleAssignations = roleAssignationsResponse?.data || [];

  const mainOfficeAssignation = officeAssignations.find((x) => x?.isMainOffice) || officeAssignations[0] || null;

  const officeRoleAssignations = roleAssignations.filter((x) => x?.affectedEntityType === "office");
  const departmentRoleAssignations = roleAssignations.filter((x) => x?.affectedEntityType === "department");
  const managedOfficeRoleAssignations = officeRoleAssignations.filter((x) => x?.role?.name === "Workplace administrator");
  const managedDepartmentRoleAssignations = departmentRoleAssignations.filter((x) => String(x?.role?.name || "").toLowerCase().includes("department"));

  const managedOfficeIds = [...new Set(managedOfficeRoleAssignations.map((x) => x?.affectedEntityId).filter(Boolean))];
  const managedDepartmentIds = [...new Set(managedDepartmentRoleAssignations.map((x) => x?.affectedEntityId).filter(Boolean))];

  const managedDepartmentResponsibilities = managedDepartmentIds.length ? await SesameResponsibility.find({ active: true, responsibilityType: "department_manager", entityType: "department", entityIdSesame: { $in: managedDepartmentIds } }).select("entityIdSesame entityName").lean() : [];
  const departmentNameById = {};
  managedDepartmentResponsibilities.forEach((item) => { if (item?.entityIdSesame && item?.entityName) departmentNameById[String(item.entityIdSesame)] = item.entityName; });

  const mapOffice = (assignation) => {
    const office = assignation?.office || null;
    if (!office) return null;
    return {
      id: office.id || null,
      name: office.name || "",
      address: office.address || "",
      coordinates: office.coordinates || null,
      description: office.description || "",
      radio: office.radio ?? null,
      defaultEmployeesDateTimeZone: office.defaultEmployeesDateTimeZone || "",
      isDeleted: office.isDeleted ?? false,
      isMainOffice: assignation?.isMainOffice ?? false,
      assignationId: assignation?.id || null,
      raw: office,
    };
  };

  const mapDepartment = (assignation) => {
    const department = assignation?.department || null;
    if (!department) return null;
    return {
      id: department.id || assignation?.departmentId || null,
      name: department.name || "",
      code: department.code ?? null,
      assignationId: assignation?.id || null,
      raw: department,
      rawAssignation: assignation,
    };
  };

  const mapManager = (item) => {
    const manager = item?.manager || null;
    if (!manager) return null;
    return {
      id: manager.id || null,
      firstName: manager.firstName || "",
      lastName: manager.lastName || "",
      fullName: [manager.firstName, manager.lastName].filter(Boolean).join(" ").trim(),
      email: manager.email || "",
      phone: manager.phone || "",
      workStatus: manager.workStatus || "",
      code: manager.code ?? null,
      permission: item?.permission || "",
      raw: manager,
    };
  };

  const mapRole = (item) => item ? {
    id: item.id || null,
    affectedEntityId: item.affectedEntityId || null,
    affectedEntityType: item.affectedEntityType || "",
    role: { id: item?.role?.id || null, name: item?.role?.name || "" },
    raw: item,
  } : null;

  const mapDepartmentRole = (item) => item ? {
    id: item.id || null,
    affectedEntityId: item.affectedEntityId || null,
    affectedEntityType: item.affectedEntityType || "",
    entityName: item?.entityName || item?.department?.name || "",
    role: { id: item?.role?.id || null, name: item?.role?.name || "" },
    raw: item,
  } : null;

  return {
    employee: {
      id: employee.id || null,
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      fullName: [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim(),
      email: employee.email || "",
      dni: employee.nid || "",
      code: employee.code ?? null,
      status: employee.status || "",
    },
    office: mapOffice(mainOfficeAssignation),
    officeAssignations: officeAssignations.map(mapOffice).filter(Boolean),
    departmentAssignations: departmentAssignations.map(mapDepartment).filter(Boolean),
    managers: {
      absencesManagement: absencesManagers.map(mapManager).filter(Boolean),
      checksManageRequestsAndIncidences: checksManagers.map(mapManager).filter(Boolean),
    },
    roles: {
      all: roleAssignations.map(mapRole).filter(Boolean),
      admin: roleAssignations.some((item) => {
        const roleName = String(item?.role?.name || "").toLowerCase();
        return roleName === "owner" || roleName.includes("admin");
      }),
      offices: officeRoleAssignations.map(mapRole).filter(Boolean),
      departments: departmentRoleAssignations.map(mapDepartmentRole).filter(Boolean),
      managedOffices: managedOfficeRoleAssignations.map(mapRole).filter(Boolean),
      managedOfficeIds,
      managedDepartments: managedDepartmentRoleAssignations.map((item) => ({
        ...mapDepartmentRole(item),
        entityName: departmentNameById[String(item?.affectedEntityId)] || item?.department?.name || "",
      })).filter(Boolean),
      managedDepartmentIds,
    },
  };
};

const postSesameGetEmployeeContext = async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) throw new ClientError("Falta employeeId", 400);

  const userAux = await User.findById(employeeId);
  if (!userAux) throw new ClientError("Usuario no encontrado", 404);
  if (!userAux.userIdSesame) throw new ClientError("Error, el usuario no está dado de alta en sésame", 400);

  const data = await getSesameEmployeeContext(userAux.userIdSesame);
  if (!data) throw new ClientError("Error al obtener el usuario en sesame", 400);

  response(res, 200, data);
};

const postSesameListEmployees = async (req, res) => {
  const { dni, email, code, limit, page, orderBy, status, officeIds, params = {} } = req.body || {};
  const finalParams = { ...params };

  if (dni !== undefined) finalParams.dni = String(dni).trim();
  if (email !== undefined) finalParams.email = String(email).trim();
  if (code !== undefined) finalParams.code = Number(code);
  if (limit !== undefined) finalParams.limit = Number(limit);
  if (page !== undefined) finalParams.page = Number(page);
  if (orderBy !== undefined) finalParams.orderBy = String(orderBy);
  if (status !== undefined) finalParams.status = String(status);
  if (Array.isArray(officeIds)) finalParams.officeIds = officeIds;

  const data = await sesameService.listEmployees(finalParams);
  response(res, 200, data);
};

const postSesameGetEmployee = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);
  response(res, 200, await sesameService.getEmployeeById(id));
};

const postSesameListOffices = async (req, res) => {
  const { name, limit, page, orderBy, params = {} } = req.body || {};
  const finalParams = { ...params };

  if (name !== undefined) finalParams.name = String(name).trim();
  if (limit !== undefined) finalParams.limit = Number(limit);
  if (page !== undefined) finalParams.page = Number(page);
  if (orderBy !== undefined) finalParams.orderBy = String(orderBy);

  response(res, 200, await sesameService.listOffices(finalParams));
};

const postSesameGetOffice = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);
  response(res, 200, await sesameService.getOfficeById(id));
};

const postSesameAssignEmployeeOffice = async (req, res) => {
  const { employeeId, officeId, isMainOffice } = req.body;
  if (!employeeId || !officeId) throw new ClientError("employeeId y officeId son obligatorios", 400);

  
  response(res, 200, await assignEmployeeToScope({ scopeType: "office", scopeId: officeId, userId: employeeId, isMainOffice }));
};

const postSesameDeleteEmployeeOfficeAssignation = async (req, res) => {
  const { employeeId, officeId } = req.body;
  if (!employeeId || !officeId) throw new ClientError("employeeId y officeId son obligatorios", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(employeeId, "Usuario");
  response(res, 200, await sesameService.deleteEmployeeOfficeAssignation({ employeeId: employeeIdSesame, officeId }));
};

const postSesameAssignOfficeEmployee = async (req, res) => {
  const { officeId, userId, isMainOffice } = req.body || {};
  response(res, 200, await assignEmployeeToScope({ scopeType: "office", scopeId: officeId, userId, isMainOffice }));
};

const postSesameDeleteOfficeEmployee = async (req, res) => {
  const { officeId, userId } = req.body || {};
  response(res, 200, await deleteEmployeeFromScope({ scopeType: "office", scopeId: officeId, userId }));
};

const postSesameGetOfficeEmployees = async (req, res) => {
  const { officeId, limit, page } = req.body || {};

  const employees = await listEmployeesByScope({ scopeType: "office", scopeId: officeId, limit: limit ? Number(limit) : 200, page: page ? Number(page) : 1 });
  const sesameIds = employees.map((x) => String(x.employeeId || "")).filter(Boolean);

  const users = await User.find({ userIdSesame: { $in: sesameIds } }).select("_id userIdSesame").lean();
  const usersBySesameId = {};
  users.forEach((u) => { if (u?.userIdSesame) usersBySesameId[String(u.userIdSesame)] = u; });

  response(res, 200, {
    officeId,
    employees: employees.map((item) => ({ ...item, userId: usersBySesameId[String(item.employeeId)]?._id || null })),
    total: employees.length,
  });
};

const postSesameAssignDepartmentEmployee = async (req, res) => {
  const { departmentId, userId } = req.body || {};
  response(res, 200, await assignEmployeeToScope({ scopeType: "department", scopeId: departmentId, userId }));
};

const removeAllEmployeesFromDepartment = async ({ departmentId }) => {
  if (!departmentId) throw new ClientError("Falta departmentId", 400);

  const currentEmployees = await listEmployeesByScope({ scopeType: "department", scopeId: departmentId, limit: 500, page: 1 });
  const removed = [];
  const errors = [];

  for (const employee of currentEmployees) {
    try {
      if (!employee?.employeeId) continue;
      await sesameService.deleteEmployeeDepartmentAssignation({ employeeId: employee.employeeId, departmentId });
      removed.push({ employeeIdSesame: employee.employeeId, fullName: employee.fullName || "", email: employee.email || "" });
    } catch (error) {
      errors.push({ employeeIdSesame: employee?.employeeId || null, fullName: employee?.fullName || "", message: error?.message || "Error quitando empleado del departamento" });
    }
  }

  return { removed, errors, totalRemoved: removed.length, totalErrors: errors.length };
};

const postSesameDeleteDepartmentEmployee = async (req, res) => {
  const { departmentId, userId } = req.body || {};
  response(res, 200, await deleteEmployeeFromScope({ scopeType: "department", scopeId: departmentId, userId }));
};

const postSesameGetDepartmentEmployees = async (req, res) => {
  const { departmentId, limit, page } = req.body || {};

  const employees = await listEmployeesByScope({ scopeType: "department", scopeId: departmentId, limit: limit ? Number(limit) : 200, page: page ? Number(page) : 1 });
  const sesameIds = employees.map((x) => String(x.employeeId || "")).filter(Boolean);

  const users = await User.find({ userIdSesame: { $in: sesameIds } }).select("_id userIdSesame").lean();
  const usersBySesameId = {};
  users.forEach((u) => { if (u?.userIdSesame) usersBySesameId[String(u.userIdSesame)] = u; });

  response(res, 200, {
    departmentId,
    employees: employees.map((item) => ({ ...item, userId: usersBySesameId[String(item.employeeId)]?._id || null })),
    total: employees.length,
  });
};

const postSesameAssignEmployeeOfficeRole = async (req, res) => {
  const { employeeId, officeId } = req.body;
  if (!employeeId || !officeId) throw new ClientError("employeeId y officeId son obligatorios", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(employeeId, "Usuario");
  const result = await sesameService.assignRoleToEmployee({ roleId: SESAME_ROLE_IDS.WORKPLACE_ADMIN, employeeId: employeeIdSesame, entityAffectedId: officeId });

  await upsertOfficeManagerResponsibility({ userId: employeeId, officeIdSesame: officeId, roleAssignation: result });

  response(res, 200, result);
};

const postSesameDeleteEmployeeOfficeRole = async (req, res) => {
  const { assignationId } = req.body;
  if (!assignationId) throw new ClientError("Falta assignationId", 400);

  const result = await sesameService.unassignRoleFromEmployee({ assignationId });
  await removeOfficeManagerResponsibility({ assignationId });

  response(res, 200, result);
};

const syncSesameResponsibilities = async ({ startFrom = 0, limitUsers = 20, delayMs = 600 } = {}) => {
  const syncedAt = new Date();

  const users = await User.find({ userIdSesame: { $exists: true, $ne: null } }).select("_id userIdSesame firstName lastName email").sort({ _id: 1 }).skip(startFrom).limit(limitUsers).lean();
  const dispositives = await Dispositive.find({ officeIdSesame: { $exists: true, $ne: null } }).select("_id name program officeIdSesame").lean();

  const dispositiveByOfficeId = new Map();
  for (const dispositive of dispositives) if (dispositive?.officeIdSesame) dispositiveByOfficeId.set(String(dispositive.officeIdSesame), dispositive);

  const docs = [];
  const errors = [];

  for (const user of users) {
    try {
      const sesameEmployeeId = String(user.userIdSesame || "").trim();
      if (!sesameEmployeeId) continue;

      const employeeResponse = await sesameService.getEmployeeById(sesameEmployeeId);
      await sleep(delayMs);

      const roleAssignationsResponse = await sesameService.listEmployeeRoleAssignations(sesameEmployeeId, { limit: 200, page: 1 });
      await sleep(delayMs);

      const employee = employeeResponse?.data || null;
      const roleAssignations = roleAssignationsResponse?.data || [];
      if (!employee || !Array.isArray(roleAssignations) || !roleAssignations.length) continue;

      for (const roleAssignation of roleAssignations) {
        const roleId = String(roleAssignation?.role?.id || "");
        const roleName = String(roleAssignation?.role?.name || "");
        const affectedEntityType = String(roleAssignation?.affectedEntityType || "");
        const affectedEntityId = String(roleAssignation?.affectedEntityId || "");
        const roleAssignationId = String(roleAssignation?.id || "");
        if (!roleId || !affectedEntityType || !affectedEntityId) continue;

        let responsibilityType = null;
        let entityType = null;
        let entityName = "";
        let dispositiveId = null;
        let programId = null;
        let departmentExternalKey = null;

        if (roleId === String(SESAME_ROLE_IDS.ADMIN) || roleName.toLowerCase() === "owner") {
          responsibilityType = "company_admin";
          entityType = "company";
          entityName = employee?.company?.name || "";
        } else if (roleId === String(SESAME_ROLE_IDS.WORKPLACE_ADMIN) && affectedEntityType === "office") {
          responsibilityType = "office_manager";
          entityType = "office";
          const dispositive = dispositiveByOfficeId.get(affectedEntityId) || null;
          entityName = dispositive?.name || "";
          dispositiveId = dispositive?._id || null;
          programId = dispositive?.program || null;
        } else if (roleId === String(SESAME_ROLE_IDS.DEPARTMENT_ADMIN) && affectedEntityType === "department") {
          responsibilityType = "department_manager";
          entityType = "department";
          entityName = roleAssignation?.department?.name || "";
          departmentExternalKey = affectedEntityId;
        } else continue;

        docs.push({
          userId: user._id,
          employeeIdSesame: sesameEmployeeId,
          employeeCodeSesame: Number.isFinite(Number(employee?.code)) ? Number(employee.code) : null,
          employeeName: [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          employeeEmail: String(employee?.email || user?.email || "").trim().toLowerCase(),
          responsibilityType,
          roleAssignationIdSesame: roleAssignationId || null,
          roleIdSesame: roleId || null,
          roleName,
          entityType,
          entityIdSesame: affectedEntityId,
          entityName,
          dispositiveId,
          programId,
          departmentExternalKey,
          active: true,
          syncedAt,
          raw: roleAssignation,
        });
      }
    } catch (error) {
      errors.push({ userId: String(user?._id || ""), employeeIdSesame: String(user?.userIdSesame || ""), message: error?.message || "Error desconocido" });
    }
  }

  const uniqueDocsMap = new Map();
  for (const doc of docs) uniqueDocsMap.set([String(doc.userId), doc.responsibilityType, doc.entityIdSesame].join("::"), doc);

  const finalDocs = [...uniqueDocsMap.values()];
  for (const doc of finalDocs) await SesameResponsibility.updateOne({ userId: doc.userId, responsibilityType: doc.responsibilityType, entityIdSesame: doc.entityIdSesame }, { $set: doc }, { upsert: true });

  return { ok: true, startFrom, processedUsers: users.length, totalResponsibilitiesBuilt: docs.length, totalResponsibilitiesSaved: finalDocs.length, totalErrors: errors.length, errors };
};

const postSesameUpdateEmployeeManagersByEmployee = async (req, res) => {
  const body = req.body || {};
  const { employeeIdSesame, absencesManagerUserId, checksManagerUserId } = body;

  if (!employeeIdSesame) throw new ClientError("Falta employeeIdSesame", 400);

  let currentAbsencesRes = false;
  let currentChecksRes = false;

  if (!!absencesManagerUserId) currentAbsencesRes = await sesameService.getEmployeeManagers({ employeeId: employeeIdSesame, permission: "absencesManagement", limit: 200, page: 1 });
  if (!!checksManagerUserId) currentChecksRes = await sesameService.getEmployeeManagers({ employeeId: employeeIdSesame, permission: "checksManageRequestsAndIncidences", limit: 200, page: 1 });

  const currentAbsences = currentAbsencesRes?.data || [];
  const currentChecks = currentChecksRes?.data || [];

  if (!!currentAbsences.length) for (const element of currentAbsences) try { if (!!element?.id) await sesameService.deleteEmployeeManager(element.id); } catch (error) { console.log(error); }
  if (!!currentChecks.length) for (const element of currentChecks) try { if (!!element?.id) await sesameService.deleteEmployeeManager(element.id); } catch (error) { console.log(error); }

  const absencesManagerSesameId = !!absencesManagerUserId ? await resolveManagerSesameIdFromUser(absencesManagerUserId) : null;
  const checksManagerSesameId = !!checksManagerUserId ? await resolveManagerSesameIdFromUser(checksManagerUserId) : null;

  let assignedAbsencesManagement = null;
  let assignedChecksManageRequestsAndIncidences = null;

  if (!!absencesManagerSesameId) assignedAbsencesManagement = await sesameService.assignEmployeeManager({ employeeId: employeeIdSesame, managerId: absencesManagerSesameId, permission: "absencesManagement", order: 0 });
  if (!!checksManagerSesameId) assignedChecksManageRequestsAndIncidences = await sesameService.assignEmployeeManager({ employeeId: employeeIdSesame, managerId: checksManagerSesameId, permission: "checksManageRequestsAndIncidences", order: 0 });

  response(res, 200, {
    absencesManagement: { removedPrevious: currentAbsences.length, assigned: assignedAbsencesManagement },
    checksManageRequestsAndIncidences: { removedPrevious: currentChecks.length, assigned: assignedChecksManageRequestsAndIncidences },
  });
};

const postSesameEligibleManagersByEmployee = async (req, res) => {
  const { employeeIdSesame, query = "", userIdToExclude = null } = req.body || {};
  if (!employeeIdSesame) throw new ClientError("Falta employeeIdSesame", 400);

  const employeeOfficeRes = await sesameService.getEmployeeOfficeAssignations({ employeeId: employeeIdSesame, limit: 50, page: 1 });
  const employeeOfficeItems = employeeOfficeRes?.data || [];
  const officeIds = [...new Set(employeeOfficeItems.map((x) => x?.office?.id || x?.officeId || null).filter(Boolean))];

  const employeeDepartmentRes = await sesameService.getDepartmentEmployees({ employeeId: employeeIdSesame, limit: 50, page: 1 });
  const employeeDepartmentItems = employeeDepartmentRes?.data || [];
  const departmentIds = [...new Set(employeeDepartmentItems.map((x) => x?.department?.id || x?.departmentId || null).filter(Boolean))];

  const orConditions = [{ responsibilityType: "company_admin", entityType: "company" }];
  if (officeIds.length) orConditions.push({ responsibilityType: "office_manager", entityType: "office", entityIdSesame: { $in: officeIds } });
  if (departmentIds.length) orConditions.push({ responsibilityType: "department_manager", entityType: "department", entityIdSesame: { $in: departmentIds } });

  const responsibles = await SesameResponsibility.find({ active: true, $or: orConditions }).select("userId employeeIdSesame employeeName employeeEmail responsibilityType entityType entityIdSesame").lean();
  const userIds = [...new Set(responsibles.map((x) => String(x.userId || "")).filter(Boolean))];

  let users = await User.find({ _id: { $in: userIds }, userIdSesame: { $exists: true, $ne: null } }).select("_id firstName lastName email userIdSesame").lean();

  users = users.filter((u) => {
    if (userIdToExclude && String(u._id) === String(userIdToExclude)) return false;
    if (String(u.userIdSesame) === String(employeeIdSesame)) return false;
    return true;
  });

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    users = users.filter((u) => {
      const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });
  }

  response(res, 200, { users });
};

const ensureSesameDepartmentForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("El usuario no está dado de alta en Sesame", 400);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  if (!name) throw new ClientError("El usuario no tiene nombre suficiente para crear el departamento", 400);

  const res = await sesameService.listDepartments({ name, limit: 100, page: 1 });
  const items = res?.data || [];
  const existingDepartment = items.find((item) => String(item?.name || "").trim().toLowerCase() === name.toLowerCase()) || null;

  if (existingDepartment) {
    const departmentId = existingDepartment?.id;
    if (!departmentId) throw new ClientError("Se encontró un departamento existente pero sin id reconocible", 500);
    return { user, departmentId: String(departmentId), created: existingDepartment, reused: true };
  }

  const created = await sesameService.createDepartment({ companyId: SESAME_COMPANY_ID, name });
  const departmentId = created?.id;
  if (!departmentId) throw new ClientError("Sesame creó el departamento pero no devolvió id", 500);

  return { user, departmentId: String(departmentId), created, reused: false };
};

const findDepartmentAdminRoleAssignation = async ({ userId, departmentId }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!departmentId) throw new ClientError("Falta departmentId", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(userId, "Usuario");
  const rolesRes = await sesameService.listEmployeeRoleAssignations(employeeIdSesame, { limit: 200, page: 1 });
  const roles = rolesRes?.data || [];

  return roles.find((item) => item?.affectedEntityType === "department" && String(item?.affectedEntityId) === String(departmentId) && String(item?.role?.id) === String(SESAME_ROLE_IDS.DEPARTMENT_ADMIN)) || null;
};

const assignDepartmentAdminRoleToUser = async ({ userId, departmentId }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!departmentId) throw new ClientError("Falta departmentId", 400);

  const { employeeIdSesame } = await getSesameEmployeeIdFromLocalUser(userId, "Usuario");
  return sesameService.assignRoleToEmployee({ roleId: SESAME_ROLE_IDS.DEPARTMENT_ADMIN, employeeId: employeeIdSesame, entityAffectedId: departmentId });
};

const ensureDepartmentAdminRoleToUser = async ({ userId, departmentId }) => {
  const existingRoleAssignation = await findDepartmentAdminRoleAssignation({ userId, departmentId });
  if (existingRoleAssignation?.id) return { reused: true, roleAssignation: existingRoleAssignation };

  const createdRoleAssignation = await assignDepartmentAdminRoleToUser({ userId, departmentId });
  return { reused: false, roleAssignation: createdRoleAssignation };
};

const createSesameDepartmentForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("El usuario no está dado de alta en Sesame", 400);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  if (!name) throw new ClientError("El usuario no tiene nombre suficiente para crear el departamento", 400);

  const created = await sesameService.createDepartment({ companyId: SESAME_COMPANY_ID, name });
  const departmentId = created?.data?.id;
  if (!departmentId) throw new ClientError("Sesame creó el departamento pero no devolvió id", 500);

  return { user, departmentId: String(departmentId), created };
};

const moveAllEmployeesBetweenDepartments = async ({ fromDepartmentId, toDepartmentId }) => {
  if (!fromDepartmentId) throw new ClientError("Falta fromDepartmentId", 400);
  if (!toDepartmentId) throw new ClientError("Falta toDepartmentId", 400);

  const currentEmployees = await listEmployeesByScope({ scopeType: "department", scopeId: fromDepartmentId, limit: 500, page: 1 });
  const moved = [];
  const errors = [];

  for (const employee of currentEmployees) {
    try {
      if (!employee?.employeeId) continue;
      await sesameService.assignEmployeeDepartment({ employeeId: employee.employeeId, departmentId: toDepartmentId });
      await sesameService.deleteEmployeeDepartmentAssignation({ employeeId: employee.employeeId, departmentId: fromDepartmentId });
      moved.push({ employeeIdSesame: employee.employeeId, fullName: employee.fullName || "", email: employee.email || "" });
    } catch (error) {
      errors.push({ employeeIdSesame: employee?.employeeId || null, fullName: employee?.fullName || "", message: error.message || "Error moviendo empleado" });
    }
  }

  return { moved, errors, totalMoved: moved.length, totalErrors: errors.length };
};

const postSesameCreateDepartmentForUser = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) throw new ClientError("Falta userId", 400);

  const { user, departmentId, created } = await createSesameDepartmentForUser(userId);

  const roleAssignation = await assignDepartmentAdminRoleToUser({ userId, departmentId });

  await upsertDepartmentManagerResponsibility({ userId, departmentIdSesame: departmentId, roleAssignation });

  response(res, 200, {
    ok: true,
    departmentId,
    departmentName: [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim(),
    department: created,
    roleAssignation,
  });
};

const postSesameDeleteDepartment = async (req, res) => {
  const { departmentId, userId } = req.body || {};
  if (!departmentId) throw new ClientError("Falta departmentId", 400);

  if (userId) {
    const roleAssignation = await findDepartmentAdminRoleAssignation({ userId, departmentId });

    if (roleAssignation?.id) {
      await sesameService.unassignRoleFromEmployee({ assignationId: roleAssignation.id });
      await removeDepartmentManagerResponsibility({ assignationId: roleAssignation.id, userId, departmentIdSesame: departmentId });
    }
  }

  const cleanupResult = await removeAllEmployeesFromDepartment({ departmentId });
  if (cleanupResult.totalErrors > 0) throw new ClientError("No se pudo vaciar completamente el departamento antes de eliminarlo", 409);

  const deleted = await sesameService.deleteDepartment(departmentId);
  response(res, 200, { ok: true, departmentId, cleanupResult, deleted });
};

const postSesameTransferDepartment = async (req, res) => {
  const { fromDepartmentId, fromUserId = null, toUserId, deleteOldDepartment = false } = req.body || {};
  if (!fromDepartmentId) throw new ClientError("Falta fromDepartmentId", 400);
  if (!toUserId) throw new ClientError("Falta toUserId", 400);

  const { user: newUser, departmentId: newDepartmentId, created, reused } = await ensureSesameDepartmentForUser(toUserId);
  if (String(newDepartmentId) === String(fromDepartmentId)) throw new ClientError("El departamento de destino coincide con el de origen", 409);

  const { reused: reusedRoleAssignation, roleAssignation: newRoleAssignation } = await ensureDepartmentAdminRoleToUser({ userId: toUserId, departmentId: newDepartmentId });

  await upsertDepartmentManagerResponsibility({ userId: toUserId, departmentIdSesame: newDepartmentId, roleAssignation: newRoleAssignation });

  const moveResult = await moveAllEmployeesBetweenDepartments({ fromDepartmentId, toDepartmentId: newDepartmentId });

  let oldRoleRemoved = false;
  if (fromUserId) {
    const oldRoleAssignation = await findDepartmentAdminRoleAssignation({ userId: fromUserId, departmentId: fromDepartmentId });

    if (oldRoleAssignation?.id) {
      await sesameService.unassignRoleFromEmployee({ assignationId: oldRoleAssignation.id });
      await removeDepartmentManagerResponsibility({ assignationId: oldRoleAssignation.id, userId: fromUserId, departmentIdSesame: fromDepartmentId });
      oldRoleRemoved = true;
    }
  }

  let oldDepartmentDeleted = false;
  let oldDepartmentCleanup = null;

  if (deleteOldDepartment) {
    oldDepartmentCleanup = await removeAllEmployeesFromDepartment({ departmentId: fromDepartmentId });
    if (oldDepartmentCleanup.totalErrors > 0) throw new ClientError("No se pudo vaciar completamente el departamento antiguo antes de eliminarlo", 409);

    await sesameService.deleteDepartment(fromDepartmentId);
    oldDepartmentDeleted = true;
  }

  response(res, 200, {
    ok: true,
    fromDepartmentId,
    newDepartmentId,
    newDepartmentName: [newUser?.firstName, newUser?.lastName].filter(Boolean).join(" ").trim(),
    newDepartment: created,
    reusedDepartment: reused,
    reusedRoleAssignation,
    newRoleAssignation,
    oldRoleRemoved,
    oldDepartmentDeleted,
    oldDepartmentCleanup,
    moveResult,
  });
};
const postSesameToggleEmployeeForUser = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  let existingSesame = null;

  if (user.userIdSesame) {
    existingSesame = await sesameService.getEmployeeById(user.userIdSesame).catch(() => null);
    existingSesame = existingSesame?.data || null;
  }

  if (!existingSesame) existingSesame = await findSesameEmployeeByUser(user);

if (!existingSesame) {
  const created = await ensureSesameEmployeeForUser(userId, { status: "active" });

  if (!created?.sesameId) {
    response(res, 200, { ok: false, action: created?.action || "not-created", sesameId: null, data: created });
    return;
  }

  response(res, 200, { ok: true, action: created?.action || "created", sesameId: created.sesameId, data: created });
  return;
}

  const sesameId = existingSesame?.id;
  if (!sesameId) throw new ClientError("No se encontró el id del empleado en Sesame", 500);

  const currentStatus = String(existingSesame?.status || "").toLowerCase();
  const nextStatus = currentStatus === "active" ? "inactive" : "active";

  const updated = await sesameService.updateEmployee(
    sesameId,
    { ...buildSesameEmployeeFromUser(user), status: nextStatus }
  );

  if (!user.userIdSesame || String(user.userIdSesame) !== String(sesameId)) {
    await User.updateOne({ _id: user._id }, { $set: { userIdSesame: String(sesameId) } });
  }

  response(res, 200, {
    ok: true,
    action: currentStatus === "active" ? "disabled" : "enabled",
    sesameId: String(sesameId),
    data: updated
  });
};

const postSesameInviteEmployeeForUser = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const result = await ensureSesameEmployeeForUser(userId, { status: "active" });
  response(res, 200, { ok: true, action: "invited", sesameId: result?.sesameId || null, data: result });
};

const upsertOfficeManagerResponsibility = async ({ userId, officeIdSesame, roleAssignation = null }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!officeIdSesame) throw new ClientError("Falta officeIdSesame", 400);

  const user = await User.findById(userId).select("_id userIdSesame email firstName lastName").lean();
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("Usuario sin userIdSesame", 400);

  const [employeeResponse, dispositive] = await Promise.all([
    sesameService.getEmployeeById(String(user.userIdSesame)),
    Dispositive.findOne({ officeIdSesame: String(officeIdSesame) }).select("_id name program officeIdSesame").lean(),
  ]);

  const employee = employeeResponse?.data || null;
  const roleIdSesame = roleAssignation?.role?.id || SESAME_ROLE_IDS.WORKPLACE_ADMIN;
  const roleName = roleAssignation?.role?.name || "Workplace administrator";
  const roleAssignationIdSesame = roleAssignation?.id || null;

  await SesameResponsibility.updateOne(
    { userId: user._id, responsibilityType: "office_manager", entityIdSesame: String(officeIdSesame) },
    {
      $set: {
        userId: user._id,
        employeeIdSesame: String(user.userIdSesame),
        employeeCodeSesame: Number.isFinite(Number(employee?.code)) ? Number(employee.code) : null,
        employeeName: [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        employeeEmail: String(employee?.email || user?.email || "").trim().toLowerCase(),
        responsibilityType: "office_manager",
        roleAssignationIdSesame,
        roleIdSesame: String(roleIdSesame || ""),
        roleName: String(roleName || ""),
        entityType: "office",
        entityIdSesame: String(officeIdSesame),
        entityName: dispositive?.name || "",
        dispositiveId: dispositive?._id || null,
        programId: dispositive?.program || null,
        departmentExternalKey: null,
        active: true,
        syncedAt: new Date(),
        raw: roleAssignation || null,
      },
    },
    { upsert: true }
  );
};

const removeOfficeManagerResponsibility = async ({ assignationId = null, userId = null, officeIdSesame = null }) => {
  const query = { responsibilityType: "office_manager", entityType: "office" };
  if (assignationId) query.roleAssignationIdSesame = String(assignationId);
  if (userId) query.userId = userId;
  if (officeIdSesame) query.entityIdSesame = String(officeIdSesame);
  if (!query.roleAssignationIdSesame && !query.userId && !query.entityIdSesame) throw new ClientError("Faltan datos para eliminar la responsabilidad de oficina", 400);

  await SesameResponsibility.deleteMany(query);
};

const upsertDepartmentManagerResponsibility = async ({ userId, departmentIdSesame, roleAssignation = null }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!departmentIdSesame) throw new ClientError("Falta departmentIdSesame", 400);

  const user = await User.findById(userId).select("_id userIdSesame email firstName lastName").lean();
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("Usuario sin userIdSesame", 400);

  const employeeResponse = await sesameService.getEmployeeById(String(user.userIdSesame));
  const employee = employeeResponse?.data || null;

  const roleIdSesame = roleAssignation?.role?.id || SESAME_ROLE_IDS.DEPARTMENT_ADMIN;
  const roleName = roleAssignation?.role?.name || "Department administrator";
  const roleAssignationIdSesame = roleAssignation?.id || null;

  let entityName = String(roleAssignation?.department?.name || "").trim();

  if (!entityName) {
    const departmentsRes = await sesameService.listDepartments({ limit: 100, page: 1 });
    const departments = departmentsRes?.data || [];
    const department = departments.find((item) => String(item?.id || "") === String(departmentIdSesame));
    entityName = String(department?.name || "").trim();
  }

  await SesameResponsibility.updateOne(
    { userId: user._id, responsibilityType: "department_manager", entityIdSesame: String(departmentIdSesame) },
    {
      $set: {
        userId: user._id,
        employeeIdSesame: String(user.userIdSesame),
        employeeCodeSesame: Number.isFinite(Number(employee?.code)) ? Number(employee.code) : null,
        employeeName: [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        employeeEmail: String(employee?.email || user?.email || "").trim().toLowerCase(),
        responsibilityType: "department_manager",
        roleAssignationIdSesame,
        roleIdSesame: String(roleIdSesame || ""),
        roleName: String(roleName || ""),
        entityType: "department",
        entityIdSesame: String(departmentIdSesame),
        entityName,
        dispositiveId: null,
        programId: null,
        departmentExternalKey: String(departmentIdSesame),
        active: true,
        syncedAt: new Date(),
        raw: roleAssignation || null,
      },
    },
    { upsert: true }
  );
};

const removeDepartmentManagerResponsibility = async ({ assignationId = null, userId = null, departmentIdSesame = null }) => {
  const query = { responsibilityType: "department_manager", entityType: "department" };
  if (assignationId) query.roleAssignationIdSesame = String(assignationId);
  if (userId) query.userId = userId;
  if (departmentIdSesame) query.entityIdSesame = String(departmentIdSesame);
  if (!query.roleAssignationIdSesame && !query.userId && !query.entityIdSesame) throw new ClientError("Faltan datos para eliminar la responsabilidad de departamento", 400);

  await SesameResponsibility.deleteMany(query);
};
const postSesameGetOfficeManagers = async (req, res) => {
  const { officeId } = req.body || {};
  if (!officeId) throw new ClientError("Falta officeId", 400);

  const managers = await SesameResponsibility.find({
    active: true,
    responsibilityType: "office_manager",
    entityType: "office",
    entityIdSesame: String(officeId),
  })
    .select(
      "userId employeeIdSesame employeeName employeeEmail roleAssignationIdSesame roleName entityIdSesame entityName"
    )
    .populate("userId", "firstName lastName email phone phoneJob userIdSesame")
    .lean();

  const normalizedManagers = await Promise.all(
    managers.map(async (item) => {
      let roleAssignationIdSesame = item.roleAssignationIdSesame || null;

      if (!roleAssignationIdSesame && item.userId?.userIdSesame) {
        const rolesRes = await sesameService.listEmployeeRoleAssignations(item.userId.userIdSesame, { limit: 200, page: 1 });
        const roles = rolesRes?.data || [];

        const officeRole = roles.find((role) =>
          role?.affectedEntityType === "office" &&
          String(role?.affectedEntityId) === String(officeId) &&
          String(role?.role?.id) === String(SESAME_ROLE_IDS.WORKPLACE_ADMIN)
        );

        roleAssignationIdSesame = officeRole?.id || null;

        if (roleAssignationIdSesame) {
          await SesameResponsibility.updateOne(
            { _id: item._id },
            { $set: { roleAssignationIdSesame, raw: officeRole || item.raw || null, syncedAt: new Date() } }
          );
        }
      }

      return {
        _id: item.userId?._id || null,
        userId: item.userId?._id || null,
        employeeIdSesame: item.employeeIdSesame || null,
        fullName: item.userId
          ? `${item.userId.firstName || ""} ${item.userId.lastName || ""}`.trim()
          : item.employeeName || "",
        email: item.userId?.email || item.employeeEmail || "",
        phone: item.userId?.phone || "",
        phoneJob: item.userId?.phoneJob || null,
        roleAssignationIdSesame,
        roleName: item.roleName || "",
        officeId: item.entityIdSesame || null,
        officeName: item.entityName || "",
        raw: item,
      };
    })
  );

  response(res, 200, normalizedManagers);
};




module.exports = {
  postSesameListEmployees: catchAsync(postSesameListEmployees),
  postSesameGetEmployee: catchAsync(postSesameGetEmployee),
  postSesameListOffices: catchAsync(postSesameListOffices),
  postSesameGetOffice: catchAsync(postSesameGetOffice),

  postSesameGetEmployeeContext: catchAsync(postSesameGetEmployeeContext),

  postSesameAssignEmployeeOffice: catchAsync(postSesameAssignEmployeeOffice),
  postSesameDeleteEmployeeOfficeAssignation: catchAsync(postSesameDeleteEmployeeOfficeAssignation),

  postSesameAssignOfficeEmployee: catchAsync(postSesameAssignOfficeEmployee),
  postSesameDeleteOfficeEmployee: catchAsync(postSesameDeleteOfficeEmployee),
  postSesameGetOfficeEmployees: catchAsync(postSesameGetOfficeEmployees),

  postSesameAssignDepartmentEmployee: catchAsync(postSesameAssignDepartmentEmployee),
  postSesameDeleteDepartmentEmployee: catchAsync(postSesameDeleteDepartmentEmployee),
  postSesameGetDepartmentEmployees: catchAsync(postSesameGetDepartmentEmployees),

  postSesameAssignEmployeeOfficeRole: catchAsync(postSesameAssignEmployeeOfficeRole),
  postSesameDeleteEmployeeOfficeRole: catchAsync(postSesameDeleteEmployeeOfficeRole),

  postSesameUpdateEmployeeManagersByEmployee: catchAsync(postSesameUpdateEmployeeManagersByEmployee),
  postSesameEligibleManagersByEmployee: catchAsync(postSesameEligibleManagersByEmployee),

  postSesameCreateDepartmentForUser: catchAsync(postSesameCreateDepartmentForUser),
  postSesameDeleteDepartment: catchAsync(postSesameDeleteDepartment),
  postSesameTransferDepartment: catchAsync(postSesameTransferDepartment),

  postSesameToggleEmployeeForUser: catchAsync(postSesameToggleEmployeeForUser),
  postSesameInviteEmployeeForUser: catchAsync(postSesameInviteEmployeeForUser),

  postSesameGetOfficeManagers: catchAsync(postSesameGetOfficeManagers),

  ensureSesameEmployeeForUser,
  disableSesameEmployeeForUser,
  deleteSesameEmployeeForUser,
  syncSesameEmployeeForUser,
  findSesameEmployeeByUser,

  createSesameOfficeFromDispositive,
  createSesameOfficeFromDispositiveAndSave,
  updateSesameOfficeFromDispositiveSaved,
  syncSesameOfficeFromDispositive,
  deleteSesameOfficeForDispositive,
  syncSesameOfficeForDispositive,

  syncSesameResponsibilities,
};