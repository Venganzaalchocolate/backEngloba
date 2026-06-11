const {
  request,
  OHS_COD_GRUPO_EMPRESA,
  OHS_COD_EMPRESA,
} = require("./ohsClient");

/* ==========================================================================
   Helpers base
========================================================================== */

const withGrupo = (data = {}) => ({
  codGrupoEmpresa: OHS_COD_GRUPO_EMPRESA,
  ...data,
});

const withEmpresa = (data = {}) => ({
  codGrupoEmpresa: OHS_COD_GRUPO_EMPRESA,
  codEmpresa: OHS_COD_EMPRESA,
  ...data,
});

const crud = (path, defaultBody = {}, methods = ["get", "post", "put", "delete"]) => {
  const service = {};

  if (methods.includes("get")) {
    service.get = (data = {}) => request("GET", path, { ...defaultBody, ...data });
  }

  if (methods.includes("post")) {
    service.post = (data = {}) => request("POST", path, { ...defaultBody, ...data });
  }

  if (methods.includes("put")) {
    service.put = (data = {}) => request("PUT", path, { ...defaultBody, ...data });
  }

  if (methods.includes("delete")) {
    service.delete = (data = {}) => request("DELETE", path, { ...defaultBody, ...data });
  }

  return service;
};

/* ==========================================================================
   Recursos OHS usados por la sincronización
========================================================================== */

const OhsCentros = crud("V1/GEN/Centros", withGrupo(), ["get", "post", "put", "delete"]);
const OhsPuestos = crud("V1/GEN/Puestos", withGrupo(), ["get", "post", "put", "delete"]);
const OhsTrabajadores = crud("V1/GEN/Trabajadores", withEmpresa(), ["get", "post", "put", "delete"]);

/* ==========================================================================
   Centros
========================================================================== */

const getOhsCentros = (data = {}) => {
  return OhsCentros.get(data);
};

const createOhsCentro = (data = {}) => {
  return OhsCentros.post(data);
};

const updateOhsCentro = (codCentro, data = {}) => {
  return OhsCentros.put({
    codCentro,
    ...data,
  });
};

const deleteOhsCentro = (codCentro) => {
  return OhsCentros.delete({
    codCentro,
  });
};

/* ==========================================================================
   Puestos
========================================================================== */

const getOhsPuestos = (data = {}) => {
  return OhsPuestos.get(data);
};

const createOhsPuesto = (data = {}) => {
  return OhsPuestos.post(data);
};

const updateOhsPuesto = (codTipoPuesto, data = {}) => {
  return OhsPuestos.put({
    codTipoPuesto,
    ...data,
  });
};

const deleteOhsPuesto = (codTipoPuesto) => {
  return OhsPuestos.delete({
    codTipoPuesto,
  });
};

/* ==========================================================================
   Trabajadores
========================================================================== */

const getOhsTrabajadores = (data = {}) => {
  return OhsTrabajadores.get(data);
};

const getOhsTrabajadorByDni = (dni) => {
  return getOhsTrabajadores({
    codIdentificador: dni,
  });
};

const createOhsTrabajador = (data = {}) => {
  return OhsTrabajadores.post(data);
};

const updateOhsTrabajador = (codTrabajador, data = {}) => {
  return OhsTrabajadores.put({
    codTrabajador,
    ...data,
  });
};

const deleteOhsTrabajador = (codTrabajador) => {
  return OhsTrabajadores.delete({
    codTrabajador,
  });
};

/* ==========================================================================
   Test de endpoints principales
========================================================================== */

const OHS_WORKING_GET_ENDPOINTS = [
  ["Centros", getOhsCentros],
  ["Puestos", getOhsPuestos],
  ["Trabajadores", getOhsTrabajadores],
];

const getOhsWorkingGetEndpoints = async () => {
  const results = [];

  for (const [label, fn] of OHS_WORKING_GET_ENDPOINTS) {
    try {
      const data = await fn();
      results.push({
        label,
        ok: true,
        statusCode: 200,
        data,
      });
    } catch (error) {
      results.push({
        label,
        ok: false,
        statusCode: error.statusCode,
        message: error.message,
        body: error.body,
        url: error.url,
      });
    }
  }

  return results;
};

module.exports = {
  getOhsWorkingGetEndpoints,

  getOhsCentros,
  createOhsCentro,
  updateOhsCentro,
  deleteOhsCentro,

  getOhsPuestos,
  createOhsPuesto,
  updateOhsPuesto,
  deleteOhsPuesto,

  getOhsTrabajadores,
  getOhsTrabajadorByDni,
  createOhsTrabajador,
  updateOhsTrabajador,
  deleteOhsTrabajador,

};