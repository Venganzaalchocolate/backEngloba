// controllers/permissions/permissionsUnifiedController.js
// ============================================================================
// UNIFIED PERMISSIONS CONTROLLER (profiles-first)
// Models:
// - PermissionProfile
// - UserProfileAssignment
// - UserScope
// - ScopeProfileLink
// - ModuleGrant (materialized, source="profiles")
//
// Rules:
// - ModuleGrant(source="profiles") is MATERIALIZED (not historical):
//   -> sync deletes grants that no longer apply.
// - Deactivate vs Delete are REAL actions everywhere.
// - Any change syncs affected users appropriately.
// ============================================================================

const mongoose = require("mongoose");
const crypto = require("crypto");
const { catchAsync, response, ClientError, toId } = require("../utils/indexUtils");

const { FRONT_MODULES, MODULE_ACTIONS } = require("../utils/permissions");
const { UserProfileAssignment, UserScope, PermissionProfile, ScopeProfileLink, ModuleGrant, Program, Dispositive } = require("../models/indexModels");

// ----------------------------- Base helpers -----------------------------
const isValidId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const oid = (v) => toId(v);

const normArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const parseBool = (v) =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : undefined;

const parseDateOrNull = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === false) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ClientError("expiresAt inválido", 400);
  return d;
};

const paginate = ({ page = 1, limit = 25 }) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 25));
  return { page: p, limit: l, skip: (p - 1) * l };
};

const runPool = async (items, worker, { concurrency = 8 } = {}) => {
  const list = Array.isArray(items) ? items : [];
  let idx = 0;
  const n = Math.max(1, Number(concurrency) || 1);
  const runners = new Array(n).fill(null).map(async () => {
    while (idx < list.length) {
      const i = idx++;
      await worker(list[i], i);
    }
  });
  await Promise.all(runners);
};

const stableHash = (obj) => crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");

const isAlive = (doc, now = new Date()) => {
  if (!doc) return false;
  if (doc.active === false) return false;
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= now.getTime()) return false;
  return true;
};

// ----------------------------- Validation -----------------------------
const assertModule = (m) => {
  const mod = String(m || "").trim();
  if (!FRONT_MODULES.includes(mod)) throw new ClientError(`module inválido: ${mod}`, 400);
};

const assertActions = (actions) => {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new ClientError("actions debe ser array y tener al menos 1", 400);
  }
  for (const a of actions) {
    if (!MODULE_ACTIONS.includes(String(a))) throw new ClientError(`action inválida: ${a}`, 400);
  }
};

// merge actions with '*' semantics
const mergeActions = (setActions, incoming = []) => {
  const arr = Array.isArray(incoming) ? incoming.map(String) : [];
  if (setActions.has("*")) return;
  if (arr.includes("*")) {
    setActions.clear();
    setActions.add("*");
    return;
  }
  arr.forEach((a) => setActions.add(a));
};

// ============================================================================
// MATCHING LOGIC: scopes <-> links
//
// Link provinceId rules:
// - link.provinceId === null => global link => matches any scope province.
// - link.provinceId !== null => matches scopes where:
//     - scope.provinceId === link.provinceId (specific province) OR
//     - scope.provinceId === null (scope = all provinces)
// ============================================================================

const matchAliveScopeBase = (now = new Date()) => ({
  active: true,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

const buildUserScopeMatchForLink = (link, now = new Date()) => {
  const rt = String(link?.resourceType || "").trim();
  const rr = String(link?.role || "").trim();
  if (!rt || !rr) throw new ClientError("ScopeProfileLink inválido (resourceType/role)", 400);

  const match = { resourceType: rt, role: rr, ...matchAliveScopeBase(now) };

  // link global => any scope province
  if (!link?.provinceId) return match;

  // link specific => scope province same OR scope province null (all)
  match.$and = [
    {
      $or: [{ provinceId: oid(link.provinceId) }, { provinceId: null }],
    },
  ];
  return match;
};

// ============================================================================
// SYNC CORE
// - compute effective profiles = manual alive + derived from (alive scopes + active links)
// - ignore profiles inactive OR deletedAt != null
// - materialize ModuleGrant(source="profiles") as upserts per module
// - delete grants that no longer apply
// ============================================================================

const computeEffectiveProfileIdsForUser = async (userId, now = new Date()) => {
  const uid = oid(userId);

  // manual assignments alive
  const assigns = await UserProfileAssignment.find({ userId: uid }).lean();
  const manualAlive = assigns.filter((a) => isAlive(a, now));
  const manualProfileIds = manualAlive.map((a) => String(a.profileId)).filter(isValidId);

  // alive scopes
  const scopes = await UserScope.find({ userId: uid }, { resourceType: 1, role: 1, provinceId: 1, active: 1, expiresAt: 1 })
    .lean();
  const aliveScopes = scopes.filter((s) => isAlive(s, now));

  if (!aliveScopes.length) {
    return [...new Set(manualProfileIds)];
  }

  // dedupe type+role to reduce link query
  const uniqTR = new Map();
  for (const s of aliveScopes) {
    const rt = String(s.resourceType || "");
    const rr = String(s.role || "");
    if (!rt || !rr) continue;
    uniqTR.set(`${rt}__${rr}`, { resourceType: rt, role: rr });
  }
  const orTR = [...uniqTR.values()].map((x) => ({ resourceType: x.resourceType, role: x.role }));
  if (!orTR.length) return [...new Set(manualProfileIds)];

  // links alive for those TR
  const links = await ScopeProfileLink.find(
    { active: true, $or: orTR },
    { resourceType: 1, role: 1, provinceId: 1, profileId: 1, active: 1 }
  ).lean();

  if (!links.length) return [...new Set(manualProfileIds)];

  // index links by TR
  const byTR = new Map();
  for (const l of links) {
    const k = `${String(l.resourceType)}__${String(l.role)}`;
    if (!byTR.has(k)) byTR.set(k, []);
    byTR.get(k).push(l);
  }

  const derived = new Set();

  for (const s of aliveScopes) {
    const rt = String(s.resourceType || "");
    const rr = String(s.role || "");
    const scopeProv = s.provinceId ? String(s.provinceId) : ""; // "" => all provinces
    const key = `${rt}__${rr}`;
    const candidates = byTR.get(key) || [];
    if (!candidates.length) continue;

    for (const l of candidates) {
      const linkProv = l.provinceId ? String(l.provinceId) : ""; // "" => global link
      // global link applies always
      if (!linkProv) {
        derived.add(String(l.profileId));
        continue;
      }
      // specific link applies if scope is all provinces OR same province
      if (!scopeProv || scopeProv === linkProv) {
        derived.add(String(l.profileId));
      }
    }
  }

  return [...new Set([...manualProfileIds, ...Array.from(derived)])].filter(isValidId);
};

const computeModuleGrantsFromProfiles = (profiles) => {
  const byModule = new Map();

  for (const p of profiles) {
    if (!p || p.active === false) continue;
    if (p.deletedAt) continue;

    for (const g of p.moduleGrants || []) {
      if (g?.active === false) continue;

      const mod = String(g?.module || "").trim();
      if (!FRONT_MODULES.includes(mod)) continue;

      const entry = byModule.get(mod) || { actions: new Set(), sourceProfiles: new Set() };
      mergeActions(entry.actions, g.actions || []);
      entry.sourceProfiles.add(String(p._id));
      byModule.set(mod, entry);
    }
  }

  const modules = Array.from(byModule.keys()).sort();
  const computed = modules.map((mod) => {
    const entry = byModule.get(mod);
    const actions = Array.from(entry.actions).sort();
    assertActions(actions);
    const sourceProfiles = Array.from(entry.sourceProfiles).sort();
    return { module: mod, actions, sourceProfiles };
  });

  return { computed, modules, computedHash: stableHash(computed) };
};

const syncUser = async (userId) => {
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);

  const uid = oid(userId);
  const now = new Date();

  const effectiveProfileIds = await computeEffectiveProfileIdsForUser(userId, now);

  const profiles = effectiveProfileIds.length
    ? await PermissionProfile.find(
        { _id: { $in: effectiveProfileIds.map((x) => oid(x)) }, active: true, deletedAt: null },
        { name: 1, active: 1, deletedAt: 1, moduleGrants: 1 }
      ).lean()
    : [];

  const { computed, modules, computedHash } = computeModuleGrantsFromProfiles(profiles);

  // If nothing computed: delete all materialized
  if (!computed.length) {
    const del = await ModuleGrant.deleteMany({ userId: uid, source: "profiles" });
    return { userId: String(userId), syncedModules: 0, deleted: del?.deletedCount || 0, computedHash };
  }

  // upsert by module
  const bulk = computed.map((g) => ({
    updateOne: {
      filter: { userId: uid, module: g.module, source: "profiles" },
      update: {
        $set: {
          actions: g.actions,
          active: true,
          expiresAt: null,
          source: "profiles",
          sourceProfiles: g.sourceProfiles.map((id) => oid(id)),
          computedAt: now,
          computedHash,
          note: "AUTO: perfiles (manual + scopes)",
        },
      },
      upsert: true,
    },
  }));

  if (bulk.length) await ModuleGrant.bulkWrite(bulk, { ordered: false });

  // delete modules no longer granted
  await ModuleGrant.deleteMany({
    userId: uid,
    source: "profiles",
    module: { $nin: modules },
  });

  return { userId: String(userId), syncedModules: modules.length, computedHash };
};

const syncUsers = async (userIds, { concurrency = 8 } = {}) => {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter(isValidId);
  if (!ids.length) return { total: 0, syncedUsers: 0 };

  let ok = 0;
  await runPool(
    ids,
    async (uid) => {
      await syncUser(uid);
      ok++;
    },
    { concurrency }
  );

  return { total: ids.length, syncedUsers: ok };
};

// ============================================================================
// AFFECTED USERS helpers
// - by profileId: manual assignments + users with scopes that match links pointing to profile
// - by link: users with matching alive scopes
// ============================================================================

const listUserIdsByAliveScopesMatch = async (match, now = new Date()) => {
  const scopes = await UserScope.find(match, { userId: 1 }).lean();
  return scopes.map((s) => String(s.userId)).filter(isValidId);
};

const listAffectedUserIdsByProfileId = async (profileId) => {
  const pid = oid(profileId);
  const now = new Date();

  // 1) manual assigns (any state can matter? -> for "profile changed" only active alive matter)
  const assigns = await UserProfileAssignment.find({ profileId: pid }, { userId: 1, active: 1, expiresAt: 1 }).lean();
  const userIdsManual = assigns.filter((a) => isAlive(a, now)).map((a) => String(a.userId));

  // 2) links -> users by scopes
  const links = await ScopeProfileLink.find({ profileId: pid, active: true }, { resourceType: 1, role: 1, provinceId: 1 }).lean();
  const userIdsByLinks = [];

  for (const l of links) {
    const match = buildUserScopeMatchForLink(l, now);
    const uids = await listUserIdsByAliveScopesMatch(match, now);
    uids.forEach((x) => userIdsByLinks.push(x));
  }

  return [...new Set([...userIdsManual, ...userIdsByLinks])].filter(isValidId);
};

const listAffectedUserIdsByLink = async (linkDoc) => {
  const now = new Date();
  const match = buildUserScopeMatchForLink(linkDoc, now);
  const uids = await listUserIdsByAliveScopesMatch(match, now);
  return [...new Set(uids)].filter(isValidId);
};

// ============================================================================
// PROFILES CRUD (PermissionProfile)
// ============================================================================

const listProfiles = async (req, res) => {
  const { active, q, page = 1, limit = 25 } = req.body || {};
  const match = { deletedAt: null };

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

const getProfileById = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await PermissionProfile.findOne({ _id: oid(id), deletedAt: null }).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  return response(res, 200, doc);
};

const createProfile = async (req, res) => {
  const { name, description = "", moduleGrants = [], note = "", active = true } = req.body || {};

  if (!name) throw new ClientError("Falta name", 400);
  if (!Array.isArray(moduleGrants)) throw new ClientError("moduleGrants debe ser array", 400);

  const normalized = moduleGrants.map((g) => {
    const module = String(g?.module || "").trim();
    assertModule(module);

    const actions = normArr(g?.actions).map(String);
    assertActions(actions);

    return { module, actions, active: g?.active === undefined ? true : !!g.active };
  });

  const doc = await PermissionProfile.create({
    name: String(name).trim(),
    description: String(description || ""),
    moduleGrants: normalized,
    note: String(note || ""),
    active: active !== false,
    deletedAt: null,
  });

  return response(res, 201, doc);
};

// update => sync affected
const updateProfile = async (req, res) => {
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
      const module = String(g?.module || "").trim();
      assertModule(module);

      const actions = normArr(g?.actions).map(String);
      assertActions(actions);

      return { module, actions, active: g?.active === undefined ? true : !!g.active };
    });
  }

  const doc = await PermissionProfile.findOneAndUpdate(
    { _id: oid(id), deletedAt: null },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();

  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  const affected = await listAffectedUserIdsByProfileId(id);
  const syncResult = await syncUsers(affected, { concurrency: 8 });

  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

// toggle (deactivate/activate) => sync affected
const toggleProfile = async (req, res) => {
  const { id, active } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const b = parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await PermissionProfile.findOneAndUpdate(
    { _id: oid(id), deletedAt: null },
    { $set: { active: b } },
    { new: true }
  ).lean();

  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  const affected = await listAffectedUserIdsByProfileId(id);
  const syncResult = await syncUsers(affected, { concurrency: 8 });

  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

// delete (hard) => delete assignments + links, then sync affected (computed before delete)
const deleteProfileHard = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  // affected BEFORE deleting links/assignments
  const affected = await listAffectedUserIdsByProfileId(id);

  await Promise.all([
    UserProfileAssignment.deleteMany({ profileId: oid(id) }),
    ScopeProfileLink.deleteMany({ profileId: oid(id) }),
  ]);

  const doc = await PermissionProfile.findByIdAndDelete(oid(id)).lean();
  if (!doc) throw new ClientError("PermissionProfile no encontrado", 404);

  const syncResult = await syncUsers(affected, { concurrency: 8 });

  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

// ============================================================================
// USER PROFILE ASSIGNMENTS CRUD (UserProfileAssignment)
// ============================================================================

const listAssignments = async (req, res) => {
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
      .populate({ path: "profileId", select: "name active deletedAt" })
      .lean(),
    UserProfileAssignment.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

// upsert (keeps historical by deactivating later)
const upsertAssignment = async (req, res) => {
  const { userId, profileId, active = true, expiresAt = null, note = "" } = req.body || {};
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);
  if (!profileId || !isValidId(profileId)) throw new ClientError("profileId inválido", 400);

  const exists = await PermissionProfile.exists({ _id: oid(profileId), active: true, deletedAt: null });
  if (!exists) throw new ClientError("PermissionProfile no encontrado o inactivo", 404);

  const exp = parseDateOrNull(expiresAt);
  if (exp === undefined) throw new ClientError("expiresAt inválido", 400);

  const b = active === undefined ? true : parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await UserProfileAssignment.findOneAndUpdate(
    { userId: oid(userId), profileId: oid(profileId) },
    { $set: { active: b, expiresAt: exp, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const syncResult = await syncUser(userId);
  return response(res, 200, { ...doc, _sync: syncResult });
};

// update (includes deactivate) => sync that user
const updateAssignment = async (req, res) => {
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

  const doc = await UserProfileAssignment.findByIdAndUpdate(oid(id), { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("UserProfileAssignment no encontrado", 404);

  const syncResult = await syncUser(String(doc.userId));
  return response(res, 200, { ...doc, _sync: syncResult });
};

// delete assignment (no historical) => sync that user
const deleteAssignmentHard = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await UserProfileAssignment.findByIdAndDelete(oid(id)).lean();
  if (!doc) throw new ClientError("UserProfileAssignment no encontrado", 404);

  const syncResult = await syncUser(String(doc.userId));
  return response(res, 200, { ...doc, _sync: syncResult });
};

// ============================================================================
// USER SCOPES CRUD (UserScope)
// ============================================================================

const listUserScopes = async (req, res) => {
  const {
    userId,
    resourceType,
    role,
    provinceId,
    resourceId,
    resourceKey,
    active,
    page = 1,
    limit = 25,
  } = req.body || {};

  const match = {};

  if (userId !== undefined) {
    if (userId && !isValidId(userId)) throw new ClientError("userId inválido", 400);
    if (userId) match.userId = oid(userId);
  }

  if (resourceType) match.resourceType = String(resourceType).trim();
  if (role) match.role = String(role).trim();

  if (provinceId !== undefined) {
    if (provinceId && !isValidId(provinceId)) throw new ClientError("provinceId inválido", 400);
    match.provinceId = provinceId ? oid(provinceId) : null;
  }

  // ✅ NUEVO: resourceId
  if (resourceId !== undefined) {
    if (resourceId && !isValidId(resourceId)) throw new ClientError("resourceId inválido", 400);
    match.resourceId = resourceId ? oid(resourceId) : null;
  }

  // ✅ NUEVO: resourceKey
  if (resourceKey !== undefined) {
    match.resourceKey = String(resourceKey || "").trim();
  }
  

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  const { page: p, limit: l, skip } = paginate({ page, limit });

  const [items, total] = await Promise.all([
    UserScope.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(l)
      .populate({ path: "userId", select: "firstName lastName dni email role" })
      .populate({ path: "provinceId", select: "name" })
      .lean(),
    UserScope.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};


const upsertUserScope = async (req, res) => {
  const {
    userId,
    resourceType,
    role,
    provinceId = null,
    resourceId = null,
    resourceKey = "",
    active = true,
    expiresAt = null,
    note = "",
  } = req.body || {};
console.log(req.body)
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);
  if (!resourceType) throw new ClientError("Falta resourceType", 400);
  if (!role) throw new ClientError("Falta role", 400);

  if (provinceId !== null && provinceId !== undefined && provinceId !== "" && !isValidId(provinceId)) {
    throw new ClientError("provinceId inválido", 400);
  }

  // ✅ NUEVO: resourceId
  if (resourceId !== null && resourceId !== undefined && resourceId !== "" && !isValidId(resourceId)) {
    throw new ClientError("resourceId inválido", 400);
  }

  // ✅ NUEVO: resourceKey (solo string)
  if (resourceKey !== null && resourceKey !== undefined && typeof resourceKey !== "string") {
    throw new ClientError("resourceKey inválido", 400);
  }

  const exp = parseDateOrNull(expiresAt);
  if (exp === undefined) throw new ClientError("expiresAt inválido", 400);

  const b = active === undefined ? true : parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await UserScope.findOneAndUpdate(
    {
      userId: oid(userId),
      resourceType: String(resourceType).trim(),
      role: String(role).trim(),
      provinceId: provinceId ? oid(provinceId) : null,

      // ✅ NUEVO: clave de unicidad (debe coincidir con tu index)
      resourceId: resourceId ? oid(resourceId) : null,
      resourceKey: String(resourceKey || "").trim(),
    },
    { $set: { active: b, expiresAt: exp, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  const syncResult = await syncUser(userId);
  return response(res, 200, { ...doc, _sync: syncResult });
};

const deleteUserScopeHard = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const doc = await UserScope.findByIdAndDelete(oid(id)).lean();
  if (!doc) throw new ClientError("UserScope no encontrado", 404);

  const syncResult = await syncUser(String(doc.userId));
  return response(res, 200, { ...doc, _sync: syncResult });
};

// ============================================================================
// SCOPE <-> PROFILE LINKS CRUD (ScopeProfileLink)
// - changes affect users having matching scopes
// ============================================================================

const listScopeProfileLinks = async (req, res) => {

  const { profileId, resourceType, role, provinceId, active, page = 1, limit = 25 } = req.body || {};
  const match = {};

  if (profileId !== undefined) {
    if (profileId && !isValidId(profileId)) throw new ClientError("profileId inválido", 400);
    if (profileId) match.profileId = oid(profileId);
  }
  if (resourceType) match.resourceType = String(resourceType).trim();
  if (role) match.role = String(role).trim();

  if (provinceId !== undefined) {
    if (provinceId && !isValidId(provinceId)) throw new ClientError("provinceId inválido", 400);
    match.provinceId = provinceId ? oid(provinceId) : null;
  }

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    match.active = b;
  }

  const { page: p, limit: l, skip } = paginate({ page, limit });
  const [items, total] = await Promise.all([
    ScopeProfileLink.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(l)
      .populate({ path: "profileId", select: "name active deletedAt" })
      .populate({ path: "provinceId", select: "name" })
      .lean(),
    ScopeProfileLink.countDocuments(match),
  ]);

  return response(res, 200, { items, page: p, limit: l, total, pages: Math.ceil(total / l) || 1 });
};

const updateUserScope = async (req, res) => {
  const { id, active, expiresAt, note, provinceId, resourceId, resourceKey } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const patch = {};

  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }

  if (expiresAt !== undefined) patch.expiresAt = parseDateOrNull(expiresAt);
  if (note !== undefined) patch.note = String(note || "");

  // ✅ permitir cambiar provincia
  if (provinceId !== undefined) {
    if (provinceId && !isValidId(provinceId)) throw new ClientError("provinceId inválido", 400);
    patch.provinceId = provinceId ? oid(provinceId) : null;
  }

  // ✅ permitir cambiar resourceId
  if (resourceId !== undefined) {
    if (resourceId && !isValidId(resourceId)) throw new ClientError("resourceId inválido", 400);
    patch.resourceId = resourceId ? oid(resourceId) : null;
  }

  // ✅ permitir cambiar resourceKey
  if (resourceKey !== undefined) {
    patch.resourceKey = String(resourceKey || "").trim();
  }

  const doc = await UserScope.findByIdAndUpdate(oid(id), { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("UserScope no encontrado", 404);

  const syncResult = await syncUser(String(doc.userId));
  return response(res, 200, { ...doc, _sync: syncResult });
};

const upsertScopeProfileLink = async (req, res) => {
  const { resourceType, role, provinceId = null, profileId, active = true, note = "" } = req.body || {};
  if (!resourceType) throw new ClientError("Falta resourceType", 400);
  if (!role) throw new ClientError("Falta role", 400);
  if (!profileId || !isValidId(profileId)) throw new ClientError("profileId inválido", 400);

  if (provinceId !== null && provinceId !== undefined && provinceId !== "" && !isValidId(provinceId)) {
    throw new ClientError("provinceId inválido", 400);
  }

  const exists = await PermissionProfile.exists({ _id: oid(profileId), active: true, deletedAt: null });
  if (!exists) throw new ClientError("PermissionProfile no encontrado o inactivo", 404);

  const b = active === undefined ? true : parseBool(active);
  if (b === undefined) throw new ClientError("active inválido", 400);

  const doc = await ScopeProfileLink.findOneAndUpdate(
    {
      resourceType: String(resourceType).trim(),
      role: String(role).trim(),
      provinceId: provinceId ? oid(provinceId) : null,
      profileId: oid(profileId),
    },
    { $set: { active: b, note: String(note || "") } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const affected = await listAffectedUserIdsByLink(doc);
  const syncResult = await syncUsers(affected, { concurrency: 8 });

  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

const updateScopeProfileLink = async (req, res) => {
  const { id, active, note } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  const patch = {};
  if (active !== undefined) {
    const b = parseBool(active);
    if (b === undefined) throw new ClientError("active inválido", 400);
    patch.active = b;
  }
  if (note !== undefined) patch.note = String(note || "");

  const doc = await ScopeProfileLink.findByIdAndUpdate(oid(id), { $set: patch }, { new: true }).lean();
  if (!doc) throw new ClientError("ScopeProfileLink no encontrado", 404);

  const affected = await listAffectedUserIdsByLink(doc);
  const syncResult = await syncUsers(affected, { concurrency: 8 });

  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

const deleteScopeProfileLinkHard = async (req, res) => {
  const { id } = req.body || {};
  if (!id || !isValidId(id)) throw new ClientError("id inválido", 400);

  // need doc for affected users BEFORE delete
  const doc = await ScopeProfileLink.findById(oid(id)).lean();
  if (!doc) throw new ClientError("ScopeProfileLink no encontrado", 404);

  const affected = await listAffectedUserIdsByLink(doc);

  await ScopeProfileLink.findByIdAndDelete(oid(id)).lean();

  const syncResult = await syncUsers(affected, { concurrency: 8 });
  return response(res, 200, { ...doc, _sync: { affectedUsers: affected.length, ...syncResult } });
};

// ============================================================================
// Manual sync endpoints (root only in routes/middleware)
// ============================================================================

const syncUserNow = async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || !isValidId(userId)) throw new ClientError("userId inválido", 400);

  const r = await syncUser(userId);
  return response(res, 200, r);
};






// const chunk = (arr, size) => {
//   const out = [];
//   for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//   return out;
// };

// async function main() {

//   const now = new Date();
//   const note = `AUTO backfill scopes ${now.toISOString()}`;

//   // --------------------------------------------
//   // 1) Cargar data mínima
//   // --------------------------------------------
//   const [programs, dispositives] = await Promise.all([
//     Program.find(
//       { active: true },
//       { responsible: 1 } // _id incluido por defecto
//     ).lean(),
//     Dispositive.find(
//       { active: true },
//       { responsible: 1, coordinators: 1, province: 1 } // _id incluido por defecto
//     ).lean(),
//   ]);

//   console.log(`Programs: ${programs.length}`);
//   console.log(`Dispositives: ${dispositives.length}`);

//   // --------------------------------------------
//   // 2) Preparar bulk ops
//   // clave de unicidad: (userId, resourceType, role, provinceId, resourceId, resourceKey)
//   // --------------------------------------------
//   const ops = [];
//   const affectedUsers = new Set();

//   const pushUpsert = ({ userId, resourceType, role, provinceId, resourceId, resourceKey = "" }) => {
//     if (!isValidId(userId)) return;
//     if (provinceId && !isValidId(provinceId)) provinceId = null;
//     if (resourceId && !isValidId(resourceId)) return;

//     const filter = {
//       userId: oid(userId),
//       resourceType: String(resourceType).trim(),
//       role: String(role).trim(),
//       provinceId: provinceId ? oid(provinceId) : null,
//       resourceId: resourceId ? oid(resourceId) : null,
//       resourceKey: String(resourceKey || "").trim(),
//     };

//     ops.push({
//       updateOne: {
//         filter,
//         update: {
//           $set: {
//             active: true,
//             expiresAt: null,
//             note,
//           },
//           $setOnInsert: {
//             createdAt: now,
//           },
//         },
//         upsert: true,
//       },
//     });

//     affectedUsers.add(String(userId));
//   };

//   // Programs.responsible => program/responsable (provinceId null)
//   for (const p of programs) {
//     const pid = String(p._id);
//     const responsibles = Array.isArray(p.responsible) ? p.responsible : [];
//     for (const u of responsibles) {
//       pushUpsert({
//         userId: String(u),
//         resourceType: "program",
//         role: "responsable",
//         provinceId: null,
//         resourceId: pid,
//       });
//     }
//   }

//   // Dispositives.responsible => dispositive/responsable (province = device.province)
//   // Dispositives.coordinators => dispositive/coordinator
//   for (const d of dispositives) {
//     const did = String(d._id);
//     const prov = d.province ? String(d.province) : null;

//     const responsibles = Array.isArray(d.responsible) ? d.responsible : [];
//     for (const u of responsibles) {
//       pushUpsert({
//         userId: String(u),
//         resourceType: "dispositive",
//         role: "responsable",
//         provinceId: prov,
//         resourceId: did,
//       });
//     }

//     const coords = Array.isArray(d.coordinators) ? d.coordinators : [];
//     for (const u of coords) {
//       pushUpsert({
//         userId: String(u),
//         resourceType: "dispositive",
//         role: "coordinator",
//         provinceId: prov,
//         resourceId: did,
//       });
//     }
//   }

//   console.log(`Bulk ops to apply: ${ops.length}`);
//   console.log(`Affected users: ${affectedUsers.size}`);

//   // --------------------------------------------
//   // 3) Ejecutar bulk en batches
//   // --------------------------------------------
//   const batches = chunk(ops, 1000);
//   let wrote = 0;

//   for (const b of batches) {
//     const r = await UserScope.bulkWrite(b, { ordered: false });
//     wrote += (r?.upsertedCount || 0) + (r?.modifiedCount || 0);
//     console.log(`...batch ok (upserted=${r.upsertedCount}, modified=${r.modifiedCount})`);
//   }

//   console.log(`✅ Scopes upserted/modified: ${wrote}`);

//   // --------------------------------------------
//   // 4) Sync permisos materializados para usuarios afectados
//   // --------------------------------------------
//   // NOTA: tu unified controller NO exporta syncUser/syncUsers.
//   // Te recomiendo mover syncUser/syncUsers a un helper (ej: permissionsSyncService.js)
//   // y importarlo aquí.
//   //
//   // Si ya lo tienes disponible:
//   //
//   const ids = Array.from(affectedUsers);
//   const syncRes = await unified._syncUsers(ids, { concurrency: 8 });
//   console.log("✅ sync:", syncRes);


//   console.log("✅ Done");
// }

// main().catch(async (e) => {
//   console.error(e)})

module.exports = {
  // PROFILES
  listProfiles: catchAsync(listProfiles),
  getProfileById: catchAsync(getProfileById),
  createProfile: catchAsync(createProfile),
  updateProfile: catchAsync(updateProfile),
  toggleProfile: catchAsync(toggleProfile),
  deleteProfileHard: catchAsync(deleteProfileHard),

  // ASSIGNMENTS
  listAssignments: catchAsync(listAssignments),
  upsertAssignment: catchAsync(upsertAssignment),
  updateAssignment: catchAsync(updateAssignment),
  deleteAssignmentHard: catchAsync(deleteAssignmentHard),

  // USER SCOPES
  listUserScopes: catchAsync(listUserScopes),
  upsertUserScope: catchAsync(upsertUserScope),
  updateUserScope: catchAsync(updateUserScope),
  deleteUserScopeHard: catchAsync(deleteUserScopeHard),

  // LINKS
  listScopeProfileLinks: catchAsync(listScopeProfileLinks),
  upsertScopeProfileLink: catchAsync(upsertScopeProfileLink),
  updateScopeProfileLink: catchAsync(updateScopeProfileLink),
  deleteScopeProfileLinkHard: catchAsync(deleteScopeProfileLinkHard),

  // SYNC
  syncUserNow: catchAsync(syncUserNow),
};