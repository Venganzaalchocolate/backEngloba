const mongoose = require("mongoose");
const { Program, Dispositive, Provinces } = require("../models/indexModels");
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

const getScopeModel = (scopeType) => {
  if (scopeType === "program") return Program;
  if (scopeType === "dispositive") return Dispositive;
  throw new ClientError(`scopeType '${scopeType}' no soportado`, 400);
};

const getScopeId = ({ scopeType, scopeId, programId, dispositiveId, deviceId }) => {
  if (scopeId) return scopeId;
  if (scopeType === "program") return programId;
  if (scopeType === "dispositive") return dispositiveId || deviceId;
  return null;
};

const normalizeUsersArray = (users, userIds, roleUsers) => {
  const raw = users ?? userIds ?? roleUsers ?? [];
  return Array.isArray(raw) ? raw : [raw];
};

const mapUser = (u) => ({
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
});

const getOrganizationChart = async (req, res) => {
  const {
    activeOnly = false,
    includeEmptyPrograms = true,
    includeEmptyDispositives = true,
    entity,
    programIds,
    dispositiveIds,
  } = req.body || {};

  const normalizeIdsArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => mongoose.Types.ObjectId.isValid(x))
      .map((x) => new mongoose.Types.ObjectId(x));
  };

  const parsedProgramIds = normalizeIdsArray(programIds);
  const parsedDispositiveIds = normalizeIdsArray(dispositiveIds);

  const programQuery = {};
  const dispositiveQuery = {};

  if (activeOnly) {
    programQuery.active = true;
    dispositiveQuery.active = true;
  }

  if (entity && mongoose.Types.ObjectId.isValid(entity)) {
    programQuery.entity = new mongoose.Types.ObjectId(entity);
  }

  if (parsedProgramIds.length) {
    programQuery._id = { $in: parsedProgramIds };
    dispositiveQuery.program = { $in: parsedProgramIds };
  }

  if (parsedDispositiveIds.length) {
    dispositiveQuery._id = { $in: parsedDispositiveIds };
  }

  const programs = await Program.find(programQuery)
    .select("name acronym area entity active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .lean();

  const loadedProgramIds = programs.map((p) => p._id);

  if (!loadedProgramIds.length && !parsedDispositiveIds.length) {
    return response(res, 200, {
      programs: [],
      peopleIndex: {},
    });
  }

  if (!parsedProgramIds.length && loadedProgramIds.length) {
    dispositiveQuery.program = { $in: loadedProgramIds };
  }

  const dispositives = await Dispositive.find(dispositiveQuery)
    .select("name province program active responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .populate({ path: "program", select: "name acronym entity active" })
    .populate({ path: "province", select: "name" })
    .lean();

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
        ...mapUser(user),
        programSupervisions: [],
        programResponsibles: [],
        programCoordinations: [],
        dispositiveSupervisions: [],
        dispositiveResponsibles: [],
        dispositiveCoordinations: [],
      };
    }

    const target = peopleIndex[key][scope.bucket];
    if (!target.some((x) => String(x._id) === String(scope.item._id))) {
      target.push(scope.item);
    }
  };

  const outPrograms = [];

  for (const p of programs) {
    const pid = String(p._id);
    const linkedDispositives = dispositivesByProgram.get(pid) || [];

    if (!includeEmptyPrograms) {
      const hasAnyRole =
        (p.responsible?.length || 0) > 0 ||
        (p.coordinators?.length || 0) > 0 ||
        (p.supervisors?.length || 0) > 0;

      if (!hasAnyRole && linkedDispositives.length === 0) {
        continue;
      }
    }

    const mappedProgram = {
      _id: p._id,
      name: p.name || "",
      acronym: p.acronym || "",
      area: p.area || "",
      entity: p.entity || null,
      active: !!p.active,
      responsibles: (p.responsible || []).map(mapUser),
      coordinators: (p.coordinators || []).map(mapUser),
      supervisors: (p.supervisors || []).map(mapUser),
      dispositives: [],
    };

    mappedProgram.supervisors.forEach((u) =>
      registerPersonScope(u, {
        bucket: "programSupervisions",
        item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active },
      })
    );

    mappedProgram.responsibles.forEach((u) =>
      registerPersonScope(u, {
        bucket: "programResponsibles",
        item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active },
      })
    );

    mappedProgram.coordinators.forEach((u) =>
      registerPersonScope(u, {
        bucket: "programCoordinations",
        item: { _id: p._id, name: p.name || "", acronym: p.acronym || "", active: !!p.active },
      })
    );

    for (const d of linkedDispositives) {
      const mappedDispositive = {
        _id: d._id,
        name: d.name || "",
        active: !!d.active,
        province: d.province
          ? { _id: d.province._id, name: d.province.name || "" }
          : null,
        responsibles: (d.responsible || []).map(mapUser),
        coordinators: (d.coordinators || []).map(mapUser),
        supervisors: (d.supervisors || []).map(mapUser),
      };

      if (!includeEmptyDispositives) {
        const hasAnyRole =
          mappedDispositive.responsibles.length > 0 ||
          mappedDispositive.coordinators.length > 0 ||
          mappedDispositive.supervisors.length > 0;

        if (!hasAnyRole) continue;
      }

      mappedDispositive.supervisors.forEach((u) =>
        registerPersonScope(u, {
          bucket: "dispositiveSupervisions",
          item: {
            _id: d._id,
            name: d.name || "",
            active: !!d.active,
            programId: p._id,
            programName: p.name || "",
            programAcronym: p.acronym || "",
          },
        })
      );

      mappedDispositive.responsibles.forEach((u) =>
        registerPersonScope(u, {
          bucket: "dispositiveResponsibles",
          item: {
            _id: d._id,
            name: d.name || "",
            active: !!d.active,
            programId: p._id,
            programName: p.name || "",
            programAcronym: p.acronym || "",
          },
        })
      );

      mappedDispositive.coordinators.forEach((u) =>
        registerPersonScope(u, {
          bucket: "dispositiveCoordinations",
          item: {
            _id: d._id,
            name: d.name || "",
            active: !!d.active,
            programId: p._id,
            programName: p.name || "",
            programAcronym: p.acronym || "",
          },
        })
      );

      mappedProgram.dispositives.push(mappedDispositive);
    }

    outPrograms.push(mappedProgram);
  }

  return response(res, 200, {
    programs: outPrograms,
    peopleIndex,
  });
};

const handleScopedRole = async (req, res) => {
  const {
    scopeType,
    roleType,
    action,
    removeUserId,
    userId,
  } = req.body;

  if (!allowedScopeTypes.includes(scopeType)) {
    throw new ClientError("scopeType inválido", 400);
  }

  if (!allowedRoleTypes.includes(roleType)) {
    throw new ClientError("roleType inválido", 400);
  }

  if (!allowedActions.includes(action)) {
    throw new ClientError("action inválida", 400);
  }

  const resolvedScopeId = getScopeId(req.body);
  if (!resolvedScopeId) {
    throw new ClientError("Falta scopeId/programId/dispositiveId", 400);
  }

  if (!mongoose.Types.ObjectId.isValid(resolvedScopeId)) {
    throw new ClientError("scopeId no válido", 400);
  }

  const Model = getScopeModel(scopeType);

  switch (action) {
    case "list": {
      const doc = await Model.findById(resolvedScopeId)
        .select(`${roleType}`)
        .populate({
          path: roleType,
          select: USER_SELECT,
        })
        .lean();

      if (!doc) throw new ClientError("Elemento no encontrado", 404);
      return response(res, 200, doc[roleType] || []);
    }

    case "add": {
      const users = normalizeUsersArray(req.body.users, req.body.userIds, req.body.roleUsers)
        .filter(Boolean);

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
      const users = normalizeUsersArray(req.body.users, req.body.userIds, req.body.roleUsers)
        .filter(Boolean);

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

const listScopedRoles = async (req, res) => {
  const {
    responsibles,
    coordinators,
    supervisors,
    allRoles,
  } = req.body;

  const wantResponsibles = !!(responsibles || allRoles);
  const wantCoordinators = !!(coordinators || allRoles);
  const wantSupervisors = !!(supervisors || allRoles);

  if (!wantResponsibles && !wantCoordinators && !wantSupervisors) {
    throw new ClientError(
      "Debes indicar responsibles, coordinators, supervisors o allRoles",
      400
    );
  }

  const provinceMap = new Map();
  const provinces = await Provinces.find({}, { name: 1, subcategories: 1 }).lean();

  provinces.forEach((p) => {
    provinceMap.set(String(p._id), p.name);
    (p.subcategories || []).forEach((sub) => {
      provinceMap.set(String(sub._id), `${p.name} – ${sub.name}`);
    });
  });

  const dispositiveRoleFilter = [];
  if (wantResponsibles) dispositiveRoleFilter.push({ responsible: { $exists: true, $ne: [] } });
  if (wantCoordinators) dispositiveRoleFilter.push({ coordinators: { $exists: true, $ne: [] } });
  if (wantSupervisors) dispositiveRoleFilter.push({ supervisors: { $exists: true, $ne: [] } });

  const programRoleFilter = [];
  if (wantResponsibles) programRoleFilter.push({ responsible: { $exists: true, $ne: [] } });
  if (wantCoordinators) programRoleFilter.push({ coordinators: { $exists: true, $ne: [] } });
  if (wantSupervisors) programRoleFilter.push({ supervisors: { $exists: true, $ne: [] } });

  const dispositives = await Dispositive.find(
    dispositiveRoleFilter.length ? { $or: dispositiveRoleFilter } : {}
  )
    .select("name province program responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .populate({ path: "program", select: "name acronym" })
    .lean();

  const programs = await Program.find(
    programRoleFilter.length ? { $or: programRoleFilter } : {}
  )
    .select("name acronym responsible coordinators supervisors")
    .populate({ path: "responsible", select: USER_SELECT })
    .populate({ path: "coordinators", select: USER_SELECT })
    .populate({ path: "supervisors", select: USER_SELECT })
    .lean();

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
      });
    }
  };

  for (const d of dispositives) {
    const programName = d.program?.acronym ?? d.program?.name ?? null;
    const provinceName = d.province ? (provinceMap.get(String(d.province)) || null) : null;

    if (wantResponsibles) {
      pushUsers({
        users: d.responsible,
        roleType: "responsible",
        scopeType: "dispositive",
        programName,
        dispositiveName: d.name,
        provinceName,
      });
    }

    if (wantCoordinators) {
      pushUsers({
        users: d.coordinators,
        roleType: "coordinators",
        scopeType: "dispositive",
        programName,
        dispositiveName: d.name,
        provinceName,
      });
    }

    if (wantSupervisors) {
      pushUsers({
        users: d.supervisors,
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

    if (wantResponsibles) {
      pushUsers({
        users: p.responsible,
        roleType: "responsible",
        scopeType: "program",
        programName,
        dispositiveName: null,
        provinceName: null,
      });
    }

    if (wantCoordinators) {
      pushUsers({
        users: p.coordinators,
        roleType: "coordinators",
        scopeType: "program",
        programName,
        dispositiveName: null,
        provinceName: null,
      });
    }

    if (wantSupervisors) {
      pushUsers({
        users: p.supervisors,
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

const getUserScopedRoles = async (req, res) => {
  const { userId, _id } = req.body || {};
  const resolvedUserId = userId || _id;

  if (!resolvedUserId || !mongoose.Types.ObjectId.isValid(resolvedUserId)) {
    throw new ClientError("userId no válido", 400);
  }

  const objectUserId = new mongoose.Types.ObjectId(resolvedUserId);

  const programs = await Program.find(
    {
      $or: [
        { responsible: objectUserId },
        { coordinators: objectUserId },
        { supervisors: objectUserId },
      ],
    },
    {
      _id: 1,
      name: 1,
      acronym: 1,
      responsible: 1,
      coordinators: 1,
      supervisors: 1,
    }
  ).lean();

  const programMap = new Map(programs.map((p) => [String(p._id), p]));

  const dispositives = await Dispositive.find(
    {
      $or: [
        { responsible: objectUserId },
        { coordinators: objectUserId },
        { supervisors: objectUserId },
      ],
    },
    {
      _id: 1,
      name: 1,
      program: 1,
      responsible: 1,
      coordinators: 1,
      supervisors: 1,
    }
  )
    .populate({ path: "program", select: "name acronym" })
    .lean();

  const result = [];

  for (const d of dispositives) {
    const progId = d.program ? (d.program._id ?? d.program) : null;
    const progIdStr = progId ? String(progId) : null;
    const p = progIdStr ? programMap.get(progIdStr) : null;

    result.push({
      scopeType: "dispositive",
      idProgram: progId || null,
      programName: d.program?.name ?? p?.name ?? "",
      programAcronym: d.program?.acronym ?? p?.acronym ?? "",
      dispositiveId: d._id,
      dispositiveName: d.name ?? "",
      isProgramResponsible: !!(p?.responsible || []).some((x) => String(x) === String(objectUserId)),
      isProgramCoordinator: !!(p?.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isProgramSupervisor: !!(p?.supervisors || []).some((x) => String(x) === String(objectUserId)),
      isDeviceResponsible: !!(d.responsible || []).some((x) => String(x) === String(objectUserId)),
      isDeviceCoordinator: !!(d.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isDeviceSupervisor: !!(d.supervisors || []).some((x) => String(x) === String(objectUserId)),
    });
  }

  const alreadyListedProgIds = new Set(
    result.map((r) => String(r.idProgram)).filter(Boolean)
  );

  for (const p of programs) {
    if (alreadyListedProgIds.has(String(p._id))) continue;

    result.push({
      scopeType: "program",
      idProgram: p._id,
      programName: p.name,
      programAcronym: p.acronym,
      dispositiveId: null,
      dispositiveName: null,
      isProgramResponsible: !!(p.responsible || []).some((x) => String(x) === String(objectUserId)),
      isProgramCoordinator: !!(p.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isProgramSupervisor: !!(p.supervisors || []).some((x) => String(x) === String(objectUserId)),
      isDeviceResponsible: false,
      isDeviceCoordinator: false,
      isDeviceSupervisor: false,
    });
  }

  return response(res, 200, result);
};

async function getUserScopedRolesData(userId) {
  const objectUserId =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const programs = await Program.find(
    {
      $or: [
        { responsible: objectUserId },
        { coordinators: objectUserId },
        { supervisors: objectUserId },
      ],
    },
    {
      _id: 1,
      name: 1,
      acronym: 1,
      responsible: 1,
      coordinators: 1,
      supervisors: 1,
    }
  ).lean();

  const programMap = new Map(programs.map((p) => [String(p._id), p]));

  const dispositives = await Dispositive.find(
    {
      $or: [
        { responsible: objectUserId },
        { coordinators: objectUserId },
        { supervisors: objectUserId },
      ],
    },
    {
      _id: 1,
      name: 1,
      program: 1,
      responsible: 1,
      coordinators: 1,
      supervisors: 1,
    }
  )
    .populate({ path: "program", select: "name acronym" })
    .lean();

  const result = [];

  for (const d of dispositives) {
    const progId = d.program ? (d.program._id ?? d.program) : null;
    const progIdStr = progId ? String(progId) : null;
    const p = progIdStr ? programMap.get(progIdStr) : null;

    result.push({
      idProgram: progId || null,
      programName: d.program?.name ?? p?.name ?? "",
      programAcronym: d.program?.acronym ?? p?.acronym ?? "",
      dispositiveId: d._id,
      dispositiveName: d.name ?? "",
      isProgramResponsible: !!(p?.responsible || []).some((x) => String(x) === String(objectUserId)),
      isProgramCoordinator: !!(p?.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isProgramSupervisor: !!(p?.supervisors || []).some((x) => String(x) === String(objectUserId)),
      isDeviceResponsible: !!(d.responsible || []).some((x) => String(x) === String(objectUserId)),
      isDeviceCoordinator: !!(d.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isDeviceSupervisor: !!(d.supervisors || []).some((x) => String(x) === String(objectUserId)),
    });
  }

  const alreadyListedProgIds = new Set(
    result.map((r) => String(r.idProgram)).filter(Boolean)
  );

  for (const p of programs) {
    if (alreadyListedProgIds.has(String(p._id))) continue;

    result.push({
      idProgram: p._id,
      programName: p.name,
      programAcronym: p.acronym,
      dispositiveId: null,
      dispositiveName: null,
      isProgramResponsible: !!(p.responsible || []).some((x) => String(x) === String(objectUserId)),
      isProgramCoordinator: !!(p.coordinators || []).some((x) => String(x) === String(objectUserId)),
      isProgramSupervisor: !!(p.supervisors || []).some((x) => String(x) === String(objectUserId)),
      isDeviceResponsible: false,
      isDeviceCoordinator: false,
      isDeviceSupervisor: false,
    });
  }

  return result;
}

module.exports = {
  handleScopedRole: catchAsync(handleScopedRole),
  listScopedRoles: catchAsync(listScopedRoles),
  getUserScopedRoles: catchAsync(getUserScopedRoles),
  getUserScopedRolesData,
  getOrganizationChart: catchAsync(getOrganizationChart),
};