const {
  request,
  OHS_COD_GRUPO_EMPRESA,
  OHS_COD_EMPRESA,
} = require("./ohsClient");

/* ==========================================================================
   Helpers
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

const isValidCode = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
};

const cleanString = (value = "") => String(value || "").trim();

const normalizeDni = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

/* ==========================================================================
   Centros
========================================================================== */

const getOhsCentros = (data = {}) => {
  return request("GET", "V1/GEN/Centros", withGrupo(data));
};

const createOhsCentro = (data = {}) => {
  return request("POST", "V1/GEN/Centros", withGrupo(data));
};

const updateOhsCentro = (codCentro, data = {}) => {
  if (!isValidCode(codCentro)) {
    throw new Error("codCentro inválido para actualizar centro OHS");
  }

  return request("PUT", "V1/GEN/Centros", withGrupo({
    ...data,
    codCentro: Number(codCentro),
  }));
};

const deleteOhsCentro = (codCentro) => {
  if (!isValidCode(codCentro)) {
    throw new Error("codCentro inválido para eliminar centro OHS");
  }

  return request("DELETE", "V1/GEN/Centros", withGrupo({
    codCentro: Number(codCentro),
  }));
};

/* ==========================================================================
   Puestos
========================================================================== */

const getOhsPuestos = (data = {}) => {
  return request("GET", "V1/GEN/Puestos", withGrupo(data));
};

const createOhsPuesto = (data = {}) => {
  const nomTipoPuesto = cleanString(data.nomTipoPuesto);
  const desTipoPuesto = cleanString(data.desTipoPuesto || data.nomTipoPuesto);

  if (!nomTipoPuesto) {
    throw new Error("nomTipoPuesto obligatorio para crear puesto OHS");
  }

  return request("POST", "V1/GEN/Puestos", {
    nomTipoPuesto,
    desTipoPuesto,
    codGrupoEmpresa: OHS_COD_GRUPO_EMPRESA,
  });
};

const updateOhsPuesto = (codTipoPuesto, data = {}) => {
  if (!isValidCode(codTipoPuesto)) {
    throw new Error("codTipoPuesto inválido para actualizar puesto OHS");
  }

  const nomTipoPuesto = cleanString(data.nomTipoPuesto);
  const desTipoPuesto = cleanString(data.desTipoPuesto || data.nomTipoPuesto);

  if (!nomTipoPuesto) {
    throw new Error("nomTipoPuesto obligatorio para actualizar puesto OHS");
  }

  return request("PUT", "V1/GEN/Puestos", {
    nomTipoPuesto,
    codTipoPuesto: Number(codTipoPuesto),
    desTipoPuesto,
    codGrupoEmpresa: OHS_COD_GRUPO_EMPRESA,
  });
};

const deleteOhsPuesto = (codTipoPuesto) => {
  if (!isValidCode(codTipoPuesto)) {
    throw new Error("codTipoPuesto inválido para eliminar puesto OHS");
  }

  return request("DELETE", "V1/GEN/Puestos", {
    codTipoPuesto: Number(codTipoPuesto),
    codGrupoEmpresa: OHS_COD_GRUPO_EMPRESA,
  });
};

/* ==========================================================================
   Trabajadores
========================================================================== */

const getOhsTrabajadores = (data = {}) => {
  return request("GET", "V1/GEN/Trabajadores", withEmpresa(data));
};

const getOhsTrabajadorByDni = (dni) => {
  return getOhsTrabajadores({
    codIdentificador: normalizeDni(dni),
  });
};

const getOhsTrabajadorByDniIncludingDeleted = (dni) => {
  return getOhsTrabajadores({
    codIdentificador: normalizeDni(dni),
    indIncluyeBorrados: true,
  });
};

const getOhsTrabajadorByCodIncludingDeleted = (codTrabajador) => {
  if (!isValidCode(codTrabajador)) {
    throw new Error("codTrabajador inválido para consultar trabajador OHS");
  }

  return getOhsTrabajadores({
    codTrabajador: Number(codTrabajador),
    indIncluyeBorrados: true,
  });
};

const createOhsTrabajador = (data = {}) => {
  return request("POST", "V1/GEN/Trabajadores", withEmpresa(data));
};

const updateOhsTrabajador = (codTrabajador, data = {}) => {
  if (!isValidCode(codTrabajador)) {
    throw new Error("codTrabajador inválido para actualizar trabajador OHS");
  }

  return request("PUT", "V1/GEN/Trabajadores", withEmpresa({
    ...data,
    codTrabajador: Number(codTrabajador),
  }));
};

const deleteOhsTrabajador = (codTrabajador) => {
  if (!isValidCode(codTrabajador)) {
    throw new Error("codTrabajador inválido para eliminar trabajador OHS");
  }

  return request("DELETE", "V1/GEN/Trabajadores", withEmpresa({
    codTrabajador: Number(codTrabajador),
  }));
};

/* ==========================================================================
   Test básico
========================================================================== */

const getOhsWorkingGetEndpoints = async () => {
  const endpoints = [
    ["Centros", getOhsCentros],
    ["Puestos", getOhsPuestos],
    ["Trabajadores", getOhsTrabajadores],
  ];

  const results = [];

  for (const [label, fn] of endpoints) {
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
  getOhsTrabajadorByDniIncludingDeleted,
  getOhsTrabajadorByCodIncludingDeleted,
  createOhsTrabajador,
  updateOhsTrabajador,
  deleteOhsTrabajador,
};