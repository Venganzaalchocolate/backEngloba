const http = require("http");
const https = require("https");

const OHS_BASE_URL = process.env.OHS_API_BASE_URL;
const OHS_USERNAME = process.env.OHS_USERNAME;
const OHS_PASSWORD = process.env.OHS_PASSWORD;

if (!OHS_BASE_URL) throw new Error("Falta OHS_API_BASE_URL en .env");
if (!OHS_USERNAME) throw new Error("Falta OHS_USERNAME en .env");
if (!OHS_PASSWORD) throw new Error("Falta OHS_PASSWORD en .env");

const buildAuthHeader = () => {
  const token = Buffer.from(`${OHS_USERNAME}:${OHS_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
};

const request = (method, path, data = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, OHS_BASE_URL);
    const body = data ? JSON.stringify(data) : null;
    const isHttps = url.protocol === "https:";

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: buildAuthHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = (isHttps ? https : http).request(options, (res) => {
      let raw = "";

      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        let result = raw;

        try {
          result = raw ? JSON.parse(raw) : null;
        } catch {
          result = raw;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(
            result?.message ||
            result?.title ||
            result?.error ||
            "Error al conectar con OHS"
          );

          err.status = res.statusCode;
          err.details = result;
          err.url = url.toString();
          err.method = method;

          reject(err);
          return;
        }

        resolve(result);
      });
    });

    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
};

const ohsService = {
  // =========================
  // TRABAJADORES
  // =========================

  listWorkers(data = {}) {
    return request("GET", "GEN/Trabajadores", data);
  },

  createWorker(data = {}) {
    return request("POST", "GEN/Trabajadores", data);
  },

  updateWorker(data = {}) {
    return request("PUT", "GEN/Trabajadores", data);
  },

  deleteWorker(data = {}) {
    return request("DELETE", "GEN/Trabajadores", data);
  },

  // =========================
  // CENTROS
  // =========================

  listCenters(data = {}) {
    return request("GET", "GEN/Centros", data);
  },

  createCenter(data = {}) {
    return request("POST", "GEN/Centros", data);
  },

  updateCenter(data = {}) {
    return request("PUT", "GEN/Centros", data);
  },

  deleteCenter(data = {}) {
    return request("DELETE", "GEN/Centros", data);
  },

  // =========================
  // EMPRESAS
  // =========================

  listCompanies(data = {}) {
    return request("GET", "Gen/empresas", data);
  },

  // =========================
  // PUESTOS
  // =========================

  listPositions(data = {}) {
    return request("GET", "Gen/Puestos", data);
  },

  createPosition(data = {}) {
    return request("POST", "Gen/Puestos", data);
  },

  updatePosition(data = {}) {
    return request("PUT", "Gen/Puestos", data);
  },

  deletePosition(data = {}) {
    return request("DELETE", "Gen/Puestos", data);
  },
};
module.exports = ohsService;