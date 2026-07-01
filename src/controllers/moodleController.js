const crypto = require("crypto");
const mongoose = require("mongoose");

const { User, Periods } = require("../models/indexModels");
const moodleService = require("../services/moodleService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

/* =========================================================
   CONFIGURACIÓN MOODLE
   ========================================================= */

const MOODLE_AUTH = "oidc";

const MOODLE_SYSTEM_CONTEXT = {
  contextId: 0,
  contextLevel: 10, // CONTEXT_SYSTEM
  instanceId: 0,
};

const MOODLE_ROLES = {
  courseCreator: 2,
  student: 5,
};

/*
  La cuenta root de Moodle se creó manualmente al instalar la plataforma.
  Debe conservarse como acceso de emergencia y no se toca desde BackEngloba.
*/
const MOODLE_MANUAL_RESCUE_USER_IDS = new Set([
  "6790e50a1c4635cb35cc176f",
]);

const MOODLE_ACCESS_RULES = {
  siteAdmins: ["root"],

  courseCreators: {
    roles: ["global"],
    positions: [
      "6992efa17b62b2c39aaa769b", // Técnico/a PRL
    ],
  },
};

/* =========================================================
   HELPERS DE IDENTIDAD
   ========================================================= */

const isManualMoodleRescueUser = (user) =>
  MOODLE_MANUAL_RESCUE_USER_IDS.has(String(user?._id || ""));

const buildMoodleUsername = (userId) => `engloba_${String(userId)}`;

const buildMoodleUserFromUser = (user) => {
  const email = String(user.email || "").trim().toLowerCase();

  if (!email) {
    throw new ClientError(
      "El usuario no tiene correo corporativo para Moodle",
      400
    );
  }

  return {
    firstname: String(user.firstName || "").trim() || "Sin nombre",
    lastname: String(user.lastName || "").trim() || "Sin apellidos",
    email,
  };
};

/*
  La vinculación estable siempre es:

  Moodle idnumber = String(User._id)
  Moodle username = engloba_<User._id>

  El correo solo se usa para rescatar una cuenta legacy del mismo usuario.
*/
const findMoodleUserByLocalUser = async (user) => {
  const localUserId = String(user._id);
  const username = buildMoodleUsername(localUserId);
  const email = String(user.email || "").trim().toLowerCase();

  const byIdnumber = await moodleService.getUsersByField("idnumber", [
    localUserId,
  ]);

  if (byIdnumber.length) {
    return {
      user: byIdnumber[0],
      match: "idnumber",
    };
  }

  const byUsername = await moodleService.getUsersByField("username", [
    username,
  ]);

  if (byUsername.length) {
    return {
      user: byUsername[0],
      match: "username",
    };
  }

  if (!email) {
    return null;
  }

  const byEmail = await moodleService.getUsersByField("email", [email]);

  if (byEmail.length) {
    return {
      user: byEmail[0],
      match: "email",
    };
  }

  return null;
};

const buildMoodleSyncPayload = (user) => ({
  username: buildMoodleUsername(user._id),
  idnumber: String(user._id),
  auth: MOODLE_AUTH,
  ...buildMoodleUserFromUser(user),
  suspended: 0,
  lang: "es",
  timezone: "Europe/Madrid",
  country: "ES",
});

const ensureMoodleUserForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id firstName lastName email employmentStatus role")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (isManualMoodleRescueUser(user)) {
    return {
      action: "skip-manual-rescue",
      userId: String(user._id),
    };
  }

  if (user.employmentStatus !== "activo") {
    return {
      action: "skip-status",
      userId: String(user._id),
      status: user.employmentStatus,
    };
  }

  const payload = buildMoodleSyncPayload(user);
  const found = await findMoodleUserByLocalUser(user);

  if (found?.user) {
    const wasSuspended = Boolean(found.user.suspended);

    await moodleService.updateUser(found.user.id, payload);

    return {
      action: wasSuspended ? "reactivated" : "updated",
      moodleId: Number(found.user.id),
      userId: String(user._id),
      match: found.match,
      auth: MOODLE_AUTH,
    };
  }

  const created = await moodleService.createUser({
    ...payload,
    /*
      Moodle exige una contraseña al crear la cuenta aunque el método
      de acceso sea OIDC. No se usa para el inicio de sesión OIDC.
    */
    password: `Moodle${crypto.randomBytes(16).toString("hex")}Aa!`,
  });

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
    auth: MOODLE_AUTH,
  };
};

const disableMoodleUserForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id email role")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (isManualMoodleRescueUser(user)) {
    return {
      action: "skip-manual-rescue",
      userId: String(user._id),
    };
  }

  const found = await findMoodleUserByLocalUser(user);

  if (!found?.user) {
    return {
      action: "not-found",
      userId: String(user._id),
    };
  }

  await moodleService.updateUser(found.user.id, {
    suspended: 1,
  });

  return {
    action: "suspended",
    moodleId: Number(found.user.id),
    userId: String(user._id),
    match: found.match,
  };
};

/* =========================================================
   REGLAS DE ACCESO ENGLoba → MOODLE
   ========================================================= */

const getActivePositionIdsForUser = async (userId) => {
  const periods = await Periods.find({
    idUser: userId,
    active: { $ne: false },
    $or: [
      { endDate: null },
      { endDate: { $exists: false } },
      { endDate: { $gt: new Date() } },
    ],
  })
    .select("position")
    .lean();

  return periods
    .map((period) => String(period.position || ""))
    .filter(Boolean);
};

const getMoodleAccessPlanForUser = async (userId) => {
  const user = await User.findById(userId)
    .select("_id role employmentStatus")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (user.employmentStatus !== "activo") {
    return {
      userId: String(user._id),
      active: false,
      siteAdmin: false,
      canCreateCourses: false,
      shouldHaveCourseCreatorRole: false,
      positionIds: [],
    };
  }

  const positionIds = await getActivePositionIdsForUser(user._id);

  const isSiteAdmin = MOODLE_ACCESS_RULES.siteAdmins.includes(user.role);

  const hasGlobalAuthorRole =
    MOODLE_ACCESS_RULES.courseCreators.roles.includes(user.role);

  const hasTrainingPosition =
    MOODLE_ACCESS_RULES.courseCreators.positions.some((positionId) =>
      positionIds.includes(String(positionId))
    );

  const canCreateCourses =
    isSiteAdmin || hasGlobalAuthorRole || hasTrainingPosition;

  return {
    userId: String(user._id),
    active: true,
    siteAdmin: isSiteAdmin,
    canCreateCourses,
    shouldHaveCourseCreatorRole: !isSiteAdmin && canCreateCourses,
    positionIds,
  };
};

/*
  Sincroniza únicamente el rol Course creator a nivel sistema.

  No matricula como Student porque Student solo tiene sentido dentro
  de un curso concreto. La matrícula se hace con
  enrolMoodleUserAsStudentInCourse().
*/
const syncMoodleAccessRolesForUser = async (userId, moodleId = null) => {
  const plan = await getMoodleAccessPlanForUser(userId);

  if (!plan.active) {
    return {
      action: "skip-status",
      plan,
    };
  }

  const user = await User.findById(userId)
    .select("_id email")
    .lean();

  const found = moodleId
    ? { user: { id: moodleId }, match: "moodleId" }
    : await findMoodleUserByLocalUser(user);

  if (!found?.user?.id) {
    throw new ClientError(
      "No se ha encontrado la cuenta Moodle para sincronizar sus roles",
      404
    );
  }

  await moodleService.unassignRole({
    userId: found.user.id,
    roleId: MOODLE_ROLES.courseCreator,
    contextId: MOODLE_SYSTEM_CONTEXT.contextId,
    contextLevel: MOODLE_SYSTEM_CONTEXT.contextLevel,
    instanceId: MOODLE_SYSTEM_CONTEXT.instanceId,
  });

  if (plan.shouldHaveCourseCreatorRole) {
    await moodleService.assignRole({
      userId: found.user.id,
      roleId: MOODLE_ROLES.courseCreator,
      contextId: MOODLE_SYSTEM_CONTEXT.contextId,
      contextLevel: MOODLE_SYSTEM_CONTEXT.contextLevel,
      instanceId: MOODLE_SYSTEM_CONTEXT.instanceId,
    });
  }

  return {
    action: plan.shouldHaveCourseCreatorRole
      ? "course-creator-assigned"
      : "course-creator-removed",
    moodleId: Number(found.user.id),
    userId: String(userId),
    plan,
  };
};

/*
  Matrícula correcta de alumnado.

  Debe llamarse cada vez que una persona tenga que realizar un curso.
  Da igual que también sea root, global, PRL, profesor o creador.
*/
const enrolMoodleUserAsStudentInCourse = async ({ userId, courseId }) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  if (!courseId) {
    throw new ClientError("Falta courseId", 400);
  }

  const user = await User.findById(userId)
    .select("_id email employmentStatus")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (user.employmentStatus !== "activo") {
    throw new ClientError(
      "Solo se puede matricular en Moodle a usuarios activos",
      400
    );
  }

  const found = await findMoodleUserByLocalUser(user);

  if (!found?.user?.id) {
    throw new ClientError(
      "El usuario no tiene una cuenta Moodle sincronizada",
      404
    );
  }

  await moodleService.enrolUser({
    userId: found.user.id,
    courseId,
    roleId: MOODLE_ROLES.student,
  });

  return {
    action: "student-enrolled",
    moodleId: Number(found.user.id),
    userId: String(userId),
    courseId: Number(courseId),
  };
};

/* =========================================================
   SINCRONIZACIONES
   ========================================================= */

const syncMoodleUserForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id employmentStatus role")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (isManualMoodleRescueUser(user)) {
    return {
      action: "skip-manual-rescue",
      userId: String(user._id),
    };
  }

  if (user.employmentStatus === "ya no trabaja con nosotros") {
    return disableMoodleUserForUser(userId);
  }

  if (user.employmentStatus !== "activo") {
    return {
      action: "skip-status",
      userId: String(user._id),
      status: user.employmentStatus,
    };
  }

  const identity = await ensureMoodleUserForUser(userId);

  return {
    ...identity,
    access: false,
  };
};

const queueSyncMoodleUserForUser = (userId) => {
  syncMoodleUserForUser(userId).catch((error) => {
    console.error(
      "[Moodle] Error al sincronizar usuario",
      String(userId),
      error?.message || error
    );
  });
};

/*
  Migración local de una sola ejecución.

  Convierte a auth=oidc todas las cuentas de personas activas gestionadas
  por BackEngloba. La cuenta root/manual queda excluida como rescate.

  La función es repetible: si se corta, se puede volver a ejecutar.
*/
const migrateAllActiveMoodleUsersToOidc = async () => {
  const users = await User.find({
    employmentStatus: "activo",
  })
    .select("_id")
    .lean();

  const result = {
    total: users.length,
    created: 0,
    updated: 0,
    reactivated: 0,
    skippedManualRescue: 0,
    skipped: 0,
    errors: [],
  };

  const concurrency = 4;

  for (let index = 0; index < users.length; index += concurrency) {
    const batch = users.slice(index, index + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (user) => {
        try {
          return {
            userId: String(user._id),
            sync: await syncMoodleUserForUser(user._id),
          };
        } catch (error) {
          return {
            userId: String(user._id),
            error,
          };
        }
      })
    );

    for (const item of batchResults) {
      if (item.error) {
        result.errors.push({
          userId: item.userId,
          message: item.error?.message || String(item.error),
        });
        continue;
      }

      switch (item.sync.action) {
        case "created":
          result.created += 1;
          break;
        case "updated":
          result.updated += 1;
          break;
        case "reactivated":
          result.reactivated += 1;
          break;
        case "skip-manual-rescue":
          result.skippedManualRescue += 1;
          break;
        default:
          result.skipped += 1;
      }
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
  queueSyncMoodleUserForUser,
  syncMoodleUserForUser,
  migrateAllActiveMoodleUsersToOidc,
  syncMoodleAccessRolesForUser,
  enrolMoodleUserAsStudentInCourse,
};
