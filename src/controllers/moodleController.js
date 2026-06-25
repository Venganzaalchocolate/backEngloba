const crypto = require("crypto");

const mongoose = require("mongoose");

const { User, Periods } = require("../models/indexModels");
const moodleService = require("../services/moodleService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

/* =========================================================
   REGLAS DE ACCESO MOODLE
   =========================================================

   root
   → administrador del sitio Moodle manualmente.
   → no necesita Course creator porque ya tiene control total.

   global
   → Course creator a nivel sistema.

   Técnico/a PRL
   → Course creator a nivel sistema.

   Todo trabajador activo
   → será Student únicamente al matricularse en un curso.
*/
const MOODLE_SYSTEM_CONTEXT = {
  contextId: 0,
  contextLevel: 10, // CONTEXT_SYSTEM
  instanceId: 0,
};

const MOODLE_ROLES = {
  courseCreator: 2,
  student: 5,
};

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
   IDENTIDAD MOODLE
   ========================================================= */

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

/*
  La vinculación estable siempre es:

  Moodle idnumber = String(User._id)
  Moodle username = engloba_<User._id>

  El correo solo se usa para rescatar cuentas antiguas que se
  hubieran creado antes de establecer estas reglas.
*/
const findMoodleUserByLocalUser = async (user) => {
  const localUserId = String(user._id);
  const username = `engloba_${localUserId}`;
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

  if (!email) return null;

  const byEmail = await moodleService.getUsersByField("email", [email]);

  if (byEmail.length) {
    return {
      user: byEmail[0],
      match: "email",
    };
  }

  return null;
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

  const profile = buildMoodleUserFromUser(user);
  const found = await findMoodleUserByLocalUser(user);

  if (found?.user) {
    const wasSuspended = Boolean(found.user.suspended);

    await moodleService.updateUser(found.user.id, {
      username: `engloba_${user._id}`,
      idnumber: String(user._id),
      ...profile,
      suspended: 0,
      lang: "es",
      timezone: "Europe/Madrid",
      country: "ES",
    });

    return {
      action: wasSuspended ? "reactivated" : "updated",
      moodleId: Number(found.user.id),
      userId: String(user._id),
      match: found.match,
    };
  }

  const payload = {
    username: `engloba_${user._id}`,
    password: `Moodle${crypto.randomBytes(16).toString("hex")}Aa!`,
    idnumber: String(user._id),
    ...profile,
    lang: "es",
    timezone: "Europe/Madrid",
    country: "ES",
  };

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
    .select("_id email")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

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

  if (!user) throw new ClientError("Usuario no encontrado", 404);

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

    /*
      El root no necesita Course creator porque será Site administrator.
      Global y PRL sí reciben Course creator a nivel sistema.
    */
    shouldHaveCourseCreatorRole:
      !isSiteAdmin && canCreateCourses,

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

const courseCreatorRoleId = MOODLE_ROLES.courseCreator;

  /*
    BackEngloba es la fuente de verdad para este rol:
    primero se quita y, si corresponde, se vuelve a asignar.

    Esto hace la sincronización repetible y también elimina permisos
    si alguien deja de ser global o deja el puesto de PRL.
  */
console.dir(
  {
    action: "moodle-role-sync-input",
    localUserId: String(userId),
    moodleUserId: found.user.id,
    courseCreatorRoleId: MOODLE_ROLES.courseCreator,
    context: MOODLE_SYSTEM_CONTEXT,
    shouldHaveCourseCreatorRole: plan.shouldHaveCourseCreatorRole,
    siteAdmin: plan.siteAdmin,
    positionIds: plan.positionIds,
  },
  { depth: null }
);

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
  if (!userId) throw new ClientError("Falta userId", 400);
  if (!courseId) throw new ClientError("Falta courseId", 400);

  const user = await User.findById(userId)
    .select("_id email employmentStatus")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

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

const studentRoleId = MOODLE_ROLES.student;

  await moodleService.enrolUser({
    userId: found.user.id,
    courseId,
    roleId: studentRoleId,
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
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId)
    .select("_id employmentStatus")
    .lean();

  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (user.employmentStatus === "ya no trabaja con nosotros") {
    return disableMoodleUserForUser(userId);
  }

  if (user.employmentStatus !== "activo") {
    return {
      action: "skip-status",
      status: user.employmentStatus,
    };
  }

  const identity = await ensureMoodleUserForUser(userId);
  // const access = await syncMoodleAccessRolesForUser(
  //   userId,
  //   identity.moodleId
  // );
  const access=false

  return {
    ...identity,
    access,
  };
};

const queueSyncMoodleUserForUser = (userId) => {
  syncMoodleUserForUser(userId).catch((error) => {
    console.log(
      "[Moodle] No se ha podido sincronizar el usuario:",
      String(userId),
      error?.message || error
    );
  });
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
    reactivated: 0,
    skipped: 0,
    errors: [],
  };

  const concurrency = 4;

  for (let i = 0; i < users.length; i += concurrency) {
    const batch = users.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (user) => {
        try {
          const sync = await syncMoodleUserForUser(user._id);

          if (sync.action === "created") result.created += 1;
          else if (sync.action === "updated") result.updated += 1;
          else if (sync.action === "reactivated") result.reactivated += 1;
          else result.skipped += 1;

          console.log(
            "[Moodle sync]",
            String(user._id),
            sync.action,
            sync.access?.action || ""
          );
        } catch (error) {
          result.errors.push({
            userId: String(user._id),
            message: error?.message || String(error),
          });

          console.log(
            "[Moodle sync] ERROR",
            String(user._id),
            error?.message || error
          );
        }
      })
    );
  }

  console.dir(
    {
      action: "sync-all-active-moodle-users",
      ...result,
      errors: result.errors.length,
    },
    { depth: null }
  );

  return result;
};

/*
  Ejecutar una sola vez después de:
  - añadir core_role_assign_roles al servicio Moodle;
  - añadir core_role_unassign_roles al servicio Moodle;
  - configurar MOODLE_SYSTEM_CONTEXT_ID;
  - configurar MOODLE_ROLE_COURSE_CREATOR_ID.

  Esta función solo sincroniza Course creator.
  No matricula como Student porque todavía no sabe en qué cursos.
*/
const syncAllMoodleAccessRoles = async () => {
  const users = await User.find({
    employmentStatus: "activo",
  })
    .select("_id")
    .lean();

  const result = {
    total: users.length,
    courseCreatorsAssigned: 0,
    courseCreatorsRemoved: 0,
    siteAdminsToConfigure: [],
    errors: [],
  };

  const concurrency = 4;

  for (let i = 0; i < users.length; i += concurrency) {
    const batch = users.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (user) => {
        try {
          const sync = await syncMoodleAccessRolesForUser(user._id);

          if (sync.action === "course-creator-assigned") {
            result.courseCreatorsAssigned += 1;
          }

          if (sync.action === "course-creator-removed") {
            result.courseCreatorsRemoved += 1;
          }

          if (sync.plan.siteAdmin) {
            result.siteAdminsToConfigure.push(String(user._id));
          }

          console.log(
            "[Moodle roles]",
            String(user._id),
            sync.action
          );
        } catch (error) {
          result.errors.push({
            userId: String(user._id),
            message: error?.message || String(error),
          });

          console.log(
            "[Moodle roles] ERROR",
            String(user._id),
            error?.message || error
          );
        }
      })
    );
  }

  console.dir(
    {
      action: "sync-all-moodle-access-roles",
      ...result,
      errors: result.errors.length,
    },
    { depth: null }
  );

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

// syncMoodleAccessRolesForUser("67935cb851efb3f365821965")
//   .then((data) => {
//     console.dir(
//       {
//         action: "moodle-role-sync-single-ok",
//         data,
//       },
//       { depth: null }
//     );
//   })
//   .catch((error) => {
//     console.dir(
//       {
//         action: "moodle-role-sync-single-error",
//         message: error?.message,
//         details: error?.details,
//         moodleRequest: error?.moodleRequest,
//       },
//       { depth: null }
//     );
//   });

module.exports = {
    postMoodleTest: catchAsync(postMoodleTest),
  postMoodleSyncUser: catchAsync(postMoodleSyncUser),
  queueSyncMoodleUserForUser,
};