const crypto = require("crypto");
const mongoose = require("mongoose");

const {
  User,
  Periods,
  Dispositive,
  Program,
  MoodleAssignment,
} = require("../models/indexModels");

const moodleService = require("../services/moodleService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

/* =========================================================
   CONFIGURACIÓN MOODLE
   ========================================================= */

const MOODLE_AUTH = "oidc";

const MOODLE_SYSTEM_CONTEXT = {
  contextId: 1,
  contextLevel: 10, // CONTEXT_SYSTEM
  instanceId: 0,
};

const MOODLE_ROLES = {
  manager: 1,
  courseCreator: 2,
  editingTeacher: 3,
  teacher: 4,
  student: 5,
  guest: 6,
  user: 7,
  frontpage: 8,
  backenglobaMoodleApi: 9,
};

const MOODLE_COURSE_ROLE_IDS = new Set([
  MOODLE_ROLES.editingTeacher,
  MOODLE_ROLES.teacher,
  MOODLE_ROLES.student,
]);

const MOODLE_SYSTEM_ROLE_IDS = new Set([
  MOODLE_ROLES.courseCreator,
]);

const MOODLE_UI_SYSTEM_ROLES = [
  {
    id: MOODLE_ROLES.courseCreator,
    key: "courseCreator",
    shortname: "coursecreator",
    name: "Creador/a de cursos",
  },
];

const MOODLE_UI_COURSE_ROLES = [
  {
    id: MOODLE_ROLES.editingTeacher,
    key: "editingTeacher",
    shortname: "editingteacher",
    name: "Profesor/a editor/a",
  },
  {
    id: MOODLE_ROLES.teacher,
    key: "teacher",
    shortname: "teacher",
    name: "Profesor/a sin edición",
  },
  {
    id: MOODLE_ROLES.student,
    key: "student",
    shortname: "student",
    name: "Alumno/a",
  },
];

/*
  La cuenta root de Moodle se creó manualmente al instalar la plataforma.
  Debe conservarse como acceso de emergencia y no se modifica desde BackEngloba.
  Sí puede usarse para matrículas si ya existe en Moodle.
*/
const MOODLE_MANUAL_RESCUE_USER_IDS = new Set([
  "6790e50a1c4635cb35cc176f",
]);

/* =========================================================
   HELPERS BÁSICOS
   ========================================================= */

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toObjectIdList = (values = [], fieldName = "ids") => {
  if (!Array.isArray(values)) {
    throw new ClientError(`${fieldName} debe ser un array`, 400);
  }

  return values
    .filter(Boolean)
    .map((value) => {
      if (!isValidObjectId(value)) {
        throw new ClientError(`${fieldName} contiene un ObjectId no válido`, 400);
      }

      return new mongoose.Types.ObjectId(value);
    });
};

const toStringList = (values = [], fieldName = "values") => {
  if (!Array.isArray(values)) {
    throw new ClientError(`${fieldName} debe ser un array`, 400);
  }

  return values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
};

const uniqStrings = (values = []) => [...new Set(values.map(String))];

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

/* =========================================================
   USUARIOS MOODLE
   ========================================================= */

const ensureMoodleUserForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id firstName lastName email employmentStatus")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (isManualMoodleRescueUser(user)) {
    const found = await findMoodleUserByLocalUser(user);

    if (found?.user?.id) {
      return {
        action: "manual-rescue-found",
        moodleId: Number(found.user.id),
        userId: String(user._id),
        match: found.match,
      };
    }

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

const {
  suspended,
  ...createPayload
} = payload;

const created = await moodleService.createUser({
  ...createPayload,
  password: `Moodle${crypto.randomBytes(16).toString("hex")}Aa!`,
});
    /*
      Moodle exige una contraseña al crear la cuenta aunque el método
      de acceso sea OIDC. No se usa para el inicio de sesión OIDC.
    */


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
    .select("_id email")
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

const syncMoodleUserForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id employmentStatus")
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

  return ensureMoodleUserForUser(userId);
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

/* =========================================================
   RESOLVER USUARIOS DESDE BACKENGLOBA
   ========================================================= */

/*
  Body esperado:

  {
    "userIds": ["..."],
    "filters": {
      "allActive": false,
      "dispositiveIds": ["..."],
      "positionIds": ["..."],
      "areas": ["migraciones"]
    }
  }

  Los filtros se combinan entre sí:
  - positionIds + dispositiveIds
  - positionIds + areas
  - dispositiveIds + areas
  - positionIds + dispositiveIds + areas

  userIds se suma a los resultados de filtros.
*/
const getLocalUsersFromBody = async (body = {}) => {
  const explicitUserIds = toObjectIdList(body.userIds || [], "userIds");
  const filters = body.filters || {};

  const positionIds = toObjectIdList(filters.positionIds || [], "positionIds");
  const dispositiveIds = toObjectIdList(
    filters.dispositiveIds || [],
    "dispositiveIds"
  );
  const areas = toStringList(filters.areas || [], "areas");

  const hasPeriodFilters =
    positionIds.length || dispositiveIds.length || areas.length;

  let userIds = explicitUserIds.map(String);

  if (filters.allActive && !hasPeriodFilters) {
    const users = await User.find({
      employmentStatus: "activo",
    })
      .select("_id")
      .lean();

    userIds = userIds.concat(users.map((user) => String(user._id)));
  }

  if (hasPeriodFilters) {
    let finalDispositiveIds = dispositiveIds.map(String);

    if (areas.length) {
      const programs = await Program.find({
        area: { $in: areas },
        active: { $ne: false },
      })
        .select("_id")
        .lean();

      const areaDispositives = await Dispositive.find({
        program: { $in: programs.map((program) => program._id) },
        active: { $ne: false },
      })
        .select("_id")
        .lean();

      const areaDispositiveIds = areaDispositives.map((dispositive) =>
        String(dispositive._id)
      );

      finalDispositiveIds = finalDispositiveIds.length
        ? finalDispositiveIds.filter((id) => areaDispositiveIds.includes(id))
        : areaDispositiveIds;
    }

    const periodQuery = {
      active: { $ne: false },
      idUser: { $exists: true, $ne: null },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gt: new Date() } },
      ],
    };

    if (positionIds.length) {
      periodQuery.position = { $in: positionIds };
    }

    if (finalDispositiveIds.length) {
      periodQuery.dispositiveId = { $in: finalDispositiveIds };
    }

    if (!areas.length || finalDispositiveIds.length) {
      const periodUserIds = await Periods.distinct("idUser", periodQuery);
      userIds = userIds.concat(periodUserIds.map(String));
    }
  }

  userIds = uniqStrings(userIds);

  if (!userIds.length) {
    throw new ClientError("No se ha seleccionado ningún trabajador", 400);
  }

  return User.find({
    _id: { $in: userIds },
    employmentStatus: "activo",
  })
    .select("_id firstName lastName email employmentStatus")
    .lean();
};

const getReadyMoodleUsersFromLocalUsers = async (
  users = [],
  { createMissing = true } = {}
) => {
  const ready = [];
  const skipped = [];
  const errors = [];

  for (const user of users) {
    try {
      if (createMissing) {
        const sync = await ensureMoodleUserForUser(user._id);

        if (sync.moodleId) {
          ready.push({
            userId: String(user._id),
            moodleId: Number(sync.moodleId),
            action: sync.action,
          });
        } else {
          skipped.push({
            userId: String(user._id),
            action: sync.action,
          });
        }

        continue;
      }

      const found = await findMoodleUserByLocalUser(user);

      if (found?.user?.id) {
        ready.push({
          userId: String(user._id),
          moodleId: Number(found.user.id),
          match: found.match,
        });
      } else {
        skipped.push({
          userId: String(user._id),
          action: "moodle-user-not-found",
        });
      }
    } catch (error) {
      errors.push({
        userId: String(user._id),
        message: error?.message || String(error),
      });
    }
  }

  return {
    ready,
    skipped,
    errors,
  };
};

/* =========================================================
   MATRÍCULAS DE CURSO
   ========================================================= */

const enrolMoodleUserInCourse = async ({
  userId,
  courseId,
  roleId = MOODLE_ROLES.student,
}) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  if (!courseId) {
    throw new ClientError("Falta courseId", 400);
  }

  if (!MOODLE_COURSE_ROLE_IDS.has(Number(roleId))) {
    throw new ClientError("Rol de curso Moodle no permitido", 400);
  }

  const sync = await ensureMoodleUserForUser(userId);

  if (!sync.moodleId) {
    throw new ClientError("No se ha podido preparar la cuenta Moodle", 400);
  }

  await moodleService.enrolUser({
    userId: sync.moodleId,
    courseId,
    roleId,
  });

  return {
    action: "course-user-enrolled",
    moodleId: Number(sync.moodleId),
    userId: String(userId),
    courseId: Number(courseId),
    roleId: Number(roleId),
  };
};

const enrolMoodleUserAsStudentInCourse = async ({ userId, courseId }) =>
  enrolMoodleUserInCourse({
    userId,
    courseId,
    roleId: MOODLE_ROLES.student,
  });

/* =========================================================
   ENDPOINTS
   ========================================================= */

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

  if (!userId || !isValidObjectId(userId)) {
    throw new ClientError("userId no válido", 400);
  }

  const data = await syncMoodleUserForUser(userId);

  response(res, 200, data);
};

const postMoodleGetRoles = async (req, res) => {
  response(res, 200, {
    systemRoles: MOODLE_UI_SYSTEM_ROLES,
    courseRoles: MOODLE_UI_COURSE_ROLES,
  });
};

const postMoodleInfo = async (req, res) => {
  const {
    lists = ["courses", "roles"],
    courseId,
    userId,
    roleId,
    moodleUserId,
  } = req.body || {};

  const requestedLists = Array.isArray(lists) ? lists : [lists];
  const data = {};

  let courseUsers = null;
  let localUser = null;
  let foundMoodleUser = null;
  let resolvedMoodleUserId = moodleUserId ? Number(moodleUserId) : null;

  const needsCourseUsers = requestedLists.some((list) =>
    [
      "courseUsers",
      "courseTeachers",
      "courseStudents",
      "courseCompletionSummary",
    ].includes(list)
  );

  const needsLocalUser = requestedLists.some((list) =>
    [
      "userCourses",
      "moodleUserStatus",
      "userCompletions",
      "userActivitiesCompletion",
      "userSystemRoles",
    ].includes(list)
  );

  if (requestedLists.includes("roles")) {
    data.systemRoles = MOODLE_UI_SYSTEM_ROLES;
    data.courseRoles = MOODLE_UI_COURSE_ROLES;
  }

  if (requestedLists.includes("courses")) {
    const moodleCourses = await moodleService.getCoursesByField();

    data.courses = (moodleCourses.courses || [])
      .filter((course) => Number(course.id) !== 1)
      .map((course) => ({
        id: Number(course.id),
        fullname: course.fullname,
        shortname: course.shortname,
        idnumber: course.idnumber,
        displayName: course.fullname || course.shortname,
      }));
  }

  if (needsCourseUsers) {
    if (!courseId) {
      throw new ClientError("Falta courseId", 400);
    }

    courseUsers = await moodleService.getEnrolledUsers(Number(courseId));
  }

  if (requestedLists.includes("courseUsers")) {
    data.courseUsers = courseUsers;
  }

  if (requestedLists.includes("courseTeachers")) {
    data.courseTeachers = courseUsers.filter((user) =>
      user.roles?.some((role) =>
        [MOODLE_ROLES.editingTeacher, MOODLE_ROLES.teacher].includes(
          Number(role.roleid)
        )
      )
    );
  }

  if (requestedLists.includes("courseStudents")) {
    data.courseStudents = courseUsers.filter((user) =>
      user.roles?.some(
        (role) => Number(role.roleid) === MOODLE_ROLES.student
      )
    );
  }

  if (requestedLists.includes("courseCompletionSummary")) {
    const students = courseUsers.filter((user) =>
      user.roles?.some(
        (role) => Number(role.roleid) === MOODLE_ROLES.student
      )
    );

    const summary = {
      courseId: Number(courseId),
      total: students.length,
      completed: 0,
      notCompleted: 0,
      errors: [],
      users: [],
    };

    for (const student of students) {
      try {
        const completion = await moodleService.getCourseCompletionStatus({
          userId: student.id,
          courseId: Number(courseId),
        });

        const completed = Boolean(completion?.completionstatus?.completed);

        if (completed) {
          summary.completed += 1;
        } else {
          summary.notCompleted += 1;
        }

        summary.users.push({
          moodleUser: student,
          completed,
          completion,
        });
      } catch (error) {
        summary.errors.push({
          moodleUserId: student.id,
          message: error?.message || String(error),
        });
      }
    }

    data.courseCompletionSummary = summary;
  }

  if (requestedLists.includes("courseCreatorUsers")) {
    data.courseCreatorUsers = await moodleService.getSystemRoleUsers(
      MOODLE_ROLES.courseCreator
    );
  }

  if (requestedLists.includes("systemRoleUsers")) {
    if (!MOODLE_SYSTEM_ROLE_IDS.has(Number(roleId))) {
      throw new ClientError("Rol de sistema Moodle no permitido", 400);
    }

    data.systemRoleUsers = await moodleService.getSystemRoleUsers(
      Number(roleId)
    );
  }

  if (needsLocalUser && !resolvedMoodleUserId) {
    if (!userId || !isValidObjectId(userId)) {
      throw new ClientError("userId no válido", 400);
    }

    localUser = await User.findById(userId)
      .select("_id firstName lastName email employmentStatus")
      .lean();

    if (!localUser) {
      throw new ClientError("Usuario no encontrado", 404);
    }

    foundMoodleUser = await findMoodleUserByLocalUser(localUser);

    if (foundMoodleUser?.user?.id) {
      resolvedMoodleUserId = Number(foundMoodleUser.user.id);
    }
  }

  if (requestedLists.includes("moodleUserStatus")) {
    data.moodleUserStatus = {
      exists: Boolean(foundMoodleUser?.user?.id || resolvedMoodleUserId),
      userId: localUser ? String(localUser._id) : null,
      match: foundMoodleUser?.match || null,
      moodleUser: foundMoodleUser?.user || null,
      moodleId: resolvedMoodleUserId || null,
    };
  }

  if (requestedLists.includes("userCourses")) {
    if (!resolvedMoodleUserId) {
      data.userCourses = {
        exists: false,
        userId: localUser ? String(localUser._id) : null,
        moodleId: null,
        courses: [],
      };
    } else {
      data.userCourses = {
        exists: true,
        userId: localUser ? String(localUser._id) : null,
        moodleId: resolvedMoodleUserId,
        courses: await moodleService.getUserCourses(resolvedMoodleUserId),
      };
    }
  }

  if (requestedLists.includes("userCompletions")) {
    if (!courseId) {
      throw new ClientError("Falta courseId", 400);
    }

    data.userCompletions = resolvedMoodleUserId
      ? await moodleService.getCourseCompletionStatus({
          userId: resolvedMoodleUserId,
          courseId: Number(courseId),
        })
      : null;
  }

  if (requestedLists.includes("userActivitiesCompletion")) {
    if (!courseId) {
      throw new ClientError("Falta courseId", 400);
    }

    data.userActivitiesCompletion = resolvedMoodleUserId
      ? await moodleService.getActivitiesCompletionStatus({
          userId: resolvedMoodleUserId,
          courseId: Number(courseId),
        })
      : null;
  }

  if (requestedLists.includes("userSystemRoles")) {
    data.userSystemRoles = resolvedMoodleUserId
      ? await moodleService.getUserSystemRoles(resolvedMoodleUserId)
      : [];
  }
if (requestedLists.includes("courseAssignments")) {
  if (!courseId) {
    throw new ClientError("Falta courseId", 400);
  }

data.courseAssignments = await MoodleAssignment.find({
  active: true,
  assignmentType: "course-enrolment",
  operation: "enrol",
  courseId: Number(courseId),
})
  .select(
    "_id assignmentType operation courseId courseName roleId roleName criteria affectedCount selectedCount skippedCount errorCount active createdAt"
  )
  .populate("criteria.userIds", "firstName lastName email")
  .sort({ createdAt: -1 })
  .limit(50)
  .lean();
}

if (requestedLists.includes("systemRoleAssignments")) {
  if (!MOODLE_SYSTEM_ROLE_IDS.has(Number(roleId))) {
    throw new ClientError("Rol de sistema Moodle no permitido", 400);
  }

data.systemRoleAssignments = await MoodleAssignment.find({
  active: true,
  assignmentType: "system-role",
  operation: "assign",
  roleId: Number(roleId),
})
  .select(
    "_id assignmentType operation courseId courseName roleId roleName criteria affectedCount selectedCount skippedCount errorCount active createdAt"
  )
  .populate("criteria.userIds", "firstName lastName email")
  .sort({ createdAt: -1 })
  .limit(50)
  .lean();
}
  response(res, 200, data);
};

const postMoodleGetCourseUsers = async (req, res) => {
  const { courseId, roleId } = req.body || {};

  if (!courseId) {
    throw new ClientError("Falta courseId", 400);
  }

  const users = await moodleService.getEnrolledUsers(courseId);

  const filteredUsers = roleId
    ? users.filter((user) =>
        user.roles?.some((role) => Number(role.roleid) === Number(roleId))
      )
    : users;

  response(res, 200, {
    courseId: Number(courseId),
    roleId: roleId ? Number(roleId) : null,
    total: filteredUsers.length,
    users: filteredUsers,
  });
};

const postMoodleManageCourseEnrolments = async (req, res) => {
  const { operation, courseId, roleId } = req.body || {};

  if (!["enrol", "unenrol"].includes(operation)) {
    throw new ClientError("Operación de matrícula Moodle no válida", 400);
  }

  if (!courseId) {
    throw new ClientError("Falta courseId", 400);
  }

  if (!MOODLE_COURSE_ROLE_IDS.has(Number(roleId))) {
    throw new ClientError("Rol de curso Moodle no permitido", 400);
  }

  const courseRole = MOODLE_UI_COURSE_ROLES.find(
    (role) => role.id === Number(roleId)
  );

  const moodleCourse = await moodleService.getCoursesByField(
    "id",
    Number(courseId)
  );

  const courseName =
    moodleCourse?.courses?.[0]?.fullname ||
    moodleCourse?.courses?.[0]?.shortname ||
    "";

  const localUsers = await getLocalUsersFromBody(req.body);

  const moodleUsers = await getReadyMoodleUsersFromLocalUsers(localUsers, {
    createMissing: operation === "enrol",
  });

  const enrolments = moodleUsers.ready.map((user) => {
    if (operation === "unenrol") {
      return {
        userId: user.moodleId,
        courseId,
      };
    }

    return {
      userId: user.moodleId,
      courseId,
      roleId,
    };
  });

  if (enrolments.length) {
    if (operation === "enrol") {
      await moodleService.enrolUsers(enrolments);
    } else {
      await moodleService.unenrolUsers(enrolments);
    }

    await MoodleAssignment.create({
      active: operation === "enrol",
      assignmentType: "course-enrolment",
      operation,
      courseId: Number(courseId),
      courseName,
      roleId: Number(roleId),
      roleName: courseRole?.name || "",

      criteria: {
        userIds: req.body.userIds || [],
        filters: {
          allActive: Boolean(req.body.filters?.allActive),
          dispositiveIds: req.body.filters?.dispositiveIds || [],
          positionIds: req.body.filters?.positionIds || [],
          areas: req.body.filters?.areas || [],
        },
      },

      affectedUsers: moodleUsers.ready.map((user) => ({
        user: user.userId,
        moodleId: user.moodleId,
      })),

      affectedCount: enrolments.length,
      selectedCount: localUsers.length,
      skippedCount: moodleUsers.skipped.length,
      errorCount: moodleUsers.errors.length,

      createdBy:
        req.user?._id && isValidObjectId(req.user._id) ? req.user._id : null,
    });
  }

  response(res, 200, {
    action:
      operation === "enrol"
        ? "course-users-enrolled"
        : "course-users-unenrolled",
    operation,
    courseId: Number(courseId),
    roleId: Number(roleId),
    selected: localUsers.length,
    affected: enrolments.length,
    skipped: moodleUsers.skipped,
    errors: moodleUsers.errors,
  });
};

const postMoodleManageSystemRole = async (req, res) => {
  const { operation, roleId } = req.body || {};

  if (!["assign", "unassign"].includes(operation)) {
    throw new ClientError("Operación de rol Moodle no válida", 400);
  }

  if (!MOODLE_SYSTEM_ROLE_IDS.has(Number(roleId))) {
    throw new ClientError("Rol de sistema Moodle no permitido", 400);
  }

  const systemRole = MOODLE_UI_SYSTEM_ROLES.find(
    (role) => role.id === Number(roleId)
  );

  const localUsers = await getLocalUsersFromBody(req.body);

  const moodleUsers = await getReadyMoodleUsersFromLocalUsers(localUsers, {
    createMissing: operation === "assign",
  });

  const assignments = moodleUsers.ready.map((user) => ({
    userId: user.moodleId,
    roleId,
    contextId: MOODLE_SYSTEM_CONTEXT.contextId,
  }));

  if (assignments.length) {
    if (operation === "assign") {
      await moodleService.assignRoles(assignments);
    } else {
      await moodleService.unassignRoles(assignments);
    }

    await MoodleAssignment.create({
      active: operation === "assign",
      assignmentType: "system-role",
      operation,
      courseId: null,
      courseName: "",
      roleId: Number(roleId),
      roleName: systemRole?.name || "",

      criteria: {
        userIds: req.body.userIds || [],
        filters: {
          allActive: Boolean(req.body.filters?.allActive),
          dispositiveIds: req.body.filters?.dispositiveIds || [],
          positionIds: req.body.filters?.positionIds || [],
          areas: req.body.filters?.areas || [],
        },
      },

      affectedUsers: moodleUsers.ready.map((user) => ({
        user: user.userId,
        moodleId: user.moodleId,
      })),

      affectedCount: assignments.length,
      selectedCount: localUsers.length,
      skippedCount: moodleUsers.skipped.length,
      errorCount: moodleUsers.errors.length,

      createdBy:
        req.user?._id && isValidObjectId(req.user._id) ? req.user._id : null,
    });
  }

  response(res, 200, {
    action:
      operation === "assign"
        ? "system-role-assigned"
        : "system-role-unassigned",
    operation,
    roleId: Number(roleId),
    selected: localUsers.length,
    affected: assignments.length,
    skipped: moodleUsers.skipped,
    errors: moodleUsers.errors,
  });
};

const postMoodleUndoAssignment = async (req, res) => {
  const { assignmentId } = req.body || {};

  if (!assignmentId || !isValidObjectId(assignmentId)) {
    throw new ClientError("assignmentId no válido", 400);
  }

  const assignment = await MoodleAssignment.findOne({
    _id: assignmentId,
    active: true,
  }).lean();

  if (!assignment) {
    throw new ClientError("Asignación no encontrada o ya retirada", 404);
  }

  const affectedUsers = Array.isArray(assignment.affectedUsers)
    ? assignment.affectedUsers
    : [];

  let undoOperation = "";

  if (affectedUsers.length) {
    if (assignment.assignmentType === "course-enrolment") {
      undoOperation = "unenrol";

      await moodleService.unenrolUsers(
        affectedUsers.map((user) => ({
          userId: Number(user.moodleId),
          courseId: Number(assignment.courseId),
        }))
      );
    }

    if (assignment.assignmentType === "system-role") {
      undoOperation = "unassign";

      await moodleService.unassignRoles(
        affectedUsers.map((user) => ({
          userId: Number(user.moodleId),
          roleId: Number(assignment.roleId),
          contextId: MOODLE_SYSTEM_CONTEXT.contextId,
        }))
      );
    }
  }

  if (!undoOperation) {
    undoOperation =
      assignment.assignmentType === "course-enrolment" ? "unenrol" : "unassign";
  }

  const undoAssignment = await MoodleAssignment.create({
    active: false,
    assignmentType: assignment.assignmentType,
    operation: undoOperation,
    courseId: assignment.courseId,
    courseName: assignment.courseName || "",
    roleId: Number(assignment.roleId),
    roleName: assignment.roleName || "",

    criteria: assignment.criteria,

    affectedUsers,
    affectedCount: affectedUsers.length,
    selectedCount: assignment.selectedCount || affectedUsers.length,
    skippedCount: 0,
    errorCount: 0,

    createdBy:
      req.user?._id && isValidObjectId(req.user._id) ? req.user._id : null,
  });

  await MoodleAssignment.updateOne(
    { _id: assignment._id },
    {
      $set: {
        active: false,
        undoneAt: new Date(),
        undoneBy:
          req.user?._id && isValidObjectId(req.user._id) ? req.user._id : null,
        undoneByAssignment: undoAssignment._id,
      },
    }
  );

  response(res, 200, {
    ok: true,
    assignmentId: String(assignment._id),
    undoAssignmentId: String(undoAssignment._id),
    assignmentType: assignment.assignmentType,
    operation: undoOperation,
    affected: affectedUsers.length,
  });
};

module.exports = {
  postMoodleTest: catchAsync(postMoodleTest),
  postMoodleSyncUser: catchAsync(postMoodleSyncUser),
  postMoodleGetRoles: catchAsync(postMoodleGetRoles),
  postMoodleInfo: catchAsync(postMoodleInfo),
  postMoodleGetCourseUsers: catchAsync(postMoodleGetCourseUsers),
  postMoodleManageCourseEnrolments: catchAsync(postMoodleManageCourseEnrolments),
  postMoodleManageSystemRole: catchAsync(postMoodleManageSystemRole),
  postMoodleUndoAssignment: catchAsync(postMoodleUndoAssignment),

  queueSyncMoodleUserForUser,
  syncMoodleUserForUser,
  enrolMoodleUserInCourse,
  enrolMoodleUserAsStudentInCourse,
};