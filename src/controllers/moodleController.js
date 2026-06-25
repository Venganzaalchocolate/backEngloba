const crypto = require("crypto");
const mongoose = require("mongoose");

const { User } = require("../models/indexModels");
const moodleService = require("../services/moodleService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const buildMoodleUserFromUser = (user) => {
  if (!user.email) {
    throw new ClientError(
      "El usuario no tiene correo corporativo para Moodle",
      400
    );
  }

  return {
    firstname: String(user.firstName || "").trim() || "Sin nombre",
    lastname: String(user.lastName || "").trim() || "Sin apellidos",
    email: String(user.email).trim().toLowerCase(),
  };
};

const findMoodleUserByLocalUser = async (user) => {
  const byIdnumber = await moodleService.getUsersByField("idnumber", [
    String(user._id),
  ]);

  if (byIdnumber.length) return byIdnumber[0];

  const byUsername = await moodleService.getUsersByField("username", [
    `engloba_${user._id}`,
  ]);

  return byUsername[0] || null;
};

const ensureMoodleUserForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId)
    .select("_id firstName lastName email employmentStatus")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (user.employmentStatus !== "activo") {
    return {
      action: "skip-status",
      status: user.employmentStatus,
    };
  }

  const moodleUser = await findMoodleUserByLocalUser(user);
  const profile = buildMoodleUserFromUser(user);

  if (moodleUser) {
    await moodleService.updateUser(moodleUser.id, {
      ...profile,
      suspended: 0,
      lang: "es",
      timezone: "Europe/Madrid",
      country: "ES",
    });

    return {
      action: "updated",
      moodleId: Number(moodleUser.id),
      userId: String(user._id),
    };
  }

  const duplicatedEmail = await moodleService.getUsersByField("email", [
    profile.email,
  ]);

  if (duplicatedEmail.length) {
    throw new ClientError(
      "Ya existe en Moodle una cuenta con ese correo, pero no está vinculada a este usuario de Engloba",
      409
    );
  }

  const payload = {
    username: `engloba_${user._id}`,
    password: `Moodle${crypto.randomBytes(16).toString("hex")}Aa!`,
    idnumber: String(user._id),
    ...profile,
  };

  console.dir(
    {
      action: "creating-moodle-user",
      username: payload.username,
      idnumber: payload.idnumber,
      firstname: payload.firstname,
      lastname: payload.lastname,
      email: payload.email,
    },
    { depth: null }
  );

  const created = await moodleService.createUser(payload);
  const moodleId = created[0]?.id;

  if (!moodleId) {
    throw new ClientError(
      "Moodle creó el usuario pero no devolvió su identificador",
      500
    );
  }

  return {
    action: "created",
    moodleId: Number(moodleId),
    userId: String(user._id),
  };
};

const disableMoodleUserForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId)
    .select("_id")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const moodleUser = await findMoodleUserByLocalUser(user);

  if (!moodleUser) {
    return {
      action: "not-found",
      userId: String(user._id),
    };
  }

  await moodleService.updateUser(moodleUser.id, {
    suspended: 1,
  });

  return {
    action: "suspended",
    moodleId: Number(moodleUser.id),
    userId: String(user._id),
  };
};

const syncMoodleUserForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId)
    .select("_id employmentStatus")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (user.employmentStatus === "ya no trabaja con nosotros") {
    return disableMoodleUserForUser(userId);
  }

  if (user.employmentStatus === "activo") {
    return ensureMoodleUserForUser(userId);
  }

  return {
    action: "skip-status",
    status: user.employmentStatus,
  };
};

const syncAllActiveMoodleUsers = async () => {
  const users = await User.find({
    employmentStatus: "activo",
  })
    .select("_id")
    .lean();

  const result = {
    total: users.length,
    created: 0,
    updated: 0,
    errors: [],
  };

  for (const user of users) {
    try {
      const sync = await syncMoodleUserForUser(user._id);

      if (sync.action === "created") result.created += 1;
      if (sync.action === "updated") result.updated += 1;
    } catch (error) {
      result.errors.push({
        userId: String(user._id),
        message: error.message,
      });
    }
  }

  return result;
};

const postMoodleTest = async (req, res) => {
  const data = await moodleService.getCoursesByField(
    "idnumber",
    "__backengloba_connection_test__"
  );

  response(res, 200, {
    ok: true,
    coursesFound: Array.isArray(data?.courses) ? data.courses.length : 0,
  });
};

const postMoodleSyncUser = async (req, res) => {
  const { userId } = req.body || {};

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ClientError("userId no válido", 400);
  }

  const data = await syncMoodleUserForUser(userId);
  response(res, 200, data);
};





module.exports = {
  postMoodleTest: catchAsync(postMoodleTest),
  postMoodleSyncUser: catchAsync(postMoodleSyncUser),

  ensureMoodleUserForUser,
  disableMoodleUserForUser,
  syncMoodleUserForUser,
  syncAllActiveMoodleUsers,
};