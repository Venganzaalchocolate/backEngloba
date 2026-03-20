const SESAME_BASE_URL = process.env.SESAME_API_BASE_URL;
const SESAME_API_KEY = process.env.SESAME_API_KEY;

if (!SESAME_BASE_URL) {
  throw new Error("Falta SESAME_API_BASE_URL en .env");
}

if (!SESAME_API_KEY) {
  throw new Error("Falta SESAME_API_KEY en .env");
}

async function request(method, url, { params, data } = {}) {
  const finalUrl = new URL(url, SESAME_BASE_URL);

  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        finalUrl.searchParams.append(key, value);
      }
    });
  }

  const response = await fetch(finalUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SESAME_API_KEY}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const err = new Error(
      result?.message || result?.title || "Error al conectar con Sesame"
    );
    err.status = response.status;
    err.details = result;
    throw err;
  }

  return result;
}

const sesameService = {
  listEmployees(params = {}) {
    return request("GET", "/employees", { params });
  },

  getEmployeeById(id) {
    return request("GET", `/employees/${id}`);
  },

  createEmployee(data = {}) {
    return request("POST", "/employees", { data });
  },

  updateEmployee(id, data = {}) {
    return request("PUT", `/employees/${id}`, { data });
  },

  deleteEmployee(id) {
    return request("DELETE", `/employees/${id}`);
  },

  listDepartments(params = {}) {
    return request("GET", "/departments", { params });
  },

  getDepartmentById(id) {
    return request("GET", `/departments/${id}`);
  },

  createDepartment(data = {}) {
    return request("POST", "/departments", { data });
  },

  updateDepartment(id, data = {}) {
    return request("PUT", `/departments/${id}`, { data });
  },

  deleteDepartment(id) {
    return request("DELETE", `/departments/${id}`);
  },

  listWorkplaces(params = {}) {
    return request("GET", "/workplaces", { params });
  },

  getWorkplaceById(id) {
    return request("GET", `/workplaces/${id}`);
  },

  createWorkplace(data = {}) {
    return request("POST", "/workplaces", { data });
  },

  updateWorkplace(id, data = {}) {
    return request("PUT", `/workplaces/${id}`, { data });
  },

  deleteWorkplace(id) {
    return request("DELETE", `/workplaces/${id}`);
  },
};

module.exports = sesameService;