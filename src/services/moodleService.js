const MOODLE_BASE_URL = String(process.env.MOODLE_BASE_URL || "").replace(
  /\/+$/,
  ""
);
const MOODLE_API_TOKEN = String(process.env.MOODLE_API_TOKEN || "").trim();

if (!MOODLE_BASE_URL) {
  throw new Error("Falta MOODLE_BASE_URL en .env");
}

if (!MOODLE_API_TOKEN) {
  throw new Error("Falta MOODLE_API_TOKEN en .env");
}

async function request(wsfunction, payload = {}) {
  const body = new URLSearchParams({
    wstoken: MOODLE_API_TOKEN,
    wsfunction,
    moodlewsrestformat: "json",
  });

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    body.append(key, String(value));
  });

  const url = `${MOODLE_BASE_URL}/webservice/rest/server.php`;

  let res;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(30000),
      redirect: "manual",
    });
  } catch (error) {
    const cause = error?.cause;

    const err = new Error(
      `No se pudo conectar con Moodle al ejecutar ${wsfunction}: ${
        cause?.message || error?.message || "error de red desconocido"
      }`
    );

    err.cause = cause || error;
    err.moodleRequest = {
      url,
      wsfunction,
      body: Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [
          key,
          key.toLowerCase().includes("password") ? "***" : value,
        ])
      ),
    };

    throw err;
  }

  if (res.status >= 300 && res.status < 400) {
    const err = new Error(
      `Moodle ha respondido con una redirección HTTP ${res.status}`
    );

    err.status = res.status;
    err.location = res.headers.get("location");
    err.moodleRequest = {
      url,
      wsfunction,
    };

    throw err;
  }

  const raw = await res.text();

  let result;

  try {
    result = JSON.parse(raw);
  } catch {
    const message = raw.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/)?.[1]?.trim();

    const err = new Error(
      message ||
        `Moodle respondió algo no válido (${res.status}): ${raw.slice(0, 300)}`
    );

    err.status = res.status;
    err.details = raw;
    err.moodleRequest = {
      url,
      wsfunction,
    };

    throw err;
  }

  if (!res.ok || result?.exception) {
    const err = new Error(
      result?.message ||
        result?.errorcode ||
        "Error al conectar con Moodle"
    );

    err.status = res.status;
    err.details = result;
    err.moodleRequest = {
      url,
      wsfunction,
      body: Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [
          key,
          key.toLowerCase().includes("password") ? "***" : value,
        ])
      ),
    };

    throw err;
  }

  return result;
}

const moodleService = {
  getUsersByField(field, values = []) {
    const payload = { field };

    values.forEach((value, index) => {
      payload[`values[${index}]`] = value;
    });

    return request("core_user_get_users_by_field", payload);
  },

  createUser(data = {}) {
    const payload = {};

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        payload[`users[0][${key}]`] = value;
      }
    });

    return request("core_user_create_users", payload);
  },

  updateUser(id, data = {}) {
    const payload = {
      "users[0][id]": id,
    };

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        payload[`users[0][${key}]`] = value;
      }
    });

    return request("core_user_update_users", payload);
  },

  getCoursesByField(field, value) {
    return request("core_course_get_courses_by_field", {
      field,
      value,
    });
  },

  getUserCourses(userId) {
    return request("core_enrol_get_users_courses", {
      userid: userId,
    });
  },

  getEnrolledUsers(courseId) {
    return request("core_enrol_get_enrolled_users", {
      courseid: courseId,
    });
  },

  enrolUsers(enrolments = []) {
    const payload = {};

    enrolments.forEach((enrolment, index) => {
      payload[`enrolments[${index}][userid]`] = enrolment.userId;
      payload[`enrolments[${index}][courseid]`] = enrolment.courseId;
      payload[`enrolments[${index}][roleid]`] = enrolment.roleId;
    });

    return request("enrol_manual_enrol_users", payload);
  },

  enrolUser({ userId, courseId, roleId }) {
    return this.enrolUsers([
      {
        userId,
        courseId,
        roleId,
      },
    ]);
  },

  unenrolUsers(enrolments = []) {
    const payload = {};

    enrolments.forEach((enrolment, index) => {
      payload[`enrolments[${index}][userid]`] = enrolment.userId;
      payload[`enrolments[${index}][courseid]`] = enrolment.courseId;

      if (enrolment.roleId) {
        payload[`enrolments[${index}][roleid]`] = enrolment.roleId;
      }
    });

    return request("enrol_manual_unenrol_users", payload);
  },

  unenrolUser({ userId, courseId, roleId }) {
    return this.unenrolUsers([
      {
        userId,
        courseId,
        roleId,
      },
    ]);
  },

  getCourseCompletionStatus({ userId, courseId }) {
    return request("core_completion_get_course_completion_status", {
      userid: userId,
      courseid: courseId,
    });
  },

  getActivitiesCompletionStatus({ userId, courseId }) {
    return request("core_completion_get_activities_completion_status", {
      userid: userId,
      courseid: courseId,
    });
  },

  assignRoles(assignments = []) {
    const payload = {};

    assignments.forEach((assignment, index) => {
      payload[`assignments[${index}][roleid]`] = assignment.roleId;
      payload[`assignments[${index}][userid]`] = assignment.userId;
      payload[`assignments[${index}][contextid]`] = assignment.contextId;
      payload[`assignments[${index}][contextlevel]`] = assignment.contextLevel;
      payload[`assignments[${index}][instanceid]`] = assignment.instanceId;
    });

    return request("core_role_assign_roles", payload);
  },

  assignRole({ userId, roleId, contextId, contextLevel, instanceId }) {
    return this.assignRoles([
      {
        userId,
        roleId,
        contextId,
        contextLevel,
        instanceId,
      },
    ]);
  },

  unassignRoles(unassignments = []) {
    const payload = {};

    unassignments.forEach((unassignment, index) => {
      payload[`unassignments[${index}][roleid]`] = unassignment.roleId;
      payload[`unassignments[${index}][userid]`] = unassignment.userId;
      payload[`unassignments[${index}][contextid]`] = unassignment.contextId;
      payload[`unassignments[${index}][contextlevel]`] = unassignment.contextLevel;
      payload[`unassignments[${index}][instanceid]`] = unassignment.instanceId;
    });

    return request("core_role_unassign_roles", payload);
  },

  unassignRole({ userId, roleId, contextId, contextLevel, instanceId }) {
    return this.unassignRoles([
      {
        userId,
        roleId,
        contextId,
        contextLevel,
        instanceId,
      },
    ]);
  },

  getSystemRoleUsers(roleId) {
    return request("local_backengloba_get_system_role_users", {
      roleid: roleId,
    });
  },

  getUserSystemRoles(userId) {
    return request("local_backengloba_get_user_system_roles", {
      userid: userId,
    });
  },
};

module.exports = moodleService;