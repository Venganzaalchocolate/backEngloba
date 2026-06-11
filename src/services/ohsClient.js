const http = require("http");
const https = require("https");

const OHS_BASE_URL = process.env.OHS_API_BASE_URL;
const OHS_USERNAME = process.env.OHS_USERNAME;
const OHS_PASSWORD = process.env.OHS_PASSWORD;
const OHS_COD_GRUPO_EMPRESA = Number(process.env.OHS_COD_GRUPO_EMPRESA);
const OHS_COD_EMPRESA = Number(process.env.OHS_COD_EMPRESA);

if (!OHS_BASE_URL) throw new Error("Falta OHS_API_BASE_URL en .env");
if (!OHS_USERNAME) throw new Error("Falta OHS_USERNAME en .env");
if (!OHS_PASSWORD) throw new Error("Falta OHS_PASSWORD en .env");
if (!OHS_COD_GRUPO_EMPRESA) throw new Error("Falta OHS_COD_GRUPO_EMPRESA en .env");
if (!OHS_COD_EMPRESA) throw new Error("Falta OHS_COD_EMPRESA en .env");

const buildAuthHeader = () => {
  const token = Buffer.from(`${OHS_USERNAME}:${OHS_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
};

const normalizeBaseUrl = () => {
  return OHS_BASE_URL.endsWith("/") ? OHS_BASE_URL : `${OHS_BASE_URL}/`;
};

const request = (method, path, data = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path.replace(/^\/+/, ""), normalizeBaseUrl());
    const body = data ? JSON.stringify(data) : "";
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
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let raw = "";

      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        let parsed = raw;

        try {
          if (raw) parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);

        const error = new Error(`OHS ${res.statusCode} ${res.statusMessage}`);
        error.statusCode = res.statusCode;
        error.body = parsed;
        error.url = url.toString();
        return reject(error);
      });
    });

    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
};

module.exports = {
  request,
  OHS_COD_GRUPO_EMPRESA,
  OHS_COD_EMPRESA,
};