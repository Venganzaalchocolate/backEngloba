const mongoose = require("mongoose");
const { Program, Dispositive, Provinces, ScopedRoleRule, User } = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const allowedScopeTypes = ["program", "dispositive"];
const allowedRoleTypes = ["responsible", "coordinators", "supervisors"];
const allowedActions = ["list", "add", "update", "remove"];

const roleLabelMap = {
  responsible: "responsible",
  coordinators: "coordinator",
  supervisors: "supervisor",
};

const USER_SELECT = "firstName lastName email phone phoneJob.number phoneJob.extension";

/* Devuelve el modelo Mongoose según el tipo de scope solicitado */
const getScopeModel = (scopeType) => {
  if (scopeType === "program") return Program;
  if (scopeType === "dispositive") return Dispositive;
  throw new ClientError(`scopeType '${scopeType}' no soportado`, 400);
};

/* Resuelve el id del recurso objetivo a partir de los nombres aceptados por el controlador */
const getScopeId = ({ scopeType, scopeId, programId, dispositiveId, deviceId }) => {
  if (scopeId) return scopeId;
  if (scopeType === "program") return programId;
  if (scopeType === "dispositive") return dispositiveId || deviceId;
  return null;
};

/* Normaliza entrada de usuarios para aceptar users, userIds o roleUsers */
const normalizeUsersArray = (users, userIds, roleUsers) => {
  const raw = users ?? userIds ?? roleUsers ?? [];
  return Array.isArray(raw) ? raw : [raw];
};

/* Mapea un usuario al formato público usado por este controlador */
const mapUser = (u, assignmentType = "direct", ruleId = null) => ({
  _id: u?._id || null,
  firstName: u?.firstName || "",
  lastName: u?.lastName || "",
  fullName: `${u?.firstName || ""} ${u?.lastName || ""}`.trim(),
  email: u?.email || "",
  phone: u?.phone || "",
  phoneJob: {
    number: u?.phoneJob?.number || "",
    extension: u?.phoneJob?.extension || "",
  },
  assignmentType,
  ruleId,
});

const isSameId = (a, b) => String(a) === String(b);

const uniqueUsersById = (users = []) => {
  const map = new Map();
  for (const user of users) {
    if (!user?._id) continue;
    const key = String(user._id);
    const prev = map.get(key);
    if (!prev || (prev.assignmentType !== "direct" && user.assignmentType === "direct")) map.set(key, user);
  }
  return [...map.values()];
};

const ruleMatchesProgram = (rule, program) => {
  if (!rule?.active || rule.scopeType !== "program") return false;
  if (rule.filters?.onlyActive && !program?.active) return false;
  if (rule.filters?.area && rule.filters.area !== program?.area) return false;
  if (rule.filters?.entityId && !isSameId(rule.filters.entityId, program?.entity)) return false;
  if (rule.filters?.programId && !isSameId(rule.filters.programId, program?._id)) return false;
  return true;
};

const ruleMatchesDispositive = (rule, dispositive, program) => {
  if (!rule?.active || rule.scopeType !== "dispositive") return false;
  if (rule.filters?.onlyActive && !dispositive?.active) return false;
  if (rule.filters?.provinceId && !isSameId(rule.filters.provinceId, dispositive?.province?._id || dispositive?.province)) return false;
  if (rule.filters?.programId && !isSameId(rule.filters.programId, program?._id || dispositive?.program?._id || dispositive?.program)) return false;
  if (rule.filters?.area && rule.filters.area !== program?.area) return false;
  if (rule.filters?.entityId && !isSameId(rule.filters.entityId, program?.entity)) return false;
  return true;
};

/* Resuelve usuarios heredados por reglas activas sobre los programas y dispositivos ya cargados */
const buildInheritedRoleMaps = async ({ programs = [], dispositives = [] }) => {
  const rules = await ScopedRoleRule.find({ active: true }).lean();
  const programRoleMap = new Map();
  const dispositiveRoleMap = new Map();
  if (!rules.length) return { programRoleMap, dispositiveRoleMap };

  const userIds = [...new Set(rules.map((r) => String(r.userId)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select(USER_SELECT).lean() : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const programMap = new Map(programs.map((p) => [String(p._id), p]));
  const pushRoleUser = (targetMap, resourceId, roleType, user) => {
    const key = String(resourceId);
    if (!targetMap.has(key)) targetMap.set(key, { responsible: [], coordinators: [], supervisors: [] });
    targetMap.get(key)[roleType].push(user);
  };

  for (const rule of rules) {
    const user = userMap.get(String(rule.userId));
    if (!user) continue;
    const mappedUser = mapUser(user, "rule", rule._id);

    if (rule.scopeType === "program") {
      for (const program of programs) if (ruleMatchesProgram(rule, program)) pushRoleUser(programRoleMap, program._id, rule.roleType, mappedUser);
      continue;
    }

    for (const dispositive of dispositives) {
      const programId = dispositive.program?._id || dispositive.program;
      const parentProgram = programMap.get(String(programId));
      if (ruleMatchesDispositive(rule, dispositive, parentProgram)) pushRoleUser(dispositiveRoleMap, dispositive._id, rule.roleType, mappedUser);
    }
  }

  return { programRoleMap, dispositiveRoleMap };
};

/* Construye el resumen de roles de un usuario mezclando asignaciones directas y heredadas por reglas */
async function buildUserScopedRolesData(userId, includeScopeType = false) {
  const objectUserId = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const directPrograms = await Program.find(
    { $or: [{ responsible: objectUserId }, { coordinators: objectUserId }, { supervisors: objectUserId }] },
    { _id: 1, name: 1, acronym: 1, area: 1, entity: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
  ).lean();

  const directDispositives = await Dispositive.find(
    { $or: [{ responsible: objectUserId }, { coordinators: objectUserId }, { supervisors: objectUserId }] },
    { _id: 1, name: 1, province: 1, program: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
  ).populate({ path: "program", select: "name acronym area entity active responsible coordinators supervisors" }).lean();

  const userRules = await ScopedRoleRule.find({ active: true, userId: objectUserId }).lean();
  let rulePrograms = [];
  let ruleDispositives = [];

  if (userRules.length) {
    rulePrograms = await Program.find(
      {},
      { _id: 1, name: 1, acronym: 1, area: 1, entity: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
    ).lean();

    ruleDispositives = await Dispositive.find(
      {},
      { _id: 1, name: 1, province: 1, program: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
    ).populate({ path: "program", select: "name acronym area entity active responsible coordinators supervisors" }).lean();
  }

  const resultMap = new Map();
  const ensureEntry = ({ scopeType, idProgram, programName, programAcronym, dispositiveId, dispositiveName }) => {
    const key = `${scopeType}:${dispositiveId || idProgram}`;
    if (!resultMap.has(key)) {
      const base = {
        idProgram: idProgram || null,
        programName: programName || "",
        programAcronym: programAcronym || "",
        dispositiveId: dispositiveId || null,
        dispositiveName: dispositiveName || null,
        isProgramResponsible: false,
        isProgramCoordinator: false,
        isProgramSupervisor: false,
        isDeviceResponsible: false,
        isDeviceCoordinator: false,
        isDeviceSupervisor: false,
      };
      if (includeScopeType) base.scopeType = scopeType;
      resultMap.set(key, base);
    }
    return resultMap.get(key);
  };

  for (const p of directPrograms) {
    const entry = ensureEntry({ scopeType: "program", idProgram: p._id, programName: p.name, programAcronym: p.acronym });
    entry.isProgramResponsible ||= !!(p.responsible || []).some((x) => isSameId(x, objectUserId));
    entry.isProgramCoordinator ||= !!(p.coordinators || []).some((x) => isSameId(x, objectUserId));
    entry.isProgramSupervisor ||= !!(p.supervisors || []).some((x) => isSameId(x, objectUserId));
  }

  for (const d of directDispositives) {
    const p = d.program?._id ? d.program : null;
    const entry = ensureEntry({
      scopeType: "dispositive",
      idProgram: p?._id || null,
      programName: p?.name || "",
      programAcronym: p?.acronym || "",
      dispositiveId: d._id,
      dispositiveName: d.name,
    });
    entry.isProgramResponsible ||= !!(p?.responsible || []).some((x) => isSameId(x, objectUserId));
    entry.isProgramCoordinator ||= !!(p?.coordinators || []).some((x) => isSameId(x, objectUserId));
    entry.isProgramSupervisor ||= !!(p?.supervisors || []).some((x) => isSameId(x, objectUserId));
    entry.isDeviceResponsible ||= !!(d.responsible || []).some((x) => isSameId(x, objectUserId));
    entry.isDeviceCoordinator ||= !!(d.coordinators || []).some((x) => isSameId(x, objectUserId));
    entry.isDeviceSupervisor ||= !!(d.supervisors || []).some((x) => isSameId(x, objectUserId));
  }

  for (const rule of userRules) {
    if (rule.scopeType === "program") {
      for (const p of rulePrograms) {
        if (!ruleMatchesProgram(rule, p)) continue;
        const entry = ensureEntry({ scopeType: "program", idProgram: p._id, programName: p.name, programAcronym: p.acronym });
        if (rule.roleType === "responsible") entry.isProgramResponsible = true;
        if (rule.roleType === "coordinators") entry.isProgramCoordinator = true;
        if (rule.roleType === "supervisors") entry.isProgramSupervisor = true;
      }
      continue;
    }

    for (const d of ruleDispositives) {
      const p = d.program?._id ? d.program : null;
      if (!ruleMatchesDispositive(rule, d, p)) continue;
      const entry = ensureEntry({
        scopeType: "dispositive",
        idProgram: p?._id || null,
        programName: p?.name || "",
        programAcronym: p?.acronym || "",
        dispositiveId: d._id,
        dispositiveName: d.name,
      });
      if (rule.roleType === "responsible") entry.isDeviceResponsible = true;
      if (rule.roleType === "coordinators") entry.isDeviceCoordinator = true;
      if (rule.roleType === "supervisors") entry.isDeviceSupervisor = true;
    }
  }

  const values = [...resultMap.values()];
  const deviceProgramIds = new Set(values.filter((x) => x.dispositiveId).map((x) => String(x.idProgram)).filter(Boolean));
  return [
    ...values.filter((x) => x.dispositiveId),
    ...values.filter((x) => !x.dispositiveId && !deviceProgramIds.has(String(x.idProgram))),
  ];
}

/* Genera el organigrama de programas y dispositivos devolviendo roles directos y heredados, además de un índice de personas */
const getOrganizationChart = async (req, res) => {
  const { activeOnly = false, includeEmptyPrograms = true, includeEmptyDispositives = true, entity, programIds, dispositiveIds } = req.body || {};
  const normalizeIdsArray = (arr) => !Array.isArray(arr) ? [] : arr.filter((x) => mongoose.Types.ObjectId.isValid(x)).map((x) => new mongoose.Types.ObjectId(x));
  const parsedProgramIds = normalizeIdsArray(programIds);
  const parsedDispositiveIds = normalizeIdsArray(dispositiveIds);
  const programQuery = {};
  const dispositiveQuery = {};

  if (activeOnly) {
    programQuery.active = true;
    dispositiveQuery.active = true;
  }

  if (entity && mongoose.Types.ObjectId.isValid(entity)) programQuery.entity = new mongoose.Types.ObjectId(entity);
  if (parsedProgramIds.length) {
    programQuery._id = { $in: parsedProgramIds };
    dispositiveQuery.program = { $in: parsedProgramIds };
  }
  if (parsedDispositiveIds.length) dispositiveQuery._id = { $in: parsedDispositiveIds };

  const programs = await Program.find(programQuery)
    .select("name acronym area entity active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .lean();

  const loadedProgramIds = programs.map((p) => p._id);
  if (!loadedProgramIds.length && !parsedDispositiveIds.length) return response(res, 200, { programs: [], peopleIndex: {} });
  if (!parsedProgramIds.length && loadedProgramIds.length) dispositiveQuery.program = { $in: loadedProgramIds };

  const dispositives = await Dispositive.find(dispositiveQuery)
    .select("name province program active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .populate({ path: "program", select: "name acronym area entity active" })
    .populate({ path: "province", select: "name" })
    .lean();

  const { programRoleMap, dispositiveRoleMap } = await buildInheritedRoleMaps({ programs, dispositives });
  const dispositivesByProgram = new Map();

  for (const d of dispositives) {
    const pid = d.program?._id ? String(d.program._id) : String(d.program || "");
    if (!pid) continue;
    if (!dispositivesByProgram.has(pid)) dispositivesByProgram.set(pid, []);
    dispositivesByProgram.get(pid).push(d);
  }

  const peopleIndex = {};
  const registerPersonScope = (user, scope) => {
    if (!user?._id) return;
    const key = String(user._id);
    if (!peopleIndex[key]) {
      peopleIndex[key] = {
        ...mapUser(user, user.assignmentType, user.ruleId),
        programSupervisions: [],
        programResponsibles: [],
        programCoordinations: [],
        dispositiveSupervisions: [],
        dispositiveResponsibles: [],
        dispositiveCoordinations: [],
      };
    }
    const target = peopleIndex[key][scope.bucket];
    if (!target.some((x) => String(x._id) === String(scope.item._id))) target.push(scope.item);
  };

  const outPrograms = [];

  for (const p of programs) {
    const pid = String(p._id);
    const linkedDispositives = dispositivesByProgram.get(pid) || [];
    const inheritedProgramRoles = programRoleMap.get(pid) || { responsible: [], coordinators: [], supervisors: [] };

    const mappedProgram = {
      _id: p._id,
      name: p.name || "",
      acronym: p.acronym || "",
      area: p.area || "",
      entity: p.entity || null,
      active: !!p.active,
      responsibles: uniqueUsersById([...(p.responsible || []).map((u) => mapUser(u)), ...inheritedProgramRoles.responsible]),
      coordinators: uniqueUsersById([...(p.coordinators || []).map((u) => mapUser(u)), ...inheritedProgramRoles.coordinators]),
      supervisors: uniqueUsersById([...(p.supervisors || []).map((u) => mapUser(u)), ...inheritedProgramRoles.supervisors]),
      dispositives: [],
    };

    if (!includeEmptyPrograms) {
      const hasAnyRole = mappedProgram.responsibles.length > 0 || mappedProgram.coordinators.length > 0 || mappedProgram.supervisors.length > 0;
      if (!hasAnyRole && linkedDispositives.length === 0) continue;
    }

    mappedProgram.supervisors.forEach((u) => registerPersonScope(u, { bucket: "programSupervisions", item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active } }));
    mappedProgram.responsibles.forEach((u) => registerPersonScope(u, { bucket: "programResponsibles", item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active } }));
    mappedProgram.coordinators.forEach((u) => registerPersonScope(u, { bucket: "programCoordinations", item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active } }));

    for (const d of linkedDispositives) {
      const inheritedDispositiveRoles = dispositiveRoleMap.get(String(d._id)) || { responsible: [], coordinators: [], supervisors: [] };
      const mappedDispositive = {
        _id: d._id,
        name: d.name || "",
        active: !!d.active,
        province: d.province ? { _id: d.province._id, name: d.province.name || "" } : null,
        responsibles: uniqueUsersById([...(d.responsible || []).map((u) => mapUser(u)), ...inheritedDispositiveRoles.responsible]),
        coordinators: uniqueUsersById([...(d.coordinators || []).map((u) => mapUser(u)), ...inheritedDispositiveRoles.coordinators]),
        supervisors: uniqueUsersById([...(d.supervisors || []).map((u) => mapUser(u)), ...inheritedDispositiveRoles.supervisors]),
      };

      if (!includeEmptyDispositives) {
        const hasAnyRole = mappedDispositive.responsibles.length > 0 || mappedDispositive.coordinators.length > 0 || mappedDispositive.supervisors.length > 0;
        if (!hasAnyRole) continue;
      }

      mappedDispositive.supervisors.forEach((u) => registerPersonScope(u, {
        bucket: "dispositiveSupervisions",
        item: { _id: d._id, name: d.name || "", active: !!d.active, programId: p._id, programName: p.name || "", programAcronym: p.acronym || "" },
      }));

      mappedDispositive.responsibles.forEach((u) => registerPersonScope(u, {
        bucket: "dispositiveResponsibles",
        item: { _id: d._id, name: d.name || "", active: !!d.active, programId: p._id, programName: p.name || "", programAcronym: p.acronym || "" },
      }));

      mappedDispositive.coordinators.forEach((u) => registerPersonScope(u, {
        bucket: "dispositiveCoordinations",
        item: { _id: d._id, name: d.name || "", active: !!d.active, programId: p._id, programName: p.name || "", programAcronym: p.acronym || "" },
      }));

      mappedProgram.dispositives.push(mappedDispositive);
    }

    outPrograms.push(mappedProgram);
  }

  return response(res, 200, { programs: outPrograms, peopleIndex });
};

/* Gestiona altas, sustituciones, bajas y listados directos de responsables, coordinadores o supervisores sobre un recurso concreto */
const handleScopedRole = async (req, res) => {
  const { scopeType, roleType, action, removeUserId, userId } = req.body;

  if (!allowedScopeTypes.includes(scopeType)) throw new ClientError("scopeType inválido", 400);
  if (!allowedRoleTypes.includes(roleType)) throw new ClientError("roleType inválido", 400);
  if (!allowedActions.includes(action)) throw new ClientError("action inválida", 400);

  const resolvedScopeId = getScopeId(req.body);
  if (!resolvedScopeId) throw new ClientError("Falta scopeId/programId/dispositiveId", 400);
  if (!mongoose.Types.ObjectId.isValid(resolvedScopeId)) throw new ClientError("scopeId no válido", 400);

  const Model = getScopeModel(scopeType);

  switch (action) {
    case "list": {
      const doc = await Model.findById(resolvedScopeId).select(`${roleType}`).populate({ path: roleType, select: USER_SELECT }).lean();
      if (!doc) throw new ClientError("Elemento no encontrado", 404);
      return response(res, 200, doc[roleType] || []);
    }

    case "add": {
      const users = normalizeUsersArray(req.body.users, req.body.userIds, req.body.roleUsers).filter(Boolean);
      if (!users.length) throw new ClientError("Debes enviar al menos un usuario", 400);

      const doc = await Model.findByIdAndUpdate(
        resolvedScopeId,
        { $addToSet: { [roleType]: { $each: users } } },
        { new: true, runValidators: true }
      );

      if (!doc) throw new ClientError("Elemento no encontrado", 404);
      return response(res, 200, doc);
    }

    case "update": {
      const users = normalizeUsersArray(req.body.users, req.body.userIds, req.body.roleUsers).filter(Boolean);

      const doc = await Model.findByIdAndUpdate(
        resolvedScopeId,
        { $set: { [roleType]: users } },
        { new: true, runValidators: true }
      );

      if (!doc) throw new ClientError("Elemento no encontrado", 404);
      return response(res, 200, doc);
    }

    case "remove": {
      const targetUserId = removeUserId || userId;
      if (!targetUserId) throw new ClientError("Falta removeUserId o userId", 400);

      const doc = await Model.findByIdAndUpdate(
        resolvedScopeId,
        { $pull: { [roleType]: targetUserId } },
        { new: true, runValidators: true }
      );

      if (!doc) throw new ClientError("Elemento no encontrado", 404);
      return response(res, 200, doc);
    }

    default:
      throw new ClientError("Acción no soportada", 400);
  }
};

/* Lista todos los roles solicitados devolviendo un listado plano con asignaciones directas y heredadas por reglas */
const listScopedRoles = async (req, res) => {
  const { responsibles, coordinators, supervisors, allRoles } = req.body;
  const wantResponsibles = !!(responsibles || allRoles);
  const wantCoordinators = !!(coordinators || allRoles);
  const wantSupervisors = !!(supervisors || allRoles);

  if (!wantResponsibles && !wantCoordinators && !wantSupervisors) {
    throw new ClientError("Debes indicar responsibles, coordinators, supervisors o allRoles", 400);
  }

  const provinceMap = new Map();
  const provinces = await Provinces.find({}, { name: 1, subcategories: 1 }).lean();
  provinces.forEach((p) => {
    provinceMap.set(String(p._id), p.name);
    (p.subcategories || []).forEach((sub) => provinceMap.set(String(sub._id), `${p.name} – ${sub.name}`));
  });

  const dispositiveRoleFilter = [];
  if (wantResponsibles) dispositiveRoleFilter.push({ responsible: { $exists: true, $ne: [] } });
  if (wantCoordinators) dispositiveRoleFilter.push({ coordinators: { $exists: true, $ne: [] } });
  if (wantSupervisors) dispositiveRoleFilter.push({ supervisors: { $exists: true, $ne: [] } });

  const programRoleFilter = [];
  if (wantResponsibles) programRoleFilter.push({ responsible: { $exists: true, $ne: [] } });
  if (wantCoordinators) programRoleFilter.push({ coordinators: { $exists: true, $ne: [] } });
  if (wantSupervisors) programRoleFilter.push({ supervisors: { $exists: true, $ne: [] } });

  const dispositives = await Dispositive.find(dispositiveRoleFilter.length ? { $or: dispositiveRoleFilter } : {})
    .select("name province program active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .populate({ path: "program", select: "name acronym area entity active" })
    .lean();

  const programs = await Program.find(programRoleFilter.length ? { $or: programRoleFilter } : {})
    .select("name acronym area entity active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .lean();

  const { programRoleMap, dispositiveRoleMap } = await buildInheritedRoleMaps({ programs, dispositives });
  const out = [];

  const pushUsers = ({ users, roleType, scopeType, programName, dispositiveName, provinceName }) => {
    if (!Array.isArray(users)) return;
    for (const u of users) {
      out.push({
        scopeType,
        roleType: roleLabelMap[roleType],
        program: programName || null,
        device: dispositiveName || null,
        province: provinceName || null,
        firstName: u?.firstName ?? "",
        lastName: u?.lastName ?? "",
        email: u?.email ?? "",
        phone: u?.phone ?? "",
        phoneJob: {
          number: u?.phoneJob?.number ?? "",
          extension: u?.phoneJob?.extension ?? "",
        },
        assignmentType: u?.assignmentType || "direct",
        ruleId: u?.ruleId || null,
      });
    }
  };

  for (const d of dispositives) {
    const programName = d.program?.acronym ?? d.program?.name ?? null;
    const provinceName = d.province ? (provinceMap.get(String(d.province?._id || d.province)) || null) : null;
    const inherited = dispositiveRoleMap.get(String(d._id)) || { responsible: [], coordinators: [], supervisors: [] };

    if (wantResponsibles) {
      pushUsers({
        users: uniqueUsersById([...(d.responsible || []).map((u) => mapUser(u)), ...inherited.responsible]),
        roleType: "responsible",
        scopeType: "dispositive",
        programName,
        dispositiveName: d.name,
        provinceName,
      });
    }

    if (wantCoordinators) {
      pushUsers({
        users: uniqueUsersById([...(d.coordinators || []).map((u) => mapUser(u)), ...inherited.coordinators]),
        roleType: "coordinators",
        scopeType: "dispositive",
        programName,
        dispositiveName: d.name,
        provinceName,
      });
    }

    if (wantSupervisors) {
      pushUsers({
        users: uniqueUsersById([...(d.supervisors || []).map((u) => mapUser(u)), ...inherited.supervisors]),
        roleType: "supervisors",
        scopeType: "dispositive",
        programName,
        dispositiveName: d.name,
        provinceName,
      });
    }
  }

  for (const p of programs) {
    const programName = p.acronym ?? p.name ?? null;
    const inherited = programRoleMap.get(String(p._id)) || { responsible: [], coordinators: [], supervisors: [] };

    if (wantResponsibles) {
      pushUsers({
        users: uniqueUsersById([...(p.responsible || []).map((u) => mapUser(u)), ...inherited.responsible]),
        roleType: "responsible",
        scopeType: "program",
        programName,
        dispositiveName: null,
        provinceName: null,
      });
    }

    if (wantCoordinators) {
      pushUsers({
        users: uniqueUsersById([...(p.coordinators || []).map((u) => mapUser(u)), ...inherited.coordinators]),
        roleType: "coordinators",
        scopeType: "program",
        programName,
        dispositiveName: null,
        provinceName: null,
      });
    }

    if (wantSupervisors) {
      pushUsers({
        users: uniqueUsersById([...(p.supervisors || []).map((u) => mapUser(u)), ...inherited.supervisors]),
        roleType: "supervisors",
        scopeType: "program",
        programName,
        dispositiveName: null,
        provinceName: null,
      });
    }
  }

  return response(res, 200, out);
};

// Devuelve los roles efectivos de un usuario sobre programas y dispositivos, incluyendo asignaciones directas y heredadas por reglas.
// Además añade en sources el origen de cada permiso para que el front sepa si viene de directo o de regla.
const getUserScopedRoles = async (req, res) => {
  const { userId, _id } = req.body || {};
  const resolvedUserId = userId || _id;
  if (!resolvedUserId || !mongoose.Types.ObjectId.isValid(resolvedUserId)) throw new ClientError("userId no válido", 400);

  const objectUserId = new mongoose.Types.ObjectId(resolvedUserId);

  const directPrograms = await Program.find(
    { $or: [{ responsible: objectUserId }, { coordinators: objectUserId }, { supervisors: objectUserId }] },
    { _id: 1, name: 1, acronym: 1, area: 1, entity: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
  ).lean();

  const directDispositives = await Dispositive.find(
    { $or: [{ responsible: objectUserId }, { coordinators: objectUserId }, { supervisors: objectUserId }] },
    { _id: 1, name: 1, province: 1, program: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
  ).populate({ path: "program", select: "name acronym area entity active responsible coordinators supervisors" }).lean();

  const userRules = await ScopedRoleRule.find({ active: true, userId: objectUserId }).lean();

  let rulePrograms = [];
  let ruleDispositives = [];

  if (userRules.length) {
    rulePrograms = await Program.find(
      {},
      { _id: 1, name: 1, acronym: 1, area: 1, entity: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
    ).lean();

    ruleDispositives = await Dispositive.find(
      {},
      { _id: 1, name: 1, province: 1, program: 1, active: 1, responsible: 1, coordinators: 1, supervisors: 1 }
    ).populate({ path: "program", select: "name acronym area entity active responsible coordinators supervisors" }).lean();
  }

  const resultMap = new Map();

  const emptySources = () => ({
    programResponsible: null,
    programCoordinator: null,
    programSupervisor: null,
    deviceResponsible: null,
    deviceCoordinator: null,
    deviceSupervisor: null,
  });

  const ensureEntry = ({ scopeType, idProgram, programName, programAcronym, dispositiveId, dispositiveName }) => {
    const key = `${scopeType}:${dispositiveId || idProgram}`;
    if (!resultMap.has(key)) {
      resultMap.set(key, {
        scopeType,
        idProgram: idProgram || null,
        programName: programName || "",
        programAcronym: programAcronym || "",
        dispositiveId: dispositiveId || null,
        dispositiveName: dispositiveName || null,
        isProgramResponsible: false,
        isProgramCoordinator: false,
        isProgramSupervisor: false,
        isDeviceResponsible: false,
        isDeviceCoordinator: false,
        isDeviceSupervisor: false,
        sources: emptySources(),
      });
    }
    return resultMap.get(key);
  };

  const setDirectSource = (entry, sourceKey) => {
    if (!entry.sources[sourceKey]) entry.sources[sourceKey] = { type: "direct", ruleId: null };
  };

  const setRuleSource = (entry, sourceKey, ruleId) => {
    if (!entry.sources[sourceKey]) entry.sources[sourceKey] = { type: "rule", ruleId: String(ruleId) };
  };

  for (const p of directPrograms) {
    const entry = ensureEntry({ scopeType: "program", idProgram: p._id, programName: p.name, programAcronym: p.acronym });

    if ((p.responsible || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramResponsible = true;
      setDirectSource(entry, "programResponsible");
    }

    if ((p.coordinators || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramCoordinator = true;
      setDirectSource(entry, "programCoordinator");
    }

    if ((p.supervisors || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramSupervisor = true;
      setDirectSource(entry, "programSupervisor");
    }
  }

  for (const d of directDispositives) {
    const p = d.program?._id ? d.program : null;
    const entry = ensureEntry({
      scopeType: "dispositive",
      idProgram: p?._id || null,
      programName: p?.name || "",
      programAcronym: p?.acronym || "",
      dispositiveId: d._id,
      dispositiveName: d.name,
    });

    if ((p?.responsible || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramResponsible = true;
      setDirectSource(entry, "programResponsible");
    }

    if ((p?.coordinators || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramCoordinator = true;
      setDirectSource(entry, "programCoordinator");
    }

    if ((p?.supervisors || []).some((x) => isSameId(x, objectUserId))) {
      entry.isProgramSupervisor = true;
      setDirectSource(entry, "programSupervisor");
    }

    if ((d.responsible || []).some((x) => isSameId(x, objectUserId))) {
      entry.isDeviceResponsible = true;
      setDirectSource(entry, "deviceResponsible");
    }

    if ((d.coordinators || []).some((x) => isSameId(x, objectUserId))) {
      entry.isDeviceCoordinator = true;
      setDirectSource(entry, "deviceCoordinator");
    }

    if ((d.supervisors || []).some((x) => isSameId(x, objectUserId))) {
      entry.isDeviceSupervisor = true;
      setDirectSource(entry, "deviceSupervisor");
    }
  }

  for (const rule of userRules) {
    if (rule.scopeType === "program") {
      for (const p of rulePrograms) {
        if (!ruleMatchesProgram(rule, p)) continue;

        const entry = ensureEntry({ scopeType: "program", idProgram: p._id, programName: p.name, programAcronym: p.acronym });

        if (rule.roleType === "responsible") {
          entry.isProgramResponsible = true;
          setRuleSource(entry, "programResponsible", rule._id);
        }

        if (rule.roleType === "coordinators") {
          entry.isProgramCoordinator = true;
          setRuleSource(entry, "programCoordinator", rule._id);
        }

        if (rule.roleType === "supervisors") {
          entry.isProgramSupervisor = true;
          setRuleSource(entry, "programSupervisor", rule._id);
        }
      }

      continue;
    }

    for (const d of ruleDispositives) {
      const p = d.program?._id ? d.program : null;
      if (!ruleMatchesDispositive(rule, d, p)) continue;

      const entry = ensureEntry({
        scopeType: "dispositive",
        idProgram: p?._id || null,
        programName: p?.name || "",
        programAcronym: p?.acronym || "",
        dispositiveId: d._id,
        dispositiveName: d.name,
      });

      if (rule.roleType === "responsible") {
        entry.isDeviceResponsible = true;
        setRuleSource(entry, "deviceResponsible", rule._id);
      }

      if (rule.roleType === "coordinators") {
        entry.isDeviceCoordinator = true;
        setRuleSource(entry, "deviceCoordinator", rule._id);
      }

      if (rule.roleType === "supervisors") {
        entry.isDeviceSupervisor = true;
        setRuleSource(entry, "deviceSupervisor", rule._id);
      }
    }
  }

  const values = [...resultMap.values()];
  const deviceProgramIds = new Set(values.filter((x) => x.dispositiveId).map((x) => String(x.idProgram)).filter(Boolean));

  const result = [
    ...values.filter((x) => x.dispositiveId),
    ...values.filter((x) => !x.dispositiveId && !deviceProgramIds.has(String(x.idProgram))),
  ];

  return response(res, 200, result);
};

/* Igual que getUserScopedRoles pero como helper interno reutilizable y sin necesidad de req/res */
async function getUserScopedRolesData(userId) {
  return buildUserScopedRolesData(userId, false);
}


// Crea una regla de rol global/heredado para un usuario y devuelve la regla creada
const createScopedRoleRule = async (req, res) => {
  const { userId, roleType, scopeType, filters = {}, note = "", active = true } = req.body || {};

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) throw new ClientError("userId no válido", 400);
  if (!allowedRoleTypes.includes(roleType)) throw new ClientError("roleType inválido", 400);
  if (!allowedScopeTypes.includes(scopeType)) throw new ClientError("scopeType inválido", 400);

  const cleanFilters = {
    area: filters.area || null,
    provinceId: filters.provinceId || null,
    entityId: filters.entityId || null,
    programId: filters.programId || null,
    onlyActive: filters.onlyActive !== undefined ? !!filters.onlyActive : true,
  };

  if (cleanFilters.provinceId && !mongoose.Types.ObjectId.isValid(cleanFilters.provinceId)) {
    throw new ClientError("provinceId no válido", 400);
  }

  if (cleanFilters.entityId && !mongoose.Types.ObjectId.isValid(cleanFilters.entityId)) {
    throw new ClientError("entityId no válido", 400);
  }

  if (cleanFilters.programId && !mongoose.Types.ObjectId.isValid(cleanFilters.programId)) {
    throw new ClientError("programId no válido", 400);
  }

  const hasAnyFilter = !!(cleanFilters.area || cleanFilters.provinceId || cleanFilters.entityId || cleanFilters.programId);
  if (!hasAnyFilter) throw new ClientError("Debes indicar al menos un filtro para la regla", 400);

  if (scopeType === "program" && cleanFilters.provinceId) {
    throw new ClientError("Los programas no se pueden acotar por provincia, solo los dispositivos", 400);
  }

  const rule = await ScopedRoleRule.create({
    userId,
    roleType,
    scopeType,
    active: !!active,
    filters: {
      area: cleanFilters.area,
      provinceId: cleanFilters.provinceId ? new mongoose.Types.ObjectId(cleanFilters.provinceId) : null,
      entityId: cleanFilters.entityId ? new mongoose.Types.ObjectId(cleanFilters.entityId) : null,
      programId: cleanFilters.programId ? new mongoose.Types.ObjectId(cleanFilters.programId) : null,
      onlyActive: cleanFilters.onlyActive,
    },
    note: note || "",
  });

  return response(res, 200, rule);
};

// Lista reglas de rol heredado, opcionalmente filtradas por usuario, estado, scope o rol, y devuelve también nombres de referencia útiles para el front
const listScopedRoleRules = async (req, res) => {
  const { userId, active, scopeType, roleType } = req.body || {};
  const query = {};

  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) throw new ClientError("userId no válido", 400);
    query.userId = new mongoose.Types.ObjectId(userId);
  }

  if (active !== undefined) query.active = !!active;
  if (scopeType !== undefined) {
    if (!allowedScopeTypes.includes(scopeType)) throw new ClientError("scopeType inválido", 400);
    query.scopeType = scopeType;
  }

  if (roleType !== undefined) {
    if (!allowedRoleTypes.includes(roleType)) throw new ClientError("roleType inválido", 400);
    query.roleType = roleType;
  }

  const rules = await ScopedRoleRule.find(query)
    .populate({ path: "userId", select: USER_SELECT })
    .populate({ path: "filters.provinceId", select: "name" })
    .populate({ path: "filters.entityId", select: "name" })
    .populate({ path: "filters.programId", select: "name acronym" })
    .sort({ createdAt: -1 })
    .lean();

  const out = rules.map((r) => ({
    _id: r._id,
    active: !!r.active,
    userId: r.userId?._id || r.userId || null,
    user: r.userId?._id ? mapUser(r.userId) : null,
    roleType: r.roleType,
    scopeType: r.scopeType,
    filters: {
      area: r.filters?.area || null,
      provinceId: r.filters?.provinceId?._id || r.filters?.provinceId || null,
      provinceName: r.filters?.provinceId?.name || null,
      entityId: r.filters?.entityId?._id || r.filters?.entityId || null,
      entityName: r.filters?.entityId?.name || null,
      programId: r.filters?.programId?._id || r.filters?.programId || null,
      programName: r.filters?.programId?.name || null,
      programAcronym: r.filters?.programId?.acronym || null,
      onlyActive: r.filters?.onlyActive !== undefined ? !!r.filters.onlyActive : true,
    },
    note: r.note || "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return response(res, 200, out);
};

// Actualiza una regla existente y devuelve la regla ya modificada
const updateScopedRoleRule = async (req, res) => {
  const { ruleId, roleType, scopeType, filters, note, active } = req.body || {};
  if (!ruleId || !mongoose.Types.ObjectId.isValid(ruleId)) throw new ClientError("ruleId no válido", 400);

  const rule = await ScopedRoleRule.findById(ruleId);
  if (!rule) throw new ClientError("Regla no encontrada", 404);

  if (roleType !== undefined) {
    if (!allowedRoleTypes.includes(roleType)) throw new ClientError("roleType inválido", 400);
    rule.roleType = roleType;
  }

  if (scopeType !== undefined) {
    if (!allowedScopeTypes.includes(scopeType)) throw new ClientError("scopeType inválido", 400);
    rule.scopeType = scopeType;
  }

  if (active !== undefined) rule.active = !!active;
  if (note !== undefined) rule.note = note || "";

  if (filters !== undefined) {
    const nextFilters = {
      area: filters.area !== undefined ? (filters.area || null) : (rule.filters?.area || null),
      provinceId: filters.provinceId !== undefined ? (filters.provinceId || null) : (rule.filters?.provinceId || null),
      entityId: filters.entityId !== undefined ? (filters.entityId || null) : (rule.filters?.entityId || null),
      programId: filters.programId !== undefined ? (filters.programId || null) : (rule.filters?.programId || null),
      onlyActive: filters.onlyActive !== undefined ? !!filters.onlyActive : !!rule.filters?.onlyActive,
    };

    if (nextFilters.provinceId && !mongoose.Types.ObjectId.isValid(nextFilters.provinceId)) {
      throw new ClientError("provinceId no válido", 400);
    }

    if (nextFilters.entityId && !mongoose.Types.ObjectId.isValid(nextFilters.entityId)) {
      throw new ClientError("entityId no válido", 400);
    }

    if (nextFilters.programId && !mongoose.Types.ObjectId.isValid(nextFilters.programId)) {
      throw new ClientError("programId no válido", 400);
    }

    const hasAnyFilter = !!(nextFilters.area || nextFilters.provinceId || nextFilters.entityId || nextFilters.programId);
    if (!hasAnyFilter) throw new ClientError("Debes indicar al menos un filtro para la regla", 400);

    const finalScopeType = scopeType || rule.scopeType;
    if (finalScopeType === "program" && nextFilters.provinceId) {
      throw new ClientError("Los programas no se pueden acotar por provincia, solo los dispositivos", 400);
    }

    rule.filters = {
      area: nextFilters.area,
      provinceId: nextFilters.provinceId ? new mongoose.Types.ObjectId(nextFilters.provinceId) : null,
      entityId: nextFilters.entityId ? new mongoose.Types.ObjectId(nextFilters.entityId) : null,
      programId: nextFilters.programId ? new mongoose.Types.ObjectId(nextFilters.programId) : null,
      onlyActive: nextFilters.onlyActive,
    };
  }

  await rule.save();
  return response(res, 200, rule);
};

// Elimina una regla de rol heredado y devuelve confirmación junto con la regla eliminada
const deleteScopedRoleRule = async (req, res) => {
  const { ruleId, _id } = req.body || {};
  const resolvedRuleId = ruleId || _id;

  if (!resolvedRuleId || !mongoose.Types.ObjectId.isValid(resolvedRuleId)) {
    throw new ClientError("ruleId no válido", 400);
  }

  const deleted = await ScopedRoleRule.findByIdAndDelete(resolvedRuleId).lean();
  if (!deleted) throw new ClientError("Regla no encontrada", 404);

  return response(res, 200, {
    deleted: true,
    rule: deleted,
  });
};



module.exports = {
  handleScopedRole: catchAsync(handleScopedRole),
  listScopedRoles: catchAsync(listScopedRoles),
  getUserScopedRoles: catchAsync(getUserScopedRoles),
  getUserScopedRolesData,
  getOrganizationChart: catchAsync(getOrganizationChart),
  createScopedRoleRule:catchAsync(createScopedRoleRule),
  listScopedRoleRules:catchAsync(listScopedRoleRules),
  updateScopedRoleRule:catchAsync(updateScopedRoleRule),
  deleteScopedRoleRule:catchAsync(deleteScopedRoleRule)
};