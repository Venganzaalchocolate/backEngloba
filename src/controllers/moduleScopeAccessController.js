const mongoose = require("mongoose");
const { ModuleScopeAccess, Program, Dispositive } = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const { validateRequiredFields } = require("../utils/utils");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const toId = (id) => new mongoose.Types.ObjectId(id);

const getScopePayload = async ({ scopeType, program, dispositive }) => {
  if (!["program", "dispositive"].includes(scopeType)) {
    throw new ClientError("scopeType no válido", 400);
  }

  if (scopeType === "program") {
    if (!program || !isValidId(program)) {
      throw new ClientError("Programa no válido", 400);
    }

    const exists = await Program.exists({ _id: program });
    if (!exists) throw new ClientError("Programa no encontrado", 404);

    return {
      scopeType,
      program: toId(program),
      dispositive: null,
    };
  }

  if (!dispositive || !isValidId(dispositive)) {
    throw new ClientError("Dispositivo no válido", 400);
  }

  const exists = await Dispositive.exists({ _id: dispositive });
  if (!exists) throw new ClientError("Dispositivo no encontrado", 404);

  return {
    scopeType,
    program: null,
    dispositive: toId(dispositive),
  };
};

const upsertModuleScopeAccess = async (req, res) => {
  validateRequiredFields(req.body, ["user", "module", "scopeType"]);

  const { user, module, notes = "", active = true } = req.body;

  if (!isValidId(user)) {
    throw new ClientError("Usuario no válido", 400);
  }

  const scopePayload = await getScopePayload(req.body);

  const query = {
    user: toId(user),
    module: String(module).trim(),
    scopeType: scopePayload.scopeType,
    program: scopePayload.program,
    dispositive: scopePayload.dispositive,
  };

  const saved = await ModuleScopeAccess.findOneAndUpdate(
    query,
    {
      $set: {
        ...query,
        active: !!active,
        notes,
        updatedBy: req.user?._id || null,
      },
      $setOnInsert: {
        createdBy: req.user?._id || null,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  response(res, 200, saved);
};

const listModuleScopeAccess = async (req, res) => {
  const { user, module, active = true } = req.body || {};

  const query = {};

  if (user) {
    if (!isValidId(user)) throw new ClientError("Usuario no válido", 400);
    query.user = toId(user);
  }

  if (module) query.module = String(module).trim();

  if (active !== "all") {
    query.active = active === true || active === "true";
  }

  const items = await ModuleScopeAccess.find(query)
    .populate("user", "firstName lastName email role")
    .populate("program", "name acronym active")
    .populate({
      path: "dispositive",
      select: "name program province active",
      populate: [
        { path: "program", select: "name acronym active" },
        { path: "province", select: "name" },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  response(res, 200, items);
};

const updateModuleScopeAccess = async (req, res) => {
  validateRequiredFields(req.body, ["_id"]);

  const { _id, active, notes } = req.body;

  if (!isValidId(_id)) {
    throw new ClientError("Permiso no válido", 400);
  }

  const update = {
    updatedBy: req.user?._id || null,
  };

  if (active !== undefined) update.active = !!active;
  if (notes !== undefined) update.notes = notes || "";

  const updated = await ModuleScopeAccess.findByIdAndUpdate(
    _id,
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new ClientError("Permiso no encontrado", 404);
  }

  response(res, 200, updated);
};

const deleteModuleScopeAccess = async (req, res) => {
  const { _id, id } = req.body || {};
  const accessId = _id || id;

  if (!accessId || !isValidId(accessId)) {
    throw new ClientError("Permiso no válido", 400);
  }

  const deleted = await ModuleScopeAccess.findByIdAndDelete(accessId);

  if (!deleted) {
    throw new ClientError("Permiso no encontrado", 404);
  }

  response(res, 200, deleted);
};

const getUserModuleScopeAccessData = async (userId, module) => {
  const items = await ModuleScopeAccess.find({
    user: toId(userId),
    module: String(module).trim(),
    active: true,
  })
    .populate("program", "name acronym active")
    .populate({
      path: "dispositive",
      select: "name program active",
      populate: {
        path: "program",
        select: "name acronym active",
      },
    })
    .lean();

  return items
    .map((item) => {
      if (item.scopeType === "program" && item.program) {
        return {
          module: item.module,
          scopeType: "program",
          idProgram: String(item.program._id),
          programName: item.program.name || "",
          programAcronym: item.program.acronym || "",
          dispositiveId: null,
          dispositiveName: null,
          canAccessModuleScope: true,
        };
      }

      if (item.scopeType === "dispositive" && item.dispositive) {
        const program = item.dispositive.program;

        return {
          module: item.module,
          scopeType: "dispositive",
          idProgram: program?._id ? String(program._id) : null,
          programName: program?.name || "",
          programAcronym: program?.acronym || "",
          dispositiveId: String(item.dispositive._id),
          dispositiveName: item.dispositive.name || "",
          canAccessModuleScope: true,
        };
      }

      return null;
    })
    .filter(Boolean);
};

const getUserModuleScopeAccess = async (req, res) => {
  const { userId, _id, module } = req.body || {};
  const user = userId || _id;

  if (!user || !isValidId(user)) {
    throw new ClientError("Usuario no válido", 400);
  }

  if (!module) {
    throw new ClientError("El módulo es obligatorio", 400);
  }

  const scopes = await getUserModuleScopeAccessData(user, module);

  response(res, 200, scopes);
};

module.exports = {
  upsertModuleScopeAccess: catchAsync(upsertModuleScopeAccess),
  listModuleScopeAccess: catchAsync(listModuleScopeAccess),
  updateModuleScopeAccess: catchAsync(updateModuleScopeAccess),
  deleteModuleScopeAccess: catchAsync(deleteModuleScopeAccess),
  getUserModuleScopeAccess: catchAsync(getUserModuleScopeAccess),
  getUserModuleScopeAccessData,
};