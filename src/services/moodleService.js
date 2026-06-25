const MOODLE_BASE_URL = String(process.env.MOODLE_BASE_URL || "").replace(/\/+$/, "");
const MOODLE_API_TOKEN = String(process.env.MOODLE_API_TOKEN || "").trim();

if (!MOODLE_BASE_URL) {
  throw new Error("Falta MOODLE_BASE_URL en .env");
}

if (!MOODLE_API_TOKEN) {
  throw new Error("Falta MOODLE_API_TOKEN en .env");
}

async function request(wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: MOODLE_API_TOKEN,
    wsfunction,
    moodlewsrestformat: "json",
  });

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.append(key, String(value));
  });

  const res = await fetch(`${MOODLE_BASE_URL}/webservice/rest/server.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });

  const raw = await res.text();

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    const message = raw.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/)?.[1]?.trim();

    const err = new Error(
      message || `Moodle respondió algo no válido (${res.status}): ${raw.slice(0, 300)}`
    );

    err.status = res.status;
    err.details = raw;
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
    wsfunction,
    params: Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
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
    const params = { field };

    values.forEach((value, index) => {
      params[`values[${index}]`] = value;
    });

    return request("core_user_get_users_by_field", params);
  },

  createUser(data = {}) {
    const params = {};

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params[`users[0][${key}]`] = value;
      }
    });

    return request("core_user_create_users", params);
  },

  updateUser(id, data = {}) {
    const params = {
      "users[0][id]": id,
    };

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params[`users[0][${key}]`] = value;
      }
    });

    return request("core_user_update_users", params);
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

  enrolUser({ userId, courseId, roleId }) {
    return request("enrol_manual_enrol_users", {
      "enrolments[0][userid]": userId,
      "enrolments[0][courseid]": courseId,
      "enrolments[0][roleid]": roleId,
    });
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
};

module.exports = moodleService;