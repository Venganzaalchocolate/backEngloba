// controllers/permissionsAdminController.js
// ============================================================================
// ADMIN PERMISSIONS
// - ModuleGrant: acceso por módulo del front (audits, volunteer, payroll...)
// - ResourceMembership: rol por recurso (program/dispositive/province/area) para scoping
// - UX: get/set permisos de un usuario en 1 llamada + presets
// ============================================================================

const mongoose = require("mongoose");
const { catchAsync, response, ClientError, toId } = require("../utils/indexUtils");
const { ModuleGrant, ResourceMembership, Program, Dispositive, User, PermissionProfile, UserProfileAssignment } = require("../models/indexModels");
const {
  FRONT_MODULES,
  MODULE_ACTIONS,
  RESOURCE_TYPES,
  RESOURCE_ROLES,
  PRESETS,
} = require("../utils/permissions");

// ----------------------------- Helpers internos -----------------------------
// Normaliza arrays: "read" -> ["read"], null -> []
const normArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Parseo boolean para body (true/"true", false/"false")
const parseBool = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

// Date opcional (null si no viene)
const parseDateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ClientError("expiresAt inválido", 400);
  return d;
};

// Paginación segura
const paginate = ({ page = 1, limit = 25 }) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 25));
  return { page: p, limit: l, skip: (p - 1) * l };
};

// Validaciones (bulk/presets)
const assertActions = (actions) => {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new ClientError("actions debe ser array y tener al menos 1", 400);
  }
  for (const a of actions) {
    if (!MODULE_ACTIONS.includes(String(a))) throw new ClientError(`action inválida: ${a}`, 400);
  }
};
const assertModule = (m) => {
  if (!FRONT_MODULES.includes(String(m))) throw new ClientError(`module inválido: ${m}`, 400);
};
const assertResource = ({ resourceType, resourceId, role }) => {
  if (!RESOURCE_TYPES.includes(String(resourceType))) throw new ClientError("resourceType inválido", 400);
  if (!resourceId || !toId(resourceId)) throw new ClientError("resourceId inválido", 400);
  if (!RESOURCE_ROLES.includes(String(role))) throw new ClientError("role inválido", 400);
};

// ============================================================================
// 1) MODULE GRANT CRUD (permisos por módulo)
// ============================================================================

const listModuleGrants = async (req, res) => {
  const { userId, module, action, active, q, page = 1, limit = 25 } = req.body || {};
  const match = {};

if (userId !== undefined) {
  if (userId && !isValidId(userId)) throw new ClientError("userId inválido", 400);
  if (userId) match.userId = toId(userId);
}


  if (module !== undefined) {
    if (module && !FRONT_MODULES.includes(String(module))) throw new ClientError("module inválido", 400);
    if (module) match.module = String(module);
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  if (action) {
    const a = String(action);
    if (!MODULE_ACTIONS.includes(a)) throw new ClientError("action inválida", 400);
    match.actions = { $in: [a] };
  }

  if (q) match.$or = [{ note: { $regex: String(q), $options: "i" } }];

  const { page: p, limit: l, skip } = paginate({ page, limit });

  const [items, total] = await Promise.all([
    ModuleGrant.find(match).sort({ updatedAt: -1 }).skip(skip).limit(l).lean(),
    ModuleGrant.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

const getModuleGrantById = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const item = await ModuleGrant.findById(id).lean();
  if (!item) throw new ClientError("ModuleGrant no encontrado", 404);

  return response(res, 200, item);
};

const upsertModuleGrant = async (req, res) => {
  const { userId, module, actions, active = true, expiresAt = null, note = "" } = req.body || {};

  if (!userId || !toId(userId)) throw new ClientError("userId inválido", 400);
  if (!module || !FRONT_MODULES.includes(String(module))) throw new ClientError("module inválido", 400);

  const acts = normArr(actions).map(String);
  if (!acts.length) throw new ClientError("actions es obligatorio (al menos 1)", 400);
  for (const a of acts) if (!MODULE_ACTIONS.includes(a)) throw new ClientError(`action inválida: ${a}`, 400);

  const exp = parseDateOrNull(expiresAt);

  const doc = await ModuleGrant.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), module: String(module) },
    { $set: { actions: acts, active: !!active, expiresAt: exp, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return response(res, 200, doc);
};

const updateModuleGrant = async (req, res) => {
  const { id, actions, active, expiresAt, note } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const patch = {};

  if (actions !== undefined) {
    const acts = normArr(actions).map(String);
    if (!acts.length) throw new ClientError("actions debe tener al menos 1", 400);
    for (const a of acts) if (!MODULE_ACTIONS.includes(a)) throw new ClientError(`action inválida: ${a}`, 400);
    patch.actions = acts;
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }

  if (expiresAt !== undefined) patch.expiresAt = parseDateOrNull(expiresAt);
  if (note !== undefined) patch.note = String(note || "");

  const doc = await ModuleGrant.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("ModuleGrant no encontrado", 404);

  return response(res, 200, doc);
};

const toggleModuleGrant = async (req, res) => {
  const { id, active } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const b = parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await ModuleGrant.findByIdAndUpdate(id, { $set: { active: b } }, { new: true }).lean();
  if (!doc) throw new ClientError("ModuleGrant no encontrado", 404);

  return response(res, 200, doc);
};

const deleteModuleGrant = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const doc = await ModuleGrant.findByIdAndDelete(id).lean();
  if (!doc) throw new ClientError("ModuleGrant no encontrado", 404);

  return response(res, 200, doc);
};

// ============================================================================
// 2) RESOURCE MEMBERSHIP CRUD (rol por recurso / scoping)
// ============================================================================

const listResourceMemberships = async (req, res) => {
  const { userId, resourceType, resourceId, role, active, q, page = 1, limit = 25 } = req.body || {};
  const match = {};

if (userId !== undefined) {
  if (userId && !isValidId(userId)) throw new ClientError("userId inválido", 400);
  if (userId) match.userId = toId(userId);
}


  if (resourceType !== undefined) {
    if (resourceType && !RESOURCE_TYPES.includes(String(resourceType))) throw new ClientError("resourceType inválido", 400);
    if (resourceType) match.resourceType = String(resourceType);
  }

  if (resourceId !== undefined) {
    if (resourceId && !toId(resourceId)) throw new ClientError("resourceId inválido", 400);
    if (resourceId) match.resourceId = new mongoose.Types.ObjectId(resourceId);
  }

  if (role !== undefined) {
    if (role && !RESOURCE_ROLES.includes(String(role))) throw new ClientError("role inválido", 400);
    if (role) match.role = String(role);
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  if (q) match.$or = [{ note: { $regex: String(q), $options: "i" } }];

  const { page: p, limit: l, skip } = paginate({ page, limit });

  const [items, total] = await Promise.all([
    ResourceMembership.find(match).sort({ updatedAt: -1 }).skip(skip).limit(l).lean(),
    ResourceMembership.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

const getResourceMembershipById = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const item = await ResourceMembership.findById(id).lean();
  if (!item) throw new ClientError("ResourceMembership no encontrado", 404);

  return response(res, 200, item);
};

const upsertResourceMembership = async (req, res) => {
  const { userId, resourceType, resourceId, role, active = true, expiresAt = null, note = "" } = req.body || {};

  if (!userId || !toId(userId)) throw new ClientError("userId inválido", 400);
  if (!resourceType || !RESOURCE_TYPES.includes(String(resourceType))) throw new ClientError("resourceType inválido", 400);
if (!resourceId || !isValidId(resourceId)) throw new ClientError("resourceId inválido", 400);
  if (!role || !RESOURCE_ROLES.includes(String(role))) throw new ClientError("role inválido", 400);

  const exp = parseDateOrNull(expiresAt);

  const doc = await ResourceMembership.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(userId),
      resourceType: String(resourceType),
      resourceId: new mongoose.Types.ObjectId(resourceId),
      role: String(role),
    },
    { $set: { active: !!active, expiresAt: exp, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return response(res, 200, doc);
};

const updateResourceMembership = async (req, res) => {
  const { id, role, active, expiresAt, note } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const patch = {};

  if (role !== undefined) {
    if (role && !RESOURCE_ROLES.includes(String(role))) throw new ClientError("role inválido", 400);
    patch.role = String(role);
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }

  if (expiresAt !== undefined) patch.expiresAt = parseDateOrNull(expiresAt);
  if (note !== undefined) patch.note = String(note || "");

  const doc = await ResourceMembership.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("ResourceMembership no encontrado", 404);

  return response(res, 200, doc);
};

const toggleResourceMembership = async (req, res) => {
  const { id, active } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const b = parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await ResourceMembership.findByIdAndUpdate(id, { $set: { active: b } }, { new: true }).lean();
  if (!doc) throw new ClientError("ResourceMembership no encontrado", 404);

  return response(res, 200, doc);
};

const deleteResourceMembership = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !toId(id)) throw new ClientError("id inválido", 400);

  const doc = await ResourceMembership.findByIdAndDelete(id).lean();
  if (!doc) throw new ClientError("ResourceMembership no encontrado", 404);

  return response(res, 200, doc);
};

// ============================================================================
// 3) UX helpers: permisos completos de un usuario + presets
// ============================================================================

const getUserPermissions = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || !toId(userId)) throw new ClientError("userId inválido", 400);

  const uid = new mongoose.Types.ObjectId(userId);
  const [moduleGrants, resourceMemberships] = await Promise.all([
    ModuleGrant.find({ userId: uid }).sort({ module: 1 }).lean(),
    ResourceMembership.find({ userId: uid }).sort({ resourceType: 1, resourceId: 1, role: 1 }).lean(),
  ]);

  return response(res, 200, { moduleGrants, resourceMemberships });
};

// Guarda en bloque: upsert lo que llega + desactiva lo que ya no viene (replace controlado)
const setUserPermissions = async (req, res) => {
  const { userId, moduleGrants = [], resourceMemberships = [] } = req.body || {};
  if (!userId || !toId(userId)) throw new ClientError("userId inválido", 400);
  if (!Array.isArray(moduleGrants)) throw new ClientError("moduleGrants debe ser array", 400);
  if (!Array.isArray(resourceMemberships)) throw new ClientError("resourceMemberships debe ser array", 400);

  const uid = new mongoose.Types.ObjectId(userId);

  const grantsNormalized = moduleGrants.map((g) => {
    const module = String(g.module); assertModule(module);
    const actions = (Array.isArray(g.actions) ? g.actions : []).map(String); assertActions(actions);
    return {
      module,
      actions,
      active: g.active === undefined ? true : !!g.active,
      expiresAt: g.expiresAt === undefined ? null : parseDateOrNull(g.expiresAt),
      note: String(g.note || ""),
    };
  });

  const membershipsNormalized = resourceMemberships.map((m) => {
    const resourceType = String(m.resourceType);
    const resourceId = String(m.resourceId);
    const role = String(m.role);
    assertResource({ resourceType, resourceId, role });
    return {
      resourceType,
      resourceId,
      role,
      active: m.active === undefined ? true : !!m.active,
      expiresAt: m.expiresAt === undefined ? null : parseDateOrNull(m.expiresAt),
      note: String(m.note || ""),
    };
  });

  for (const g of grantsNormalized) {
    await ModuleGrant.findOneAndUpdate(
      { userId: uid, module: g.module },
      { $set: { actions: g.actions, active: g.active, expiresAt: g.expiresAt, note: g.note } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  const incomingModules = new Set(grantsNormalized.map((g) => g.module));
  await ModuleGrant.updateMany(
    { userId: uid, ...(incomingModules.size ? { module: { $nin: Array.from(incomingModules) } } : {}) },
    { $set: { active: false } }
  );

  for (const m of membershipsNormalized) {
    await ResourceMembership.findOneAndUpdate(
      { userId: uid, resourceType: m.resourceType, resourceId: new mongoose.Types.ObjectId(m.resourceId), role: m.role },
      { $set: { active: m.active, expiresAt: m.expiresAt, note: m.note } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  const incomingFps = new Set(membershipsNormalized.map((m) => `${m.resourceType}:${m.resourceId}:${m.role}`));
  const existing = await ResourceMembership.find({ userId: uid }).lean();
  const toDisableIds = existing
    .filter((e) => !incomingFps.has(`${e.resourceType}:${String(e.resourceId)}:${e.role}`))
    .map((e) => e._id);

  if (toDisableIds.length) {
    await ResourceMembership.updateMany({ _id: { $in: toDisableIds } }, { $set: { active: false } });
  }

  const [moduleGrantsFinal, resourceMembershipsFinal] = await Promise.all([
    ModuleGrant.find({ userId: uid }).sort({ module: 1 }).lean(),
    ResourceMembership.find({ userId: uid }).sort({ resourceType: 1, resourceId: 1, role: 1 }).lean(),
  ]);

  return response(res, 200, { moduleGrants: moduleGrantsFinal, resourceMemberships: resourceMembershipsFinal });
};

// Aplica preset: replace (solo preset) o merge (sumar sin quitar lo existente)
const applyPermissionsPreset = async (req, res) => {
  const { userId, presetKey, mode = "merge" } = req.body || {};
  if (!userId || !toId(userId)) throw new ClientError("userId inválido", 400);
  if (!presetKey || !PRESETS[presetKey]) throw new ClientError("presetKey inválido", 400);
  if (!["merge", "replace"].includes(String(mode))) throw new ClientError("mode inválido", 400);

  const uid = new mongoose.Types.ObjectId(userId);
  const preset = PRESETS[presetKey];

  if (mode === "replace") {
    req.body = { userId, moduleGrants: preset.moduleGrants || [], resourceMemberships: preset.resourceMemberships || [] };
    return setUserPermissions(req, res);
  }

  const [currentGrants, currentMemberships] = await Promise.all([
    ModuleGrant.find({ userId: uid }).lean(),
    ResourceMembership.find({ userId: uid }).lean(),
  ]);

  const grantMap = new Map(currentGrants.map((g) => [String(g.module), g]));
  for (const g of preset.moduleGrants || []) {
    assertModule(g.module);
    assertActions(g.actions);
    const prev = grantMap.get(String(g.module)) || {};
    grantMap.set(String(g.module), {
      ...prev,
      module: String(g.module),
      actions: g.actions.map(String),
      active: true,
      expiresAt: prev.expiresAt || null,
      note: prev.note || "",
    });
  }

  const fp = (m) => `${m.resourceType}:${String(m.resourceId)}:${m.role}`;
  const membershipFpSet = new Set(currentMemberships.map(fp));
  const mergedMemberships = currentMemberships.map((m) => ({
    resourceType: m.resourceType,
    resourceId: String(m.resourceId),
    role: m.role,
    active: m.active !== false,
    expiresAt: m.expiresAt || null,
    note: m.note || "",
  }));

  for (const m of preset.resourceMemberships || []) {
    assertResource(m);
    const f = `${m.resourceType}:${String(m.resourceId)}:${m.role}`;
    if (!membershipFpSet.has(f)) {
      mergedMemberships.push({ resourceType: String(m.resourceType), resourceId: String(m.resourceId), role: String(m.role), active: true, expiresAt: null, note: "" });
      membershipFpSet.add(f);
    }
  }

  req.body = {
    userId,
    moduleGrants: Array.from(grantMap.values()).map((g) => ({
      module: String(g.module),
      actions: (g.actions || []).map(String),
      active: g.active !== false,
      expiresAt: g.expiresAt || null,
      note: g.note || "",
    })),
    resourceMemberships: mergedMemberships,
  };

  return setUserPermissions(req, res);
};

// ============================================================================
// Exports (tu estilo): catchAsync(fn)
// ============================================================================
// ============================================================================
// 4) PERFILES (PermissionProfile) + ASIGNACIONES (UserProfileAssignment)
//    + SYNC (materializar a ModuleGrant) + BULK por recurso
// ============================================================================

// ------------------------- Helpers extra (IDs, caducidad) -------------------
const isValidId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const oid = (v) => new mongoose.Types.ObjectId(v);

const isAssignmentAlive = (a, now = new Date()) => {
  if (a.active === false) return false;
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= now.getTime()) return false;
  return true;
};

// ------------------------- 4.1) CRUD PermissionProfile ----------------------
// LIST profiles
const listPermissionProfiles = async (req, res) => {
  const { active, q, page = 1, limit = 25 } = req.body || {};
  const match = {};

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  if (q) {
    match.$or = [
      { name: { $regex: String(q), $options: "i" } },
      { description: { $regex: String(q), $options: "i" } },
      { note: { $regex: String(q), $options: "i" } },
    ];
  }

  const { page: p, limit: l, skip } = paginate({ page, limit });

  const [items, total] = await Promise.all([
    PermissionProfile.find(match).sort({ updatedAt: -1 }).skip(skip).limit(l).lean(),
    PermissionProfile.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

// GET profile by id
const getPermissionProfileById = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await PermissionProfile.findById(id).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  return response(res, 200, doc);
};

// CREATE profile
const createPermissionProfile = async (req, res) => {
  const { name, description = "", moduleGrants = [], note = "", active = true } = req.body || {};
  if (!name) throw new ClientError("Falta name", 400);
  if (!Array.isArray(moduleGrants)) throw new ClientError("moduleGrants debe ser array", 400);

  // Validar moduleGrants (mismo criterio que ModuleGrant)
  const normalized = moduleGrants.map((g) => {
    const module = String(g.module); assertModule(module);
    const actions = (Array.isArray(g.actions) ? g.actions : []).map(String); assertActions(actions);
    return { module, actions, active: g.active === undefined ? true : !!g.active };
  });

  const doc = await PermissionProfile.create({
    name: String(name).trim(),
    description: String(description || ""),
    moduleGrants: normalized,
    note: String(note || ""),
    active: active !== false,
  });

  return response(res, 201, doc);
};

// UPDATE profile
const updatePermissionProfile = async (req, res) => {
  const { id, name, description, moduleGrants, note, active } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (description !== undefined) patch.description = String(description || "");
  if (note !== undefined) patch.note = String(note || "");
  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }

  if (moduleGrants !== undefined) {
    if (!Array.isArray(moduleGrants)) throw new ClientError("moduleGrants debe ser array", 400);
    patch.moduleGrants = moduleGrants.map((g) => {
      const module = String(g.module); assertModule(module);
      const actions = (Array.isArray(g.actions) ? g.actions : []).map(String); assertActions(actions);
      return { module, actions, active: g.active === undefined ? true : !!g.active };
    });
  }

  const doc = await PermissionProfile.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  return response(res, 200, doc);
};

// TOGGLE profile
const togglePermissionProfile = async (req, res) => {
  const { id, active } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const b = parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await PermissionProfile.findByIdAndUpdate(id, { $set: { active: b } }, { new: true }).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  return response(res, 200, doc);
};

// DELETE profile (físico)
const deletePermissionProfile = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await PermissionProfile.findByIdAndDelete(id).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  return response(res, 200, doc);
};

// ------------------------- 4.2) CRUD UserProfileAssignment ------------------
// LIST assignments
const listUserProfileAssignments = async (req, res) => {
  const { userId, profileId, active, page = 1, limit = 25 } = req.body || {};
  const match = {};

  if (userId !== undefined) {
    if (userId && !isValidId(userId)) throw new ClientError("userId inválido", 400);
    if (userId) match.userId = oid(userId);
  }

  if (profileId !== undefined) {
    if (profileId && !isValidId(profileId)) throw new ClientError("profileId inválido", 400);
    if (profileId) match.profileId = oid(profileId);
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  const { page: p, limit: l, skip } = paginate({ page, limit });

  const [items, total] = await Promise.all([
    UserProfileAssignment.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(l)
      .populate({ path: "userId", select: "firstName lastName dni email role" })
      .populate({ path: "profileId", select: "name active" })
      .lean(),
    UserProfileAssignment.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

// UPSERT assignment (clave userId+profileId)
const upsertUserProfileAssignment = async (req, res) => {
  const { userId, profileId, active = true, expiresAt = null, note = "" } = req.body || {};
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);
  if (!profileId || !isValidId(profileId)) throw new ClientError("profileId inválido", 400);

  const exp = parseDateOrNull(expiresAt);

  const doc = await UserProfileAssignment.findOneAndUpdate(
    { userId: oid(userId), profileId: oid(profileId) },
    { $set: { active: active !== false, expiresAt: exp, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return response(res, 200, doc);
};

// UPDATE assignment por id
const updateUserProfileAssignment = async (req, res) => {
  const { id, active, expiresAt, note } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const patch = {};
  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }
  if (expiresAt !== undefined) patch.expiresAt = parseDateOrNull(expiresAt);
  if (note !== undefined) patch.note = String(note || "");

  const doc = await UserProfileAssignment.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("UserProfileAssignment no encontrado", 404);

  return response(res, 200, doc);
};

// DELETE assignment físico
const deleteUserProfileAssignment = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await UserProfileAssignment.findByIdAndDelete(id).lean();
  if (!doc) throw new ClientError("UserProfileAssignment no encontrado", 404);

  return response(res, 200, doc);
};

// ------------------------- 4.3) SYNC perfiles -> ModuleGrant ----------------
// Esta función "materializa" los perfiles activos asignados al usuario en ModuleGrant.
// - Merge de acciones por módulo
// - No toca ResourceMembership (eso es otro concepto)
// - Si el usuario es root/global, normalmente ni haría falta, pero lo dejamos.
const syncUserModuleGrantsFromProfiles = async (userId) => {
  const uid = oid(userId);
  const now = new Date();

  // assignments vivos
  const assigns = await UserProfileAssignment.find({ userId: uid }).lean();
  const alive = assigns.filter((a) => isAssignmentAlive(a, now));
  if (!alive.length) return { synced: 0, modules: [] };

  const profiles = await PermissionProfile.find({
    _id: { $in: alive.map((a) => a.profileId) },
    active: true,
  }).lean();

  // merge por módulo -> Set(actions)
  const byModule = new Map();
  for (const p of profiles) {
    for (const g of (p.moduleGrants || [])) {
      if (g.active === false) continue;
      const mod = String(g.module);
      if (!FRONT_MODULES.includes(mod)) continue; // seguridad extra

      const set = byModule.get(mod) || new Set();
      (g.actions || []).forEach((a) => set.add(String(a)));
      byModule.set(mod, set);
    }
  }

  const modules = Array.from(byModule.keys());
  let synced = 0;

  for (const mod of modules) {
    const actions = Array.from(byModule.get(mod) || []);
    // validación de acciones por si el perfil tiene basura
    for (const a of actions) if (!MODULE_ACTIONS.includes(a)) throw new ClientError(`action inválida en perfil: ${a}`, 400);

    await ModuleGrant.findOneAndUpdate(
      { userId: uid, module: mod },
      {
        $set: {
          actions,
          active: true,
          expiresAt: null,
          note: "AUTO: perfiles",
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    synced++;
  }

  return { synced, modules };
};

// Endpoint: SYNC un usuario
const syncUserProfiles = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);

  const result = await syncUserModuleGrantsFromProfiles(userId);
  return response(res, 200, result);
};

// ------------------------- 4.4) BULK: aplicar perfil a miembros de recurso ----
// Entrada:
// { profileId, resourceType, resourceId, roles?: ["responsable","coordinator","viewer"], mode?: "merge"|"replace" }
// - merge: crea/activa assignment sin tocar otros perfiles
// - replace: desactiva otros assignments del usuario y deja SOLO ese perfil (peligroso, pero útil a veces)
const applyProfileToResourceMembers = async (req, res) => {
  const { profileId, resourceType, resourceId, roles = [], mode = "merge", expiresAt = null, note = "" } = req.body || {};

  if (!profileId || !isValidId(profileId)) throw new ClientError("profileId inválido", 400);
  assertResource({ resourceType, resourceId, role: (roles && roles[0]) ? roles[0] : "viewer" }); // valida type/id y que role sea conocido

  if (!["merge", "replace"].includes(String(mode))) throw new ClientError("mode inválido", 400);

  const rolesArr = Array.isArray(roles) && roles.length ? roles.map(String) : ["responsable", "coordinator", "viewer"];
  for (const r of rolesArr) {
    if (!RESOURCE_ROLES.includes(r)) throw new ClientError(`role inválido: ${r}`, 400);
  }

  const exp = parseDateOrNull(expiresAt);

  // 1) Obtener miembros del recurso desde ResourceMembership
  const members = await ResourceMembership.find({
    resourceType: String(resourceType),
    resourceId: oid(resourceId),
    role: { $in: rolesArr },
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }, { userId: 1 }).lean();

  const userIds = [...new Set(members.map(m => String(m.userId)))];
  if (!userIds.length) return response(res, 200, { applied: 0, synced: 0, users: [] });

  // 2) Aplicar assignment para cada usuario
  //    - merge => upsert del assignment
  //    - replace => desactivar otros assignments y dejar este
  let applied = 0;

  for (const uidStr of userIds) {
    const uid = oid(uidStr);

    if (mode === "replace") {
      await UserProfileAssignment.updateMany(
        { userId: uid },
        { $set: { active: false } }
      );
    }

    await UserProfileAssignment.findOneAndUpdate(
      { userId: uid, profileId: oid(profileId) },
      { $set: { active: true, expiresAt: exp, note: String(note || "") } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    applied++;
  }

  // 3) SYNC de todos los usuarios afectados (materializa a ModuleGrant)
  let synced = 0;
  for (const uidStr of userIds) {
    const r = await syncUserModuleGrantsFromProfiles(uidStr);
    synced += r.synced;
  }

  return response(res, 200, { applied, synced, users: userIds });
};




module.exports = {
  // ModuleGrant
  listModuleGrants: catchAsync(listModuleGrants),
  getModuleGrantById: catchAsync(getModuleGrantById),
  upsertModuleGrant: catchAsync(upsertModuleGrant),
  updateModuleGrant: catchAsync(updateModuleGrant),
  toggleModuleGrant: catchAsync(toggleModuleGrant),
  deleteModuleGrant: catchAsync(deleteModuleGrant),

  // ResourceMembership
  listResourceMemberships: catchAsync(listResourceMemberships),
  getResourceMembershipById: catchAsync(getResourceMembershipById),
  upsertResourceMembership: catchAsync(upsertResourceMembership),
  updateResourceMembership: catchAsync(updateResourceMembership),
  toggleResourceMembership: catchAsync(toggleResourceMembership),
  deleteResourceMembership: catchAsync(deleteResourceMembership),

  // UX
  getUserPermissions: catchAsync(getUserPermissions),
  setUserPermissions: catchAsync(setUserPermissions),
  applyPermissionsPreset: catchAsync(applyPermissionsPreset),

    // Profiles
  listPermissionProfiles: catchAsync(listPermissionProfiles),
  getPermissionProfileById: catchAsync(getPermissionProfileById),
  createPermissionProfile: catchAsync(createPermissionProfile),
  updatePermissionProfile: catchAsync(updatePermissionProfile),
  togglePermissionProfile: catchAsync(togglePermissionProfile),
  deletePermissionProfile: catchAsync(deletePermissionProfile),

  // Assignments
  listUserProfileAssignments: catchAsync(listUserProfileAssignments),
  upsertUserProfileAssignment: catchAsync(upsertUserProfileAssignment),
  updateUserProfileAssignment: catchAsync(updateUserProfileAssignment),
  deleteUserProfileAssignment: catchAsync(deleteUserProfileAssignment),

  // Sync / Bulk
  syncUserProfiles: catchAsync(syncUserProfiles),
  applyProfileToResourceMembers: catchAsync(applyProfileToResourceMembers),
};
