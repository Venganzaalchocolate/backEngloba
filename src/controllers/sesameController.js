const { User, Dispositive, Workplace, SesameResponsibility, Leaves, Periods } = require("../models/indexModels");
const sesameService = require("../services/sesameServices");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const SESAME_COMPANY_ID = process.env.SESAME_COMPANY_ID;

if (!SESAME_COMPANY_ID) throw new Error("Falta SESAME_COMPANY_ID en .env");

const SESAME_ROLE_IDS = {
  DEPARTMENT_ADMIN: "42340bb4-3355-4b12-90f9-70cf7ad86d88",
  WORKPLACE_ADMIN: "65009a48-73ca-413c-a1ac-e98ecc00da09",
  ADMIN: "d4e27835-80e2-4967-89b0-eceab254915c",
};

const isValidSesameCoordinateValue = (value) => {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
};

const isValidSesameCoordinatePair = (coordinates) => {
  if (!coordinates) return false;

  if (!isValidSesameCoordinateValue(coordinates.lat)) return false;
  if (!isValidSesameCoordinateValue(coordinates.lng)) return false;

  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);

  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;

  return true;
};

const buildSesameOfficeFromWorkplace = (workplace, linkedDispositives = []) => {
  const payload = {
    companyId: SESAME_COMPANY_ID,
    radio: 100,
  };

  if (workplace.name !== undefined) payload.name = workplace.name;
  if (workplace.address !== undefined) payload.address = workplace.address;

  if (isValidSesameCoordinatePair(workplace.coordinates)) {
    payload.coordinates = {
      latitude: Number(workplace.coordinates.lat),
      longitude: Number(workplace.coordinates.lng),
    };
  }

  const parts = [];

  if (workplace.phone) parts.push(`Teléfono oficina: ${workplace.phone}`);

  if (linkedDispositives.length) {
    const deviceNames = linkedDispositives
      .map((d) => {
        const programName = d.program?.acronym || d.program?.name || "";
        return `${d.name}${programName ? ` (${programName})` : ""}`;
      })
      .join(", ");

    parts.push(`Dispositivos vinculados: ${deviceNames}`);
  }

  if (workplace.resolvedAddress?.formatted) {
    parts.push(`Dirección resuelta: ${workplace.resolvedAddress.formatted}`);
  }

  if (parts.length) payload.description = parts.join(" | ");

  payload.defaultEmployeesDateTimeZone = "Europe/Madrid";

  return payload;
};


const mapUserGenderToSesame = (gender) => gender === "male" || gender === "female" ? gender : undefined;
const mapEmploymentStatusToSesame = (employmentStatus) =>
  employmentStatus === "activo"
    ? "active"
    : employmentStatus === "ya no trabaja con nosotros" || employmentStatus === "en proceso de contratación"
      ? "inactive"
      : undefined;
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
    const currentAssignationsRes = await sesameService.getEmployeeOfficeAssignations({
      employeeId: employeeIdSesame,
      limit: 200,
      page: 1,
    });

    const currentAssignations = currentAssignationsRes?.data || [];

    const existingAssignation =
      currentAssignations.find(
        (item) => String(item?.office?.id || item?.officeId || "") === String(scopeId)
      ) || null;

    let assignation = existingAssignation;
    let action = "already-assigned";

    if (!assignation) {
      assignation = await sesameService.assignEmployeeOffice({
        employeeId: employeeIdSesame,
        officeId: scopeId,
      });

      action = "assigned";
    }

    if (isMainOffice !== null) {
      const assignationId =
        assignation?.data?.id ||
        assignation?.id ||
        assignation?._id;

      if (!assignationId) {
        throw new ClientError("No se pudo obtener el id de la asignación de oficina en Sesame", 500);
      }

      const updatedAssignation = await sesameService.updateEmployeeOfficeAssignation(assignationId, {
        employeeId: employeeIdSesame,
        officeId: scopeId,
        isMainOffice: !!isMainOffice,
      });

      return {
        action: action === "assigned" ? "assigned-and-updated" : "already-assigned-and-updated",
        employeeId: employeeIdSesame,
        officeId: String(scopeId),
        data: updatedAssignation,
      };
    }

    return {
      action,
      employeeId: employeeIdSesame,
      officeId: String(scopeId),
      data: assignation,
    };
  }

  if (scopeType === "department") {
    const currentAssignationsRes = await sesameService.getDepartmentEmployees({
      employeeId: employeeIdSesame,
      limit: 200,
      page: 1,
    });

    const currentAssignations = currentAssignationsRes?.data || [];

    const existingAssignation =
      currentAssignations.find(
        (item) => String(item?.department?.id || item?.departmentId || "") === String(scopeId)
      ) || null;

    if (existingAssignation) {
      return {
        action: "already-assigned",
        employeeId: employeeIdSesame,
        departmentId: String(scopeId),
        data: existingAssignation,
      };
    }

    const createdAssignation = await sesameService.assignEmployeeDepartment({
      employeeId: employeeIdSesame,
      departmentId: scopeId,
    });

    return {
      action: "assigned",
      employeeId: employeeIdSesame,
      departmentId: String(scopeId),
      data: createdAssignation,
    };
  }

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




const findSesameEmployeeByUser = async (user) => {
  if (!user) return null;

  const dni = normalizeDniSesame(user?.dni);
  if (dni) {
    const activeRes = await sesameService.listEmployees({ dni, status: "active", limit: 10 });
    const inactiveRes = await sesameService.listEmployees({ dni, status: "inactive", limit: 10 });

    const itemsByDni = [
      ...(activeRes?.data || []),
      ...(inactiveRes?.data || []),
    ];

    const uniqueById = [];
    const seen = new Set();

    for (const item of itemsByDni) {
      const id = item?.id;
      if (!id || seen.has(String(id))) continue;
      seen.add(String(id));
      uniqueById.push(item);
    }

    if (uniqueById.length === 1) return uniqueById[0];
    if (uniqueById.length > 1) {
      throw new ClientError(`Hay más de un empleado en Sesame con el DNI ${dni}`, 409);
    }
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

const getSesameEmployeeContext = async (employeeId) => {
  if (!employeeId) return null;

  const employeeResponse = await sesameService.getEmployeeById(employeeId);
  const employee = employeeResponse?.data || null;
  if (!employee) return null;

  const [
    officeAssignationsResponse,
    departmentAssignationsResponse,
    absencesManagersResponse,
    checksManagersResponse,
    roleAssignationsResponse,
  ] = await Promise.all([
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

  const managedOfficeRoleAssignations = officeRoleAssignations.filter(
    (x) => x?.role?.name === "Workplace administrator"
  );

  const managedDepartmentRoleAssignations = departmentRoleAssignations.filter((x) =>
    String(x?.role?.name || "").toLowerCase().includes("department")
  );

  const managedOfficeIds = [
    ...new Set(managedOfficeRoleAssignations.map((x) => x?.affectedEntityId).filter(Boolean)),
  ];

  const managedDepartmentIds = [
    ...new Set(managedDepartmentRoleAssignations.map((x) => x?.affectedEntityId).filter(Boolean)),
  ];

  const managedWorkplaces = managedOfficeIds.length
    ? await Workplace.find({ officeIdSesame: { $in: managedOfficeIds.map(String) } })
      .select("_id name address phone province officeIdSesame resolvedAddress")
      .populate("province", "name")
      .lean()
    : [];

  const workplaceByOfficeId = {};

  managedWorkplaces.forEach((workplace) => {
    if (workplace?.officeIdSesame) {
      workplaceByOfficeId[String(workplace.officeIdSesame)] = workplace;
    }
  });

  const workplaceIds = managedWorkplaces.map((x) => x._id).filter(Boolean);

  const linkedDispositives = workplaceIds.length
    ? await Dispositive.find({ workplaces: { $in: workplaceIds } })
      .select("_id name program province workplaces active")
      .populate("program", "name acronym")
      .populate("province", "name")
      .sort({ name: 1 })
      .lean()
    : [];

  const dispositivesByWorkplaceId = {};

  linkedDispositives.forEach((device) => {
    (device.workplaces || []).forEach((workplaceId) => {
      const key = String(workplaceId);
      if (!dispositivesByWorkplaceId[key]) dispositivesByWorkplaceId[key] = [];
      dispositivesByWorkplaceId[key].push(device);
    });
  });

  const managedDepartmentResponsibilities = managedDepartmentIds.length
    ? await SesameResponsibility.find({
      active: true,
      responsibilityType: "department_manager",
      entityType: "department",
      entityIdSesame: { $in: managedDepartmentIds },
    })
      .select("entityIdSesame entityName")
      .lean()
    : [];

  const departmentNameById = {};

  managedDepartmentResponsibilities.forEach((item) => {
    if (item?.entityIdSesame && item?.entityName) {
      departmentNameById[String(item.entityIdSesame)] = item.entityName;
    }
  });

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

  const mapRole = (item) =>
    item
      ? {
        id: item.id || null,
        affectedEntityId: item.affectedEntityId || null,
        affectedEntityType: item.affectedEntityType || "",
        role: {
          id: item?.role?.id || null,
          name: item?.role?.name || "",
        },
        raw: item,
      }
      : null;

  const mapOfficeRole = (item) => {
    const base = mapRole(item);
    if (!base) return null;

    const officeId = String(item?.affectedEntityId || "");
    const workplace = workplaceByOfficeId[officeId] || null;
    const linked = workplace?._id
      ? dispositivesByWorkplaceId[String(workplace._id)] || []
      : [];

    return {
      ...base,
      entityName: workplace?.name || item?.entityName || item?.office?.name || officeId,
      workplaceId: workplace?._id || null,
      workplaceName: workplace?.name || "",
      workplaceAddress: workplace?.address || "",
      workplacePhone: workplace?.phone || "",
      workplaceProvince: workplace?.province || null,
      workplaceResolvedAddress: workplace?.resolvedAddress || null,
      linkedDispositives: linked.map((device) => ({
        _id: device._id,
        name: device.name || "",
        active: device.active !== false,
        program: device.program || null,
        province: device.province || null,
      })),
    };
  };

  const mapDepartmentRole = (item) =>
    item
      ? {
        id: item.id || null,
        affectedEntityId: item.affectedEntityId || null,
        affectedEntityType: item.affectedEntityType || "",
        entityName: item?.entityName || item?.department?.name || "",
        role: {
          id: item?.role?.id || null,
          name: item?.role?.name || "",
        },
        raw: item,
      }
      : null;

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
      managedOffices: managedOfficeRoleAssignations.map(mapOfficeRole).filter(Boolean),
      managedOfficeIds,
      managedDepartments: managedDepartmentRoleAssignations
        .map((item) => ({
          ...mapDepartmentRole(item),
          entityName:
            departmentNameById[String(item?.affectedEntityId)] ||
            item?.department?.name ||
            "",
        }))
        .filter(Boolean),
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

  const workplace = await Workplace.findOne({ officeIdSesame: String(officeId) })
    .select("_id name officeIdSesame")
    .lean();

  const relatedDispositives = workplace?._id
    ? await Dispositive.find({
      workplaces: workplace._id,
      departamentSesame: { $exists: true, $nin: [null, ""] },
    })
      .select("_id name departamentSesame workplaces")
      .populate({
        path: "workplaces",
        select: "_id name active officeIdSesame",
      })
      .lean()
    : [];

  const currentOfficeAssignationsRes = await sesameService.getEmployeeOfficeAssignations({
    employeeId: employeeIdSesame,
    limit: 200,
    page: 1,
  });

  const currentOfficeAssignations = currentOfficeAssignationsRes?.data || [];

  const remainingOfficeIds = new Set(
    currentOfficeAssignations
      .map((item) => item?.office?.id || item?.officeId || null)
      .filter(Boolean)
      .map(String)
      .filter((id) => id !== String(officeId))
  );

  const officeResult = await sesameService.deleteEmployeeOfficeAssignation({
    employeeId: employeeIdSesame,
    officeId,
  });

  const removedDepartments = [];
  const keptDepartments = [];

  for (const dispositive of relatedDispositives) {
    const departmentId = String(dispositive.departamentSesame || "");
    if (!departmentId) continue;

    const dispositiveOfficeIds = (dispositive.workplaces || [])
      .filter((workplace) => workplace?.active !== false)
      .map((workplace) => workplace?.officeIdSesame)
      .filter(Boolean)
      .map(String);

    const stillHasOfficeForThisDispositive = dispositiveOfficeIds.some((id) =>
      remainingOfficeIds.has(id)
    );

    if (stillHasOfficeForThisDispositive) {
      keptDepartments.push({
        dispositiveId: String(dispositive._id),
        dispositiveName: dispositive.name || "",
        departmentId,
        reason: "El empleado conserva otra oficina vinculada al mismo dispositivo",
      });
      continue;
    }

    const currentDepartmentAssignationsRes = await sesameService.getDepartmentEmployees({
      employeeId: employeeIdSesame,
      departmentId,
      limit: 50,
      page: 1,
    });

    const currentDepartmentAssignations = currentDepartmentAssignationsRes?.data || [];
    if (!currentDepartmentAssignations.length) continue;

    await sesameService.deleteEmployeeDepartmentAssignation({
      employeeId: employeeIdSesame,
      departmentId,
    });

    removedDepartments.push({
      dispositiveId: String(dispositive._id),
      dispositiveName: dispositive.name || "",
      departmentId,
    });
  }

  response(res, 200, {
    ok: true,
    employeeId,
    employeeIdSesame,
    officeId,
    workplace: workplace
      ? {
        workplaceId: String(workplace._id),
        workplaceName: workplace.name || "",
        officeIdSesame: workplace.officeIdSesame || null,
      }
      : null,
    officeResult,
    removedDepartments,
    keptDepartments,
  });
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


const createSesameDepartmentForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("El usuario no está dado de alta en Sesame", 400);

  const departmentName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  if (!departmentName) throw new ClientError("El usuario no tiene nombre suficiente para crear el departamento", 400);

  const created = await sesameService.createDepartment({
    companyId: SESAME_COMPANY_ID,
    name: departmentName,
  });

  const departmentId = created?.data?.id || created?.id;
  if (!departmentId) throw new ClientError("Sesame creó el departamento pero no devolvió id", 500);

  return {
    user,
    departmentId: String(departmentId),
    departmentName,
    created,
  };
};



const postSesameCreateDepartmentForUser = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) throw new ClientError("Falta userId", 400);

  const { departmentId, departmentName, created } = await createSesameDepartmentForUser(userId);

  const roleAssignation = await assignDepartmentAdminRoleToUser({
    userId,
    departmentId,
  });

  await upsertDepartmentManagerResponsibility({
    userId,
    departmentIdSesame: departmentId,
    departmentName,
    roleAssignation,
  });

  response(res, 200, {
    ok: true,
    departmentId,
    departmentName,
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

  const [employeeResponse, workplace] = await Promise.all([
    sesameService.getEmployeeById(String(user.userIdSesame)),
    Workplace.findOne({ officeIdSesame: String(officeIdSesame) })
      .select("_id name officeIdSesame")
      .lean(),
  ]);

  const dispositive = workplace?._id
    ? await Dispositive.findOne({ workplaces: workplace._id })
      .select("_id name program")
      .lean()
    : null;

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
        entityName: workplace?.name || "",
        workplaceId: workplace?._id || null,
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

const upsertDepartmentManagerResponsibility = async ({
  userId,
  departmentIdSesame,
  departmentName,
  roleAssignation = null,
}) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!departmentIdSesame) throw new ClientError("Falta departmentIdSesame", 400);

  const entityName = String(departmentName || "").trim();
  if (!entityName) throw new ClientError("Falta el nombre del departamento para guardar la responsabilidad", 400);

  const user = await User.findById(userId).select("_id userIdSesame email firstName lastName").lean();
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.userIdSesame) throw new ClientError("Usuario sin userIdSesame", 400);

  const employeeResponse = await sesameService.getEmployeeById(String(user.userIdSesame));
  const employee = employeeResponse?.data || null;

  const roleIdSesame = roleAssignation?.role?.id || SESAME_ROLE_IDS.DEPARTMENT_ADMIN;
  const roleName = roleAssignation?.role?.name || "Department administrator";
  const roleAssignationIdSesame = roleAssignation?.id || null;

  await SesameResponsibility.updateOne(
    {
      userId: user._id,
      responsibilityType: "department_manager",
      entityIdSesame: String(departmentIdSesame),
    },
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

// ===================== SESAME OFFICES / WORKPLACES =====================


/**
 * Obtiene un centro de trabajo y sus dispositivos vinculados para sincronizar con Sesame.
 */
const getWorkplaceForSesame = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId).populate("province", "name");
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  const linkedDispositives = await Dispositive.find({ workplaces: workplace._id })
    .select("_id name email phone program")
    .populate("program", "name acronym")
    .lean();

  return { workplace, linkedDispositives };
};

/**
 * Crea una oficina en Sesame desde un centro de trabajo, sin guardar el id.
 */
const createSesameOfficeFromWorkplace = async (workplaceId) => {
  const { workplace, linkedDispositives } = await getWorkplaceForSesame(workplaceId);

  if (!workplace.name) throw new ClientError("El centro de trabajo no tiene nombre", 400);
  if (!workplace.address) throw new ClientError("El centro de trabajo no tiene dirección", 400);

  return sesameService.createOffice(buildSesameOfficeFromWorkplace(workplace, linkedDispositives));
};

/**
 * Crea una oficina en Sesame desde un centro de trabajo y guarda officeIdSesame.
 */
const createSesameOfficeFromWorkplaceAndSave = async (workplaceId) => {
  const { workplace, linkedDispositives } = await getWorkplaceForSesame(workplaceId);

  if (workplace.officeIdSesame) throw new ClientError("El centro de trabajo ya tiene una oficina enlazada en Sesame", 409);
  if (!workplace.name) throw new ClientError("El centro de trabajo no tiene nombre", 400);
  if (!workplace.address) throw new ClientError("El centro de trabajo no tiene dirección", 400);

  const createdOffice = await sesameService.createOffice(buildSesameOfficeFromWorkplace(workplace, linkedDispositives));
  const officeId = createdOffice?.data?.id || createdOffice?.id;

  if (!officeId) throw new ClientError("Sesame creó la oficina pero no devolvió un identificador reconocible", 500);

  await Workplace.findByIdAndUpdate(workplaceId, { $set: { officeIdSesame: String(officeId) } });

  return createdOffice;
};

/**
 * Actualiza en Sesame una oficina ya enlazada a un centro de trabajo.
 */
const updateSesameOfficeFromWorkplaceSaved = async (workplaceId) => {
  const { workplace, linkedDispositives } = await getWorkplaceForSesame(workplaceId);

  if (!workplace.officeIdSesame) throw new ClientError("El centro de trabajo no tiene officeIdSesame", 400);
  if (!workplace.name) throw new ClientError("El centro de trabajo no tiene nombre", 400);

  const payload = buildSesameOfficeFromWorkplace(workplace, linkedDispositives);


  const updated = await sesameService.updateOffice(workplace.officeIdSesame, payload);

  const checked = await sesameService.getOfficeById(workplace.officeIdSesame);



  return updated;
};

/**
 * Crea o actualiza la oficina Sesame de un centro de trabajo.
 */
const syncSesameOfficeFromWorkplace = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId).lean();
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  if (workplace.officeIdSesame) return updateSesameOfficeFromWorkplaceSaved(workplaceId);
  return createSesameOfficeFromWorkplaceAndSave(workplaceId);
};

/**
 * Elimina en Sesame la oficina enlazada a un centro de trabajo.
 */
const deleteSesameOfficeForWorkplace = async (workplaceId, { clearField = true } = {}) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId).lean();
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);
  if (!workplace.officeIdSesame) return { action: "not-found" };

  const deleted = await sesameService.deleteOffice(workplace.officeIdSesame);

  if (clearField) {
    await Workplace.updateOne(
      { _id: workplaceId },
      { $set: { officeIdSesame: null } }
    );
  }

  return {
    action: "deleted",
    officeIdSesame: String(workplace.officeIdSesame),
    data: deleted,
  };
};

/**
 * Sincroniza la oficina Sesame de un centro según su estado activo.
 */
const syncSesameOfficeForWorkplace = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId).lean();
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  if (workplace.active === false) return deleteSesameOfficeForWorkplace(workplaceId);
  return syncSesameOfficeFromWorkplace(workplaceId);
};




const assignDispositiveDepartmentAdminToUser = async ({ userId, dispositiveId }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id name departamentSesame program")
    .lean();

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!dispositive.departamentSesame) throw new ClientError("El dispositivo no tiene departamento Sesame asociado", 400);

  const departmentId = String(dispositive.departamentSesame);
  const departmentName = String(dispositive.name || "").trim();

  if (!departmentName) throw new ClientError("El dispositivo no tiene nombre", 400);

  const existingRoleAssignation = await findDepartmentAdminRoleAssignation({
    userId,
    departmentId,
  });

  const roleAssignation = existingRoleAssignation?.id
    ? existingRoleAssignation
    : await assignDepartmentAdminRoleToUser({ userId, departmentId });

  await upsertDepartmentManagerResponsibility({
    userId,
    departmentIdSesame: departmentId,
    departmentName,
    roleAssignation,
  });

  await SesameResponsibility.updateOne(
    {
      userId,
      responsibilityType: "department_manager",
      entityIdSesame: departmentId,
    },
    {
      $set: {
        dispositiveId: dispositive._id,
        programId: dispositive.program || null,
      },
    }
  );

  return {
    action: existingRoleAssignation?.id ? "reused" : "assigned",
    departmentId,
    departmentName,
    dispositiveId: String(dispositive._id),
    roleAssignation,
  };
};


const postSesameAssignDispositiveDepartmentAdminToUser = async (req, res) => {
  const { userId, dispositiveId } = req.body || {};

  const data = await assignDispositiveDepartmentAdminToUser({
    userId,
    dispositiveId,
  });

  response(res, 200, data);
};

const removeDepartmentAdminRoleFromUser = async ({ userId, departmentId }) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!departmentId) throw new ClientError("Falta departmentId", 400);

  const roleAssignation = await findDepartmentAdminRoleAssignation({ userId, departmentId });

  if (roleAssignation?.id) {
    const data = await sesameService.unassignRoleFromEmployee({
      assignationId: roleAssignation.id,
    });

    await removeDepartmentManagerResponsibility({
      assignationId: roleAssignation.id,
      userId,
      departmentIdSesame: departmentId,
    });

    return data;
  }

  await removeDepartmentManagerResponsibility({
    userId,
    departmentIdSesame: departmentId,
  });

  return {
    removedFromSesame: false,
    cleanedLocal: true,
    departmentId,
  };
};

const postSesameRemoveDepartmentAdminRoleFromUser = async (req, res) => {
  const { userId, departmentId } = req.body || {};

  const data = await removeDepartmentAdminRoleFromUser({
    userId,
    departmentId,
  });

  response(res, 200, data);
};

const createSesameDepartmentForDispositive = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id name departamentSesame program")
    .lean();

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);
  if (dispositive.departamentSesame) return { departmentId: String(dispositive.departamentSesame), reused: true };

  const created = await sesameService.createDepartment({
    companyId: SESAME_COMPANY_ID,
    name: dispositive.name,
  });

  const departmentId = created?.data?.id || created?.id;
  if (!departmentId) throw new ClientError("Sesame creó el departamento pero no devolvió id", 500);

  await Dispositive.updateOne(
    { _id: dispositive._id },
    { $set: { departamentSesame: String(departmentId) } }
  );

  return {
    departmentId: String(departmentId),
    reused: false,
    data: created,
  };
};

const updateSesameDepartmentForDispositive = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id name departamentSesame program")
    .lean();

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!dispositive.name) throw new ClientError("El dispositivo no tiene nombre", 400);

  if (!dispositive.departamentSesame) {
    return createSesameDepartmentForDispositive(dispositiveId);
  }

  const departmentId = String(dispositive.departamentSesame);

  const updated = await sesameService.updateDepartment(departmentId, {
    companyId: SESAME_COMPANY_ID,
    name: dispositive.name,
  });

  await SesameResponsibility.updateMany(
    {
      responsibilityType: "department_manager",
      entityType: "department",
      entityIdSesame: departmentId,
    },
    {
      $set: {
        entityName: dispositive.name,
        dispositiveId: dispositive._id,
        programId: dispositive.program || null,
        departmentExternalKey: departmentId,
        syncedAt: new Date(),
      },
    }
  );

  return {
    departmentId,
    data: updated,
  };
};

const deleteSesameDepartmentForDispositive = async (dispositiveId) => {
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id departamentSesame")
    .lean();

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);
  if (!dispositive.departamentSesame) return null;

  const departmentId = String(dispositive.departamentSesame);

  const cleanupResult = await removeAllEmployeesFromDepartment({ departmentId });

  if (cleanupResult.totalErrors > 0) {
    throw new ClientError("No se pudo vaciar completamente el departamento antes de eliminarlo", 409);
  }

  const deleted = await sesameService.deleteDepartment(departmentId);

  await SesameResponsibility.deleteMany({
    responsibilityType: "department_manager",
    entityType: "department",
    entityIdSesame: departmentId,
  });

  await Dispositive.updateOne(
    { _id: dispositive._id },
    { $set: { departamentSesame: null } }
  );

  return {
    departmentId,
    cleanupResult,
    data: deleted,
  };
};

const assignEmployeeToDispositiveSesameScopes = async ({
  userId,
  dispositiveId,
  workplaceId = null,
  isMainOffice = true,
}) => {
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!dispositiveId) throw new ClientError("Falta dispositiveId", 400);

  const employeeSync = await ensureSesameEmployeeForUser(userId, { status: "active" });

  if (!employeeSync?.sesameId) {
    throw new ClientError("No se pudo crear o activar el usuario en Sesame", 400);
  }

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id name departamentSesame workplaces")
    .populate({
      path: "workplaces",
      select: "_id name officeIdSesame active",
    })
    .lean();

  if (!dispositive) throw new ClientError("Dispositivo no encontrado", 404);

  if (!dispositive.departamentSesame) {
    const departmentCreated = await createSesameDepartmentForDispositive(dispositiveId);
    dispositive.departamentSesame = departmentCreated.departmentId;
  }

  const workplacesWithOffice = (dispositive.workplaces || [])
    .filter((item) => item?.active !== false)
    .filter((item) => !!item?.officeIdSesame);

  if (!workplacesWithOffice.length) {
    throw new ClientError("El dispositivo no tiene ningún centro de trabajo con oficina Sesame asociada", 400);
  }

  let workplace = null;

  if (workplaceId) {
    workplace = workplacesWithOffice.find((item) => String(item._id) === String(workplaceId)) || null;

    if (!workplace) {
      throw new ClientError("El centro de trabajo seleccionado no pertenece al dispositivo o no tiene oficina Sesame", 400);
    }
  } else {
    if (workplacesWithOffice.length > 1) {
      throw new ClientError("El dispositivo tiene varias oficinas Sesame. Debes indicar workplaceId", 400);
    }

    workplace = workplacesWithOffice[0];
  }

  const officeResult = await assignEmployeeToScope({
    scopeType: "office",
    scopeId: String(workplace.officeIdSesame),
    userId,
    isMainOffice,
  });

  const departmentResult = await assignEmployeeToScope({
    scopeType: "department",
    scopeId: String(dispositive.departamentSesame),
    userId,
  });

  return {
    userId,
    sesameId: employeeSync.sesameId,
    employeeAction: employeeSync.action,
    dispositiveId: String(dispositive._id),
    dispositiveName: dispositive.name || "",
    departmentId: String(dispositive.departamentSesame),
    workplaceId: String(workplace._id),
    workplaceName: workplace.name || "",
    officeId: String(workplace.officeIdSesame),
    departmentResult,
    officeResult,
  };
};

const postSesameAssignEmployeeToDispositiveScopes = async (req, res) => {
  const { userId, dispositiveId, workplaceId = null, isMainOffice = true } = req.body || {};

  const data = await assignEmployeeToDispositiveSesameScopes({
    userId,
    dispositiveId,
    workplaceId,
    isMainOffice,
  });

  response(res, 200, data);
};

const getAllSesameEmployeesLocal = async () => {
  const employees = [];
  const seen = new Set();

  const statuses = ["active", "inactive"];

  for (const status of statuses) {
    let page = 1;
    let lastPage = 1;

    do {
      const res = await sesameService.listEmployees({
        status,
        limit: 200,
        page,
      });

      const items = res?.data || [];
      lastPage = Number(res?.meta?.lastPage || 1);

      for (const employee of items) {
        if (!employee?.id) continue;

        if (seen.has(String(employee.id))) continue;
        seen.add(String(employee.id));

        employees.push({
          ...employee,
          checkedStatus: status,
        });
      }

      page++;
    } while (page <= lastPage);
  }

  return employees;
};

const getActiveSesameEmployeesLocal = async () => {
  const employees = [];
  const seen = new Set();

  let page = 1;
  let lastPage = 1;

  do {
    const res = await sesameService.listEmployees({
      status: "active",
      limit: 200,
      page,
    });

    const items = res?.data || [];
    lastPage = Number(res?.meta?.lastPage || 1);

    for (const employee of items) {
      if (!employee?.id) continue;
      if (seen.has(String(employee.id))) continue;

      seen.add(String(employee.id));
      employees.push(employee);
    }

    page++;
  } while (page <= lastPage);

  return employees;
};



const normalizeSesameName = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const getAllSesameOfficesLocal = async () => {
  const offices = [];
  const seen = new Set();

  let page = 1;
  let lastPage = 1;

  do {
    const res = await sesameService.listOffices({
      limit: 200,
      page,
    });

    const items = res?.data || [];
    lastPage = Number(res?.meta?.lastPage || 1);

    for (const office of items) {
      if (!office?.id) continue;
      if (seen.has(String(office.id))) continue;

      seen.add(String(office.id));
      offices.push(office);
    }

    page++;
  } while (page <= lastPage);

  return offices;
};




const getAllOfficeEmployeesLocal = async (officeId) => {
  const employees = [];
  const seen = new Set();

  let page = 1;
  let lastPage = 1;

  do {
    const res = await sesameService.listOfficeEmployees({
      officeId,
      limit: 200,
      page,
    });

    const items = res?.data || [];
    lastPage = Number(res?.meta?.lastPage || 1);

    for (const item of items) {
      const employeeId = item?.employee?.id || null;
      if (!employeeId) continue;
      if (seen.has(String(employeeId))) continue;

      seen.add(String(employeeId));
      employees.push(item);
    }

    page++;
  } while (page <= lastPage);

  return employees;
};

const assignEmployeeDepartmentIfNeededLocal = async ({ employeeIdSesame, departmentId }) => {
  const currentRes = await sesameService.getDepartmentEmployees({
    employeeId: employeeIdSesame,
    limit: 200,
    page: 1,
  });

  const current = currentRes?.data || [];

  const alreadyAssigned = current.some((item) => {
    const currentDepartmentId = item?.department?.id || item?.departmentId || null;
    return String(currentDepartmentId) === String(departmentId);
  });

  if (alreadyAssigned) {
    return { action: "already-assigned" };
  }

  const data = await sesameService.assignEmployeeDepartment({
    employeeId: employeeIdSesame,
    departmentId,
  });

  return { action: "assigned", data };
};

const assignEmployeeOfficeIfNeededLocal = async ({ employeeIdSesame, officeId, isMainOffice = false }) => {
  const currentRes = await sesameService.getEmployeeOfficeAssignations({
    employeeId: employeeIdSesame,
    limit: 200,
    page: 1,
  });

  const current = currentRes?.data || [];

  const existing = current.find((item) => {
    const currentOfficeId = item?.office?.id || item?.officeId || null;
    return String(currentOfficeId) === String(officeId);
  });

  if (existing) {
    return { action: "already-assigned" };
  }

  const data = await sesameService.assignEmployeeOffice({
    employeeId: employeeIdSesame,
    officeId,
    isMainOffice,
  });

  return { action: "assigned", data };
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


  postSesameToggleEmployeeForUser: catchAsync(postSesameToggleEmployeeForUser),
  postSesameInviteEmployeeForUser: catchAsync(postSesameInviteEmployeeForUser),

  postSesameGetOfficeManagers: catchAsync(postSesameGetOfficeManagers),
  postSesameAssignEmployeeToDispositiveScopes: catchAsync(postSesameAssignEmployeeToDispositiveScopes),

  ensureSesameEmployeeForUser,
  disableSesameEmployeeForUser,
  deleteSesameEmployeeForUser,
  syncSesameEmployeeForUser,
  findSesameEmployeeByUser,

  createSesameOfficeFromWorkplace,
  createSesameOfficeFromWorkplaceAndSave,
  updateSesameOfficeFromWorkplaceSaved,
  syncSesameOfficeFromWorkplace,
  deleteSesameOfficeForWorkplace,
  syncSesameOfficeForWorkplace,

  createSesameDepartmentForDispositive,
  updateSesameDepartmentForDispositive,
  deleteSesameDepartmentForDispositive,

  postSesameAssignDispositiveDepartmentAdminToUser: catchAsync(postSesameAssignDispositiveDepartmentAdminToUser),
  postSesameRemoveDepartmentAdminRoleFromUser: catchAsync(postSesameRemoveDepartmentAdminRoleFromUser),
};