const SESAME_BASE_URL = process.env.SESAME_API_BASE_URL;
const SESAME_API_KEY = process.env.SESAME_API_KEY;

if (!SESAME_BASE_URL) {
  throw new Error("Falta SESAME_API_BASE_URL en .env");
}

if (!SESAME_API_KEY) {
  throw new Error("Falta SESAME_API_KEY en .env");
}

/**
 * Hace una petición genérica a Sesame.
 */
async function request(method, url, { params, data } = {}) {
  const finalUrl = new URL(url, SESAME_BASE_URL);

  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") {
            finalUrl.searchParams.append(key, String(item));
          }
        });
        return;
      }

      finalUrl.searchParams.append(key, String(value));
    });
  }

  const fetchOptions = {
    method,
    headers: {
      Authorization: `Bearer ${SESAME_API_KEY}`,
    },
  };

  if (data && method !== "GET" && method !== "HEAD") {
    fetchOptions.headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(data);
  }

  const res = await fetch(finalUrl.toString(), fetchOptions);

  const contentType = res.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const err = new Error(
      result?.message ||
        result?.title ||
        result?.error?.message ||
        "Error al conectar con Sesame"
    );
    err.status = res.status;
    err.details = result;
    err.url = finalUrl.toString();
    throw err;
  }

  return result;
}

const sesameService = {
  // =========================
  // EMPLOYEES
  // =========================
  listEmployees(params = {}) {
    return request("GET", "/core/v3/employees", { params });
  },

  getEmployeeById(id) {
    return request("GET", `/core/v3/employees/${id}`);
  },

  createEmployee(data = {}) {
    return request("POST", "/core/v3/employees", { data });
  },

  updateEmployee(id, data = {}) {
    return request("PUT", `/core/v3/employees/${id}`, { data });
  },

  deleteEmployee(id) {
    return request("DELETE", `/core/v3/employees/${id}`);
  },

  // =========================
  // DEPARTMENTS
  // =========================
  listDepartments(params = {}) {
    return request("GET", "/core/v3/departments", { params });
  },

  createDepartment(data = {}) {
    return request("POST", "/core/v3/departments", { data });
  },

  updateDepartment(id, data = {}) {
    return request("PUT", `/core/v3/departments/${id}`, { data });
  },

  deleteDepartment(id) {
    return request("DELETE", `/core/v3/departments/${id}`);
  },

  // =========================
  // WORKPLACES
  // =========================
  listWorkplaces(params = {}) {
    return request("GET", "/core/v3/workplaces", { params });
  },

  getWorkplaceById(id) {
    return request("GET", `/core/v3/workplaces/${id}`);
  },

  createWorkplace(data = {}) {
    return request("POST", "/core/v3/workplaces", { data });
  },

  updateWorkplace(id, data = {}) {
    return request("PUT", `/core/v3/workplaces/${id}`, { data });
  },

  deleteWorkplace(id) {
    return request("DELETE", `/core/v3/workplaces/${id}`);
  },

  // =========================
  // OFFICES
  // =========================
  listOffices(params = {}) {
    return request("GET", "/core/v3/offices", { params });
  },

  getOfficeById(id) {
    return request("GET", `/core/v3/offices/${id}`);
  },

  createOffice(data = {}) {
    return request("POST", "/core/v3/offices", { data });
  },

  updateOffice(id, data = {}) {
    return request("PUT", `/core/v3/offices/${id}`, { data });
  },

  deleteOffice(id) {
    return request("DELETE", `/core/v3/offices/${id}`);
  },

  // =========================
  // EMPLOYEE MANAGERS
  // =========================
  getEmployeeManagers(params = {}) {
    return request("GET", "/core/v3/employee-managers", { params });
  },

  assignEmployeeManager(data = {}) {
    console.log(data)
    return request("POST", "/core/v3/employee-managers", { data });
  },

  updateEmployeeManager(id, data = {}) {
    return request("PUT", `/core/v3/employee-managers/${id}`, { data });
  },

  deleteEmployeeManager(id) {
    return request("DELETE", `/core/v3/employee-managers/${id}`);
  },

  // =========================
  // EMPLOYEE OFFICE ASSIGNATIONS
  // =========================
  getEmployeeOfficeAssignations(params = {}) {
    return request("GET", "/core/v3/employee-office-assignations", { params });
  },

  assignEmployeeOffice(data = {}) {
    return request("POST", "/core/v3/employee-office-assignations", { data });
  },

  updateEmployeeOfficeAssignation(id, data = {}) {
  return request("PUT", `/core/v3/employee-office-assignations/${id}`, { data,});
},

  deleteEmployeeOfficeAssignation(data = {}) {
    return request("DELETE", "/core/v3/employee-office-assignations", { data });
  },

  listOfficeEmployees(params = {}) {
    return request("GET", "/core/v3/employee-office-assignations", { params });
  },

  

  // =========================
  // EMPLOYEE DEPARTMENT ASSIGNATIONS
  // =========================
  getDepartmentEmployees(params = {}) {
    return request("GET", "/core/v3/employee-department-assignations", { params });
  },

  assignEmployeeDepartment(data = {}) {
    return request("POST", "/core/v3/employee-department-assignations", { data });
  },

  deleteEmployeeDepartmentAssignation(data = {}) {
    return request("DELETE", "/core/v3/employee-department-assignations", { data });
  },

  // =========================
  // ROLES
  // =========================
  listRoles(params = {}) {
    return request("GET", "/core/v3/roles", { params });
  },

  listEmployeeRoleAssignations(employeeId, params = {}) {
    return request("GET", `/core/v3/roles/assignation/${employeeId}`, { params });
  },

  assignRoleToEmployee(data = {}) {
    return request("POST", "/core/v3/roles/assignation", { data });
  },

  unassignRoleFromEmployee(data = {}) {
    return request("DELETE", "/core/v3/roles/assignation", { data });
  },
};

module.exports = sesameService;