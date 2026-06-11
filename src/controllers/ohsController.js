const { User, Workplace, Jobs, Periods } = require("../models/indexModels");

const {
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
} = require("../services/ohsServices");

const sesameService = require("../services/sesameServices");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

/* ==========================================================================
   Helpers generales
========================================================================== */

/**
 * Normaliza un DNI/NIE para búsquedas y envíos a OHS.
 */
const normalizeDniOhs = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

/**
 * Convierte una fecha local en formato ISO válido para OHS.
 */
const formatDateOhs = (date) => {
  if (!date) return undefined;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
};


/**
 * Separa los apellidos locales en apellido1 y apellido2 para OHS.
 */
const splitLastName = (lastName = "") => {
  const parts = String(lastName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return {
      apellido1Trabajador: "",
      apellido2Trabajador: "",
    };
  }

  if (parts.length === 1) {
    return {
      apellido1Trabajador: parts[0],
      apellido2Trabajador: "",
    };
  }

  return {
    apellido1Trabajador: parts[0],
    apellido2Trabajador: parts.slice(1).join(" "),
  };
};

/**
 * Comprueba que un código OHS sea numérico y mayor que cero.
 */
const isValidOhsCode = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
};

/**
 * Normaliza texto para comparar nombres entre Mongo/OHS.
 */
const normalizeTextOhs = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

/* ==========================================================================
   Helpers de respuestas OHS
========================================================================== */

/**
 * Extrae centros desde la respuesta de OHS.
 */
const getOhsCentrosItems = (data) => {
  return data?.listaCentrosCompletos || data?.listaCentros || [];
};

/**
 * Extrae puestos desde la respuesta de OHS.
 */
const getOhsPuestosItems = (data) => {
  return (
    data?.listaPuestosCompletos ||
    data?.listaPuestos ||
    data?.listaTiposPuesto ||
    []
  );
};

/**
 * Extrae trabajadores desde la respuesta de OHS.
 */
const getOhsTrabajadoresItems = (data) => {
  return (
    data?.listaTrabajadorCompletos ||
    data?.listaTrabajadoresCompletos ||
    data?.listaTrabajadores ||
    []
  );
};

/**
 * Obtiene codCentro desde un objeto centro de OHS.
 */
const getCodCentroFromOhsCentro = (centro) => {
  const value = centro?.codCentro || null;
  return isValidOhsCode(value) ? Number(value) : null;
};

/**
 * Obtiene codTipoPuesto desde un objeto puesto de OHS.
 */
const getCodTipoPuestoFromOhsPuesto = (puesto) => {
  const value =
    puesto?.codTipoPuesto ||
    puesto?.CodTipoPuesto ||
    puesto?.listaPuestos?.[0]?.codTipoPuesto ||
    puesto?.listaPuestos?.[0]?.CodTipoPuesto ||
    puesto?.listaTiposPuesto?.[0]?.codTipoPuesto ||
    puesto?.listaTiposPuesto?.[0]?.CodTipoPuesto ||
    puesto?.data?.codTipoPuesto ||
    puesto?.data?.CodTipoPuesto ||
    null;

  return isValidOhsCode(value) ? Number(value) : null;
};

/**
 * Obtiene codCentro desde una respuesta de creación de centro.
 */
const getCodCentroFromOhsResponse = (data) => {
  const value = data?.codCentro || data?.listaCentros?.[0]?.codCentro || null;
  return isValidOhsCode(value) ? Number(value) : null;
};

/**
 * Obtiene codTrabajador desde una respuesta de creación o consulta.
 */
const getCodTrabajadorFromOhsResponse = (data) => {
  const value =
    data?.codTrabajador ||
    data?.listaTrabajadorCompletos?.[0]?.codTrabajador ||
    data?.listaTrabajadoresCompletos?.[0]?.codTrabajador ||
    data?.listaTrabajadores?.[0]?.codTrabajador ||
    null;

  return isValidOhsCode(value) ? Number(value) : null;
};

/* ==========================================================================
   Builders de payload
========================================================================== */

/**
 * Construye el payload de trabajador OHS desde un usuario local.
 */
const buildOhsTrabajadorFromUser = (user, extra = {}) => {
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.firstName) throw new ClientError("El usuario no tiene nombre", 400);
  if (!user.dni) throw new ClientError("El usuario no tiene DNI/NIE", 400);

  const { apellido1Trabajador, apellido2Trabajador } = splitLastName(user.lastName);

  const payload = {
    nomTrabajador: String(user.firstName || "").trim(),
    apellido1Trabajador,
    apellido2Trabajador,
    codIdentificador: normalizeDniOhs(user.dni),
  };

  if (user.birthday) payload.fecNacimiento = formatDateOhs(user.birthday);
  if (user.email) payload.desEmail = String(user.email).trim().toLowerCase();

  const gender = (!!user.gender) ? user.gender : 'noIdentificado';


  return {
    ...payload,
    ...extra,
  };
};

/**
 * Construye el payload de centro OHS desde un Workplace local.
 */
const buildOhsCentroFromWorkplace = (workplace, extra = {}) => {
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);
  if (!workplace.name) throw new ClientError("El centro de trabajo no tiene nombre", 400);

  const provinceName = workplace.province?.name || workplace.resolvedAddress?.province || "";
  const city = workplace.resolvedAddress?.city || "";
  const postcode = workplace.resolvedAddress?.postcode || "";
  const address = workplace.address || workplace.resolvedAddress?.formatted || "";

  return {
    nomCentro: String(workplace.name || "").trim(),
    domicilioAlta: {
      codDomicilio: null,
      desPoblacion: String(city || "").trim(),
      desProvincia: String(provinceName || "").trim(),
      codPoblacion: null,
      codPostal: String(postcode || "").trim(),
      codProvincia: null,
      desDomicilio: String(address || "").trim(),
    },
    ...extra,
  };
};

/**
 * Construye el payload de puesto OHS.
 */
const buildOhsPuestoPayload = ({ name, description, codTipoPuesto } = {}) => {
  if (!name) throw new ClientError("Falta el nombre del puesto", 400);

  const payload = {
    nomTipoPuesto: String(name).trim(),
    desTipoPuesto: String(description || name).trim(),
  };

  if (isValidOhsCode(codTipoPuesto)) {
    payload.codTipoPuesto = Number(codTipoPuesto);
  }

  return payload;
};

/**
 * Construye la lista de puestos del trabajador para OHS.
 */
const buildOhsPuestosTrabajador = (codTipoPuesto) => {
  if (!isValidOhsCode(codTipoPuesto)) return [];

  return [
    {
      codTipoPuesto: Number(codTipoPuesto),
    },
  ];
};

/* ==========================================================================
   Búsquedas OHS
========================================================================== */

/**
 * Busca un trabajador en OHS usando el DNI local.
 */
const findOhsTrabajadorByUser = async (user) => {
  if (!user?.dni) return null;

  const data = await getOhsTrabajadorByDni(normalizeDniOhs(user.dni));
  const items = getOhsTrabajadoresItems(data);

  if (!items.length) return null;

  if (items.length > 1) {
    throw new ClientError(`Hay más de un trabajador en OHS con el DNI ${user.dni}`, 409);
  }

  return items[0];
};

/**
 * Busca un centro en OHS por nombre exacto normalizado.
 */
const findOhsCentroByName = async (workplaceName) => {
  if (!workplaceName) return null;

  const data = await getOhsCentros({
    nomCentro: String(workplaceName).trim(),
  });

  const items = getOhsCentrosItems(data);
  if (!items.length) return null;

  const normalizedName = normalizeTextOhs(workplaceName);

  const matches = items.filter((item) => {
    return normalizeTextOhs(item.nomCentro) === normalizedName;
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new ClientError(`Hay más de un centro en OHS con el nombre exacto "${workplaceName}"`, 409);
  }

  if (items.length === 1) return items[0];

  throw new ClientError(`Hay varios centros en OHS parecidos a "${workplaceName}". No se enlaza automáticamente.`, 409);
};

/**
 * Busca un puesto en OHS por nombre exacto normalizado.
 */
const findOhsPuestoByName = async (name) => {
  if (!name) return null;

  const data = await getOhsPuestos({
    nomTipoPuesto: String(name).trim(),
  });

  const items = getOhsPuestosItems(data);
  if (!items.length) return null;

  const normalizedName = normalizeTextOhs(name);

  const matches = items.filter((item) => {
    return normalizeTextOhs(item.nomTipoPuesto) === normalizedName;
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new ClientError(`Hay más de un puesto en OHS con el nombre exacto "${name}"`, 409);
  }

  return null;
};

/* ==========================================================================
   Centros OHS
========================================================================== */

/**
 * Obtiene un Workplace preparado para operar con OHS.
 */
const getWorkplaceForOhs = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId)
    .populate("province", "name")
    .lean();

  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  return workplace;
};

/**
 * Crea un centro en OHS desde un Workplace y guarda codCentroOhs.
 */
const createOhsCentroFromWorkplaceAndSave = async (workplaceId, extraPayload = {}) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  if (isValidOhsCode(workplace.codCentroOhs)) {
    throw new ClientError("El centro de trabajo ya tiene codCentroOhs", 409);
  }

  const payload = buildOhsCentroFromWorkplace(workplace, extraPayload);
  const created = await createOhsCentro(payload);
  const codCentro = getCodCentroFromOhsResponse(created);

  if (!codCentro) throw new ClientError("OHS no devolvió un codCentro válido", 500);

  await Workplace.updateOne(
    { _id: workplace._id },
    { $set: { codCentroOhs: String(codCentro) } }
  );

  return {
    action: "created",
    workplaceId: String(workplace._id),
    codCentro: String(codCentro),
    payload,
    data: created,
  };
};

/**
 * Actualiza en OHS un centro ya enlazado con un Workplace.
 */
const updateOhsCentroFromWorkplaceSaved = async (workplaceId, extraPayload = {}) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  if (!isValidOhsCode(workplace.codCentroOhs)) {
    throw new ClientError("El centro de trabajo no tiene codCentroOhs válido", 400);
  }

  const payload = buildOhsCentroFromWorkplace(workplace, extraPayload);
  const updated = await updateOhsCentro(workplace.codCentroOhs, payload);

  return {
    action: "updated",
    workplaceId: String(workplace._id),
    codCentro: String(workplace.codCentroOhs),
    payload,
    data: updated,
  };
};

/**
 * Sincroniza un Workplace con OHS: actualiza si tiene código, enlaza si existe o crea si no existe.
 */
const syncOhsCentroForWorkplace = async (workplaceId, extraPayload = {}) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  if (isValidOhsCode(workplace.codCentroOhs)) {
    return updateOhsCentroFromWorkplaceSaved(workplaceId, extraPayload);
  }

  const existingCentro = await findOhsCentroByName(workplace.name);
  const existingCodCentro = getCodCentroFromOhsCentro(existingCentro);

  if (existingCodCentro) {
    const payload = buildOhsCentroFromWorkplace(workplace, extraPayload);
    const updated = await updateOhsCentro(existingCodCentro, payload);

    await Workplace.updateOne(
      { _id: workplace._id },
      { $set: { codCentroOhs: String(existingCodCentro) } }
    );

    return {
      action: "linked-and-updated",
      workplaceId: String(workplace._id),
      codCentro: String(existingCodCentro),
      payload,
      data: updated,
    };
  }

  return createOhsCentroFromWorkplaceAndSave(workplaceId, extraPayload);
};

/**
 * Sincroniza todos los centros activos con OHS.
 */
/**
 * Sincroniza todos los centros activos con OHS.
 */
const syncActiveWorkplacesWithOhsLocal = async ({ dryRun = true, limit = 0, verbose = false } = {}) => {
  let workplacesQuery = Workplace.find({
    active: true,
    name: { $exists: true, $ne: "" },
  })
    .select("_id name address province resolvedAddress codCentroOhs active entity")
    .populate("province", "name")
    .sort({ name: 1 });

  if (limit > 0) workplacesQuery = workplacesQuery.limit(limit);

  const workplaces = await workplacesQuery;

  logOhs(verbose, `Centros encontrados en Mongo: ${workplaces.length}`);

  const results = {
    dryRun,
    total: workplaces.length,
    created: [],
    updated: [],
    linkedAndUpdated: [],
    errors: [],
  };

  for (const workplace of workplaces) {
    try {
      logOhs(verbose, `Centro: ${workplace.name}`);

      const payload = buildOhsCentroFromWorkplace(workplace);

      if (isValidOhsCode(workplace.codCentroOhs)) {
        if (!dryRun) {
          const updated = await updateOhsCentro(workplace.codCentroOhs, payload);

          logOhs(verbose, `Centro actualizado: ${workplace.name} -> ${workplace.codCentroOhs}`);

          results.updated.push({
            workplaceId: String(workplace._id),
            name: workplace.name,
            codCentro: String(workplace.codCentroOhs),
            data: updated,
          });
        } else {
          logOhs(verbose, `Centro se actualizaría: ${workplace.name} -> ${workplace.codCentroOhs}`);

          results.updated.push({
            workplaceId: String(workplace._id),
            name: workplace.name,
            codCentro: String(workplace.codCentroOhs),
            dryRun: true,
          });
        }

        continue;
      }

      const existingCentro = await findOhsCentroByName(workplace.name);
      const existingCodCentro = getCodCentroFromOhsCentro(existingCentro);

      if (existingCodCentro) {
        if (!dryRun) {
          const updated = await updateOhsCentro(existingCodCentro, payload);

          await Workplace.updateOne(
            { _id: workplace._id },
            { $set: { codCentroOhs: String(existingCodCentro) } }
          );

          logOhs(verbose, `Centro enlazado: ${workplace.name} -> ${existingCodCentro}`);

          results.linkedAndUpdated.push({
            workplaceId: String(workplace._id),
            name: workplace.name,
            codCentro: String(existingCodCentro),
            data: updated,
          });
        } else {
          logOhs(verbose, `Centro se enlazaría: ${workplace.name} -> ${existingCodCentro}`);

          results.linkedAndUpdated.push({
            workplaceId: String(workplace._id),
            name: workplace.name,
            codCentro: String(existingCodCentro),
            dryRun: true,
          });
        }

        continue;
      }

      if (!dryRun) {
        const created = await createOhsCentro(payload);
        const createdId = getCodCentroFromOhsResponse(created);

        if (!createdId) {
          throw new ClientError(`OHS no devolvió codCentro válido para "${workplace.name}"`, 500);
        }

        await Workplace.updateOne(
          { _id: workplace._id },
          { $set: { codCentroOhs: String(createdId) } }
        );

        logOhs(verbose, `Centro creado: ${workplace.name} -> ${createdId}`);

        results.created.push({
          workplaceId: String(workplace._id),
          name: workplace.name,
          codCentro: String(createdId),
          data: created,
        });
      } else {
        logOhs(verbose, `Centro se crearía: ${workplace.name}`);

        results.created.push({
          workplaceId: String(workplace._id),
          name: workplace.name,
          dryRun: true,
        });
      }
    } catch (error) {
      logOhs(verbose, `ERROR centro: ${workplace.name}`, error.message);

      results.errors.push({
        workplaceId: String(workplace._id),
        name: workplace.name,
        codCentroOhs: workplace.codCentroOhs || null,
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  return results;
};

/* ==========================================================================
   Puestos OHS desde Jobs.subcategories
========================================================================== */

/**
 * Obtiene la subcategoría de Jobs a partir del ObjectId guardado en Period.position.
 */
const getJobSubcategoryById = async (subcategoryId) => {
  if (!subcategoryId) return null;

  const job = await Jobs.findOne(
    { "subcategories._id": subcategoryId },
    { name: 1, "subcategories.$": 1 }
  ).lean();

  if (!job?.subcategories?.length) return null;

  const subcategory = job.subcategories[0];

  return {
    jobId: String(job._id),
    jobName: job.name,
    subcategoryId: String(subcategory._id),
    subcategoryName: subcategory.name,
    codTipoPuestoOhs: subcategory.codTipoPuestoOhs || null,
  };
};

/**
 * Construye el nombre del puesto que se enviará a OHS.
 */
const buildOhsPuestoNameFromSubcategory = (item) => {
  return `${item.jobName} - ${item.subcategoryName}`.trim();
};

/**
 * Crea o actualiza un puesto en OHS.
 */
const syncOhsPuesto = async ({ name, description, codTipoPuesto }) => {
  const payload = buildOhsPuestoPayload({ name, description, codTipoPuesto });

  if (isValidOhsCode(codTipoPuesto)) {
    const updated = await updateOhsPuesto(codTipoPuesto, payload);

    return {
      action: "updated",
      codTipoPuesto: String(codTipoPuesto),
      payload,
      data: updated,
    };
  }

  const existing = await findOhsPuestoByName(payload.nomTipoPuesto);
  const existingCodTipoPuesto = getCodTipoPuestoFromOhsPuesto(existing);

  if (existingCodTipoPuesto) {
    const updated = await updateOhsPuesto(existingCodTipoPuesto, payload);

    return {
      action: "linked-and-updated",
      codTipoPuesto: String(existingCodTipoPuesto),
      payload,
      data: updated,
    };
  }

  const created = await createOhsPuesto(payload);
  let createdCodTipoPuesto = getCodTipoPuestoFromOhsPuesto(created);

  if (!createdCodTipoPuesto) {
    const foundData = await getOhsPuestos({
      nomTipoPuesto: payload.nomTipoPuesto,
    });

    const foundItems = getOhsPuestosItems(foundData);

    const exactMatch = foundItems.find((item) => {
      return normalizeTextOhs(item.nomTipoPuesto) === normalizeTextOhs(payload.nomTipoPuesto);
    });

    createdCodTipoPuesto = getCodTipoPuestoFromOhsPuesto(exactMatch);
  }

  if (!createdCodTipoPuesto) {
    throw new ClientError(`OHS no devolvió codTipoPuesto válido para "${payload.nomTipoPuesto}"`, 500);
  }

  return {
    action: "created",
    codTipoPuesto: String(createdCodTipoPuesto),
    payload,
    data: created,
  };
};

/**
 * Sincroniza todas las subcategorías públicas de Jobs como puestos en OHS.
 */
const syncOhsPuestosFromJobsLocal = async ({ dryRun = true, verbose = false } = {}) => {
  const jobs = await Jobs.find({
    public: true,
    subcategories: { $exists: true, $ne: [] },
  })
    .select("_id name subcategories")
    .sort({ name: 1 })
    .lean();

  logOhs(verbose, `Jobs con subcategorías encontrados: ${jobs.length}`);

  const results = {
    dryRun,
    total: 0,
    created: [],
    updated: [],
    linkedAndUpdated: [],
    skipped: [],
    errors: [],
  };

  for (const job of jobs) {
    for (const subcategory of job.subcategories || []) {
      results.total += 1;

      try {
        logOhs(verbose, `Puesto: ${job.name} - ${subcategory.name || ""}`);

        if (!subcategory.name) {
          logOhs(verbose, `Puesto omitido: ${job.name} - ${subcategory.name || ""}`);

          results.skipped.push({
            jobId: String(job._id),
            jobName: job.name,
            subcategoryId: String(subcategory._id),
            subcategoryName: subcategory.name || "",
            reason: "Subcategoría sin nombre o no pública",
          });
          continue;
        }

        const item = {
          jobId: String(job._id),
          jobName: job.name,
          subcategoryId: String(subcategory._id),
          subcategoryName: subcategory.name,
          codTipoPuestoOhs: subcategory.codTipoPuestoOhs || null,
        };

        const name = buildOhsPuestoNameFromSubcategory(item);
        const description = name;

        if (dryRun) {
          const list = isValidOhsCode(item.codTipoPuestoOhs) ? "updated" : "created";

          logOhs(verbose, `Puesto se ${list === "updated" ? "actualizaría" : "crearía"}: ${name}`);

          results[list].push({
            ...item,
            name,
            description,
            dryRun: true,
          });
          continue;
        }

        const result = await syncOhsPuesto({
          name,
          description,
          codTipoPuesto: item.codTipoPuestoOhs,
        });

        if (result.codTipoPuesto && String(result.codTipoPuesto) !== String(item.codTipoPuestoOhs || "")) {
          await Jobs.updateOne(
            { _id: job._id, "subcategories._id": subcategory._id },
            { $set: { "subcategories.$.codTipoPuestoOhs": String(result.codTipoPuesto) } }
          );
        }

        logOhs(verbose, `Puesto ${result.action}: ${name} -> ${result.codTipoPuesto}`);

        const list = result.action === "linked-and-updated" ? "linkedAndUpdated" : result.action;

        results[list].push({
          ...item,
          name,
          description,
          codTipoPuesto: result.codTipoPuesto,
          data: result.data,
        });
      } catch (error) {
        logOhs(verbose, `ERROR puesto: ${job.name} - ${subcategory.name || ""}`, error.message);

        results.errors.push({
          jobId: String(job._id),
          jobName: job.name,
          subcategoryId: String(subcategory._id),
          subcategoryName: subcategory.name || "",
          message: error.message,
          statusCode: error.statusCode,
          body: error.body,
          url: error.url,
        });
      }
    }
  }

  return results;
};

/* ==========================================================================
   Trabajadores OHS
========================================================================== */

/**
 * Crea o actualiza un trabajador en OHS desde un User y guarda userIdOhs.
 */
const ensureOhsTrabajadorForUser = async (userId, extraPayload = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const payload = buildOhsTrabajadorFromUser(user, extraPayload);

  let codTrabajador = user.userIdOhs || null;

  if (!codTrabajador) {
    const existing = await findOhsTrabajadorByUser(user);
    codTrabajador = existing?.codTrabajador || null;
  }

  if (codTrabajador) {
    const updated = await updateOhsTrabajador(codTrabajador, payload);

    if (!user.userIdOhs || String(user.userIdOhs) !== String(codTrabajador)) {
      await User.updateOne(
        { _id: user._id },
        { $set: { userIdOhs: String(codTrabajador) } }
      );
    }

    return {
      action: "updated",
      userId: String(user._id),
      codTrabajador: String(codTrabajador),
      payload,
      data: updated,
    };
  }

  const created = await createOhsTrabajador(payload);
  const createdId = getCodTrabajadorFromOhsResponse(created);

  if (!createdId) {
  const error = new ClientError(
    `OHS no devolvió codTrabajador válido para ${user.firstName} ${user.lastName || ""}`,
    500
  );

  error.payload = payload;
  error.data = created;

  throw error;
}

  await User.updateOne(
    { _id: user._id },
    { $set: { userIdOhs: String(createdId) } }
  );

  return {
    action: "created",
    userId: String(user._id),
    codTrabajador: String(createdId),
    payload,
    data: created,
  };
};


/**
 * Sincroniza todos los usuarios activos como trabajadores en OHS.
 */
const syncActiveUsersWithOhsLocal = async ({ dryRun = true, limit = 0, verbose = false } = {}) => {
  let usersQuery = User.find({
    employmentStatus: "activo",
    dni: { $exists: true, $ne: "" },
    firstName: { $exists: true, $ne: "" },
    email: { $exists: true, $ne: "" },
  })
    .select("_id firstName lastName dni birthday email gender userIdOhs employmentStatus")
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) usersQuery = usersQuery.limit(limit);

  const users = await usersQuery;

  logOhs(verbose, `Trabajadores activos encontrados: ${users.length}`);

  const results = {
    dryRun,
    total: users.length,
    created: [],
    updated: [],
    linkedAndUpdated: [],
    errors: [],
  };

  for (const user of users) {
    try {
      const dni = normalizeDniOhs(user.dni);
      let codTrabajador = user.userIdOhs || null;

      logOhs(
        verbose,
        `Trabajador: ${user.firstName || ""} ${user.lastName || ""} - ${dni}`
      );

      if (!codTrabajador) {
        const found = await getOhsTrabajadorByDni(dni);
        const items = getOhsTrabajadoresItems(found);

        if (items.length > 1) {
          logOhs(verbose, `ERROR trabajador duplicado en OHS: ${dni}`);

          results.errors.push({
            userId: String(user._id),
            dni,
            message: `Hay más de un trabajador en OHS con el DNI ${dni}`,
            data: items,
          });
          continue;
        }

        if (items.length === 1) codTrabajador = items[0].codTrabajador;
      }

      if (dryRun) {
        const action = codTrabajador
          ? user.userIdOhs
            ? "updated"
            : "linkedAndUpdated"
          : "created";

        logOhs(verbose, `Trabajador se ${action}: ${dni}`);

        results[action].push({
          userId: String(user._id),
          dni,
          codTrabajador: codTrabajador ? String(codTrabajador) : null,
          dryRun: true,
        });

        continue;
      }

      const result = await ensureOhsTrabajadorForUser(user._id);
      const list = result.action === "updated" && !user.userIdOhs
        ? "linkedAndUpdated"
        : result.action;

      logOhs(verbose, `Trabajador ${result.action}: ${dni} -> ${result.codTrabajador}`);

      results[list].push({
        userId: String(user._id),
        dni,
        codTrabajador: result.codTrabajador,
        data: result.data,
      });
    } catch (error) {
      logOhs(verbose, `ERROR trabajador: ${user.dni}`, error.message);

     results.errors.push({
  userId: String(user._id),
  dni: user.dni,
  name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
  message: error.message,
  statusCode: error.statusCode,
  body: error.body,
  url: error.url,
  payload: error.payload || null,
  data: error.data || null,
});
    }
  }

  return results;
};

/* ==========================================================================
   Relación real trabajador-centro desde Sesame
========================================================================== */

/**
 * Obtiene las asignaciones reales de oficinas de un empleado en Sesame.
 */
const getSesameOfficeAssignationsForUser = async (user) => {
  if (!user?.userIdSesame) return [];

  const data = await sesameService.getEmployeeOfficeAssignations({
    employeeId: String(user.userIdSesame),
    limit: 200,
    page: 1,
  });

  return data?.data || [];
};

/**
 * Obtiene empleados asignados a una oficina real de Sesame.
 */
const getSesameOfficeEmployeesForOhs = async ({ officeIdSesame, limit = 500, page = 1 }) => {
  const data = await sesameService.listOfficeEmployees({
    officeId: officeIdSesame,
    limit,
    page,
  });

  return (data?.data || [])
    .map((item) => {
      const employee = item?.employee || item;
      if (!employee?.id) return null;

      return {
        employeeIdSesame: String(employee.id),
        fullName: [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim(),
        email: employee.email || "",
      };
    })
    .filter(Boolean);
};

/**
 * Resuelve el centro OHS real de un usuario desde su oficina principal en Sesame.
 */
const resolveRealOhsCentroFromSesameUser = async (user) => {
  const assignations = await getSesameOfficeAssignationsForUser(user);

  if (!assignations.length) {
    return {
      workplace: null,
      codCentro: null,
      reason: "El usuario no tiene oficinas asignadas en Sesame",
    };
  }

  const mainAssignation =
    assignations.find((item) => item?.isMainOffice) ||
    (assignations.length === 1 ? assignations[0] : null);

  if (!mainAssignation) {
    return {
      workplace: null,
      codCentro: null,
      reason: "El usuario tiene varias oficinas en Sesame y ninguna marcada como principal",
    };
  }

  const officeIdSesame = mainAssignation?.office?.id || mainAssignation?.officeId || null;

  if (!officeIdSesame) {
    return {
      workplace: null,
      codCentro: null,
      reason: "La asignación de Sesame no tiene officeId",
    };
  }

  const workplace = await Workplace.findOne({
    active: true,
    officeIdSesame: String(officeIdSesame),
  })
    .select("_id name officeIdSesame codCentroOhs active")
    .lean();

  if (!workplace) {
    return {
      workplace: null,
      codCentro: null,
      officeIdSesame,
      reason: "No existe Workplace local vinculado a esa oficina Sesame",
    };
  }

  if (!isValidOhsCode(workplace.codCentroOhs)) {
    return {
      workplace,
      codCentro: null,
      officeIdSesame,
      reason: "El Workplace no tiene codCentroOhs válido",
    };
  }

  return {
    workplace,
    codCentro: Number(workplace.codCentroOhs),
    officeIdSesame,
    reason: null,
  };
};

/**
 * Sincroniza el centro real de un trabajador en OHS desde Sesame.
 */
const syncOhsTrabajadorRealFromSesameUser = async (userId, { dryRun = false } = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  let user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (user.employmentStatus !== "activo") {
    return {
      action: "skip-status",
      userId: String(user._id),
      status: user.employmentStatus,
      reason: "Solo se sincroniza centro real en OHS para trabajadores activos",
    };
  }

  if (!dryRun && !user.userIdOhs) {
    await ensureOhsTrabajadorForUser(user._id);
    user = await User.findById(user._id);
  }

  if (!user.userIdOhs) {
    return {
      action: "skip-without-userIdOhs",
      userId: String(user._id),
      reason: "Usuario sin userIdOhs",
    };
  }

  const resolved = await resolveRealOhsCentroFromSesameUser(user);

  if (!resolved.codCentro) {
    return {
      action: "skip-without-real-center",
      userId: String(user._id),
      userIdOhs: String(user.userIdOhs),
      reason: resolved.reason,
      officeIdSesame: resolved.officeIdSesame || null,
      workplace: resolved.workplace || null,
    };
  }

  const payload = buildOhsTrabajadorFromUser(user, {
    codCentro: resolved.codCentro,
  });

  if (dryRun) {
    return {
      action: "would-update-real-center",
      userId: String(user._id),
      userIdOhs: String(user.userIdOhs),
      codCentro: String(resolved.codCentro),
      workplaceId: String(resolved.workplace._id),
      workplaceName: resolved.workplace.name || "",
      payload,
    };
  }

  const updated = await updateOhsTrabajador(user.userIdOhs, payload);

  return {
    action: "updated-real-center",
    userId: String(user._id),
    userIdOhs: String(user.userIdOhs),
    codCentro: String(resolved.codCentro),
    workplaceId: String(resolved.workplace._id),
    workplaceName: resolved.workplace.name || "",
    payload,
    data: updated,
  };
};

/**
 * Sincroniza todos los centros reales de trabajadores desde las oficinas Sesame.
 */
const syncActiveUsersOhsCentersFromSesameLocal = async ({ dryRun = true, limit = 0 } = {}) => {
  let workplacesQuery = Workplace.find({
    active: true,
    officeIdSesame: { $exists: true, $nin: [null, ""] },
    codCentroOhs: { $exists: true, $nin: [null, "", "-1", -1] },
  })
    .select("_id name active officeIdSesame codCentroOhs")
    .sort({ name: 1 });

  if (limit > 0) workplacesQuery = workplacesQuery.limit(limit);

  const workplaces = await workplacesQuery.lean();

  const results = {
    dryRun,
    totalWorkplaces: workplaces.length,
    updated: [],
    skipped: [],
    errors: [],
  };

  for (const workplace of workplaces) {
    try {
      const codCentro = Number(workplace.codCentroOhs);

      if (!isValidOhsCode(codCentro)) {
        results.skipped.push({
          workplaceId: String(workplace._id),
          workplaceName: workplace.name || "",
          reason: "codCentroOhs no válido",
        });
        continue;
      }

      const sesameEmployees = await getSesameOfficeEmployeesForOhs({
        officeIdSesame: workplace.officeIdSesame,
      });

      if (!sesameEmployees.length) {
        results.skipped.push({
          workplaceId: String(workplace._id),
          workplaceName: workplace.name || "",
          officeIdSesame: workplace.officeIdSesame,
          codCentro: String(codCentro),
          reason: "La oficina Sesame no tiene empleados asignados",
        });
        continue;
      }

      const users = await User.find({
        userIdSesame: {
          $in: sesameEmployees.map((employee) => employee.employeeIdSesame),
        },
      })
        .select("_id firstName lastName dni birthday email gender userIdSesame userIdOhs employmentStatus")
        .lean();

      const usersBySesameId = {};
      users.forEach((user) => {
        usersBySesameId[String(user.userIdSesame)] = user;
      });

      for (const sesameEmployee of sesameEmployees) {
        const user = usersBySesameId[String(sesameEmployee.employeeIdSesame)] || null;

        if (!user) {
          results.skipped.push({
            workplaceId: String(workplace._id),
            workplaceName: workplace.name || "",
            employeeIdSesame: sesameEmployee.employeeIdSesame,
            employeeName: sesameEmployee.fullName,
            employeeEmail: sesameEmployee.email,
            reason: "Empleado de Sesame no encontrado en Mongo por userIdSesame",
          });
          continue;
        }

        if (!user.userIdOhs) {
          results.skipped.push({
            workplaceId: String(workplace._id),
            workplaceName: workplace.name || "",
            userId: String(user._id),
            userIdSesame: user.userIdSesame,
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            dni: user.dni || "",
            reason: "Usuario local sin userIdOhs",
          });
          continue;
        }

        const payload = buildOhsTrabajadorFromUser(user, { codCentro });

        if (!dryRun) {
          const updated = await updateOhsTrabajador(user.userIdOhs, payload);

          results.updated.push({
            workplaceId: String(workplace._id),
            workplaceName: workplace.name || "",
            codCentro: String(codCentro),
            userId: String(user._id),
            userIdOhs: String(user.userIdOhs),
            dni: user.dni || "",
            data: updated,
          });
        } else {
          results.updated.push({
            workplaceId: String(workplace._id),
            workplaceName: workplace.name || "",
            codCentro: String(codCentro),
            userId: String(user._id),
            userIdOhs: String(user.userIdOhs),
            dni: user.dni || "",
            dryRun: true,
          });
        }
      }
    } catch (error) {
      results.errors.push({
        workplaceId: String(workplace._id),
        workplaceName: workplace.name || "",
        officeIdSesame: workplace.officeIdSesame || null,
        codCentroOhs: workplace.codCentroOhs || null,
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  return results;
};

/* ==========================================================================
   Relación real trabajador-puesto desde Periods + Jobs
========================================================================== */

/**
 * Obtiene el periodo activo actual del trabajador.
 */
const getActivePeriodForUser = async (userId) => {
  return Periods.findOne({
    idUser: userId,
    active: true,
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  })
    .sort({ startDate: -1 })
    .lean();
};

/**
 * Resuelve el puesto real OHS del trabajador desde Periods + Jobs.
 */
const resolveOhsPuestoRealFromUser = async (userId) => {
  const period = await getActivePeriodForUser(userId);

  if (!period) {
    return {
      codTipoPuesto: null,
      reason: "El trabajador no tiene periodo activo",
    };
  }

  const puesto = await getJobSubcategoryById(period.position);

  if (!puesto) {
    return {
      codTipoPuesto: null,
      periodId: String(period._id),
      position: String(period.position),
      reason: "La posición del periodo activo no corresponde a ninguna subcategoría de Jobs",
    };
  }

  if (!isValidOhsCode(puesto.codTipoPuestoOhs)) {
    return {
      codTipoPuesto: null,
      periodId: String(period._id),
      puesto,
      reason: "La subcategoría del puesto no tiene codTipoPuestoOhs",
    };
  }

  return {
    codTipoPuesto: Number(puesto.codTipoPuestoOhs),
    periodId: String(period._id),
    puesto,
    reason: null,
  };
};

/**
 * Sincroniza en OHS el puesto real del trabajador desde su periodo activo.
 */
const syncOhsTrabajadorPuestoReal = async (userId, { dryRun = false } = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  let user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (!dryRun && !user.userIdOhs) {
    await ensureOhsTrabajadorForUser(user._id);
    user = await User.findById(userId);
  }

  if (!user.userIdOhs) {
    return {
      action: "skip-without-userIdOhs",
      userId: String(user._id),
      reason: "Usuario sin userIdOhs",
    };
  }

  const resolved = await resolveOhsPuestoRealFromUser(user._id);

  if (!resolved.codTipoPuesto) {
    return {
      action: "skip-without-puesto",
      userId: String(user._id),
      userIdOhs: String(user.userIdOhs),
      reason: resolved.reason,
      periodId: resolved.periodId || null,
      puesto: resolved.puesto || null,
    };
  }

  const puestosTrabajador = buildOhsPuestosTrabajador(resolved.codTipoPuesto);
  const payload = buildOhsTrabajadorFromUser(user, { puestosTrabajador });

  if (dryRun) {
    return {
      action: "would-update-puesto-real",
      userId: String(user._id),
      userIdOhs: String(user.userIdOhs),
      periodId: resolved.periodId,
      puesto: resolved.puesto,
      puestosTrabajador,
      payload,
    };
  }

  const updated = await updateOhsTrabajador(user.userIdOhs, payload);

  return {
    action: "updated-puesto-real",
    userId: String(user._id),
    userIdOhs: String(user.userIdOhs),
    periodId: resolved.periodId,
    puesto: resolved.puesto,
    puestosTrabajador,
    payload,
    data: updated,
  };
};

/**
 * Sincroniza en OHS el puesto real de todos los trabajadores activos.
 */
const syncActiveUsersOhsPuestosFromPeriodsLocal = async ({ dryRun = true, limit = 0 } = {}) => {
  let usersQuery = User.find({
    employmentStatus: "activo",
    userIdOhs: { $exists: true, $nin: [null, ""] },
  })
    .select("_id firstName lastName dni email userIdOhs employmentStatus")
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) usersQuery = usersQuery.limit(limit);

  const users = await usersQuery;

  const results = {
    dryRun,
    total: users.length,
    updated: [],
    skipped: [],
    errors: [],
  };

  for (const user of users) {
    try {
      const result = await syncOhsTrabajadorPuestoReal(user._id, { dryRun });

      if (result.action.startsWith("skip")) {
        results.skipped.push(result);
        continue;
      }

      results.updated.push(result);
    } catch (error) {
      results.errors.push({
        userId: String(user._id),
        userIdOhs: user.userIdOhs || null,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        dni: user.dni || "",
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  return results;
};

/* ==========================================================================
   Sincronizaciones compuestas
========================================================================== */

/**
 * Sincroniza completamente un trabajador: datos básicos, centro real y puesto real.
 */
const syncOhsTrabajadorFull = async (userId, { dryRun = false } = {}) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const trabajador = dryRun
    ? { action: "dry-run-skip-basic-worker-sync" }
    : await ensureOhsTrabajadorForUser(userId);

  const centro = await syncOhsTrabajadorRealFromSesameUser(userId, { dryRun });
  const puesto = await syncOhsTrabajadorPuestoReal(userId, { dryRun });

  return {
    dryRun,
    trabajador,
    centro,
    puesto,
  };
};

/**
 * Muestra logs solo cuando verbose está activo.
 */
const logOhs = (verbose, message, data = null) => {
  if (!verbose) return;

  const time = new Date().toLocaleTimeString("es-ES");

  if (data !== null) {
    console.log(`[OHS ${time}] ${message}`, data);
    return;
  }

  console.log(`[OHS ${time}] ${message}`);
};

/**
 * Sincroniza centros, puestos, trabajadores, centros reales y puestos reales.
 */
/**
 * Sincroniza centros, puestos, trabajadores, centros reales y puestos reales.
 */
const syncOhsAllLocal = async ({
  dryRun = true,
  limitCentros = 0,
  limitUsers = 0,
  verbose = false,
} = {}) => {
  logOhs(verbose, "INICIO sync total", { dryRun, limitCentros, limitUsers });

  logOhs(verbose, "1/5 Sincronizando centros...");
  const centros = await syncActiveWorkplacesWithOhsLocal({
    dryRun,
    limit: limitCentros,
    verbose,
  });
  logOhs(verbose, "1/5 Centros finalizados", {
    total: centros.total,
    created: centros.created?.length || 0,
    updated: centros.updated?.length || 0,
    linkedAndUpdated: centros.linkedAndUpdated?.length || 0,
    errors: centros.errors?.length || 0,
  });

  logOhs(verbose, "2/5 Sincronizando puestos desde Jobs.subcategories...");
  const puestos = await syncOhsPuestosFromJobsLocal({
    dryRun,
    verbose,
  });
  logOhs(verbose, "2/5 Puestos finalizados", {
    total: puestos.total,
    created: puestos.created?.length || 0,
    updated: puestos.updated?.length || 0,
    linkedAndUpdated: puestos.linkedAndUpdated?.length || 0,
    skipped: puestos.skipped?.length || 0,
    errors: puestos.errors?.length || 0,
  });

  logOhs(verbose, "3/5 Sincronizando trabajadores básicos...");
  const trabajadores = await syncActiveUsersWithOhsLocal({
    dryRun,
    limit: limitUsers,
    verbose,
  });
  logOhs(verbose, "3/5 Trabajadores finalizados", {
    total: trabajadores.total,
    created: trabajadores.created?.length || 0,
    updated: trabajadores.updated?.length || 0,
    linkedAndUpdated: trabajadores.linkedAndUpdated?.length || 0,
    errors: trabajadores.errors?.length || 0,
  });

  logOhs(verbose, "4/5 Sincronizando centros reales trabajador desde Sesame...");
  const trabajadoresCentros = await syncActiveUsersOhsCentersFromSesameLocal({
    dryRun,
    limit: limitCentros,
    verbose,
  });
  logOhs(verbose, "4/5 Centros reales trabajador finalizados", {
    totalWorkplaces: trabajadoresCentros.totalWorkplaces,
    updated: trabajadoresCentros.updated?.length || 0,
    skipped: trabajadoresCentros.skipped?.length || 0,
    errors: trabajadoresCentros.errors?.length || 0,
  });

  logOhs(verbose, "5/5 Sincronizando puestos reales trabajador desde Periods + Jobs...");
  const trabajadoresPuestos = await syncActiveUsersOhsPuestosFromPeriodsLocal({
    dryRun,
    limit: limitUsers,
    verbose,
  });
  logOhs(verbose, "5/5 Puestos reales trabajador finalizados", {
    total: trabajadoresPuestos.total,
    updated: trabajadoresPuestos.updated?.length || 0,
    skipped: trabajadoresPuestos.skipped?.length || 0,
    errors: trabajadoresPuestos.errors?.length || 0,
  });

  logOhs(verbose, "FIN sync total");

  return {
    dryRun,
    centros,
    puestos,
    trabajadores,
    trabajadoresCentros,
    trabajadoresPuestos,
  };
};

/* ==========================================================================
   Endpoints: centros
========================================================================== */

/**
 * Consulta centros en OHS.
 */
const postOhsGetCentros = async (req, res) => {
  const { codCentro, nomCentro, params = {} } = req.body || {};
  const finalParams = { ...params };

  if (codCentro !== undefined && codCentro !== "") finalParams.codCentro = Number(codCentro);
  if (nomCentro !== undefined) finalParams.nomCentro = String(nomCentro).trim();

  response(res, 200, await getOhsCentros(finalParams));
};

/**
 * Sincroniza un centro desde un Workplace.
 */
const postOhsSyncCentroFromWorkplace = async (req, res) => {
  const { workplaceId, payload = {} } = req.body || {};
  response(res, 200, await syncOhsCentroForWorkplace(workplaceId, payload));
};

/**
 * Sincroniza todos los centros activos.
 */
const postOhsSyncAllCentros = async (req, res) => {
  const { dryRun = true, limit = 0 } = req.body || {};
  response(res, 200, await syncActiveWorkplacesWithOhsLocal({ dryRun, limit: Number(limit) }));
};

/* ==========================================================================
   Endpoints: puestos
========================================================================== */

/**
 * Consulta puestos en OHS.
 */
const postOhsGetPuestos = async (req, res) => {
  const { codTipoPuesto, nomTipoPuesto, params = {} } = req.body || {};
  const finalParams = { ...params };

  if (codTipoPuesto !== undefined && codTipoPuesto !== "") {
    finalParams.codTipoPuesto = Number(codTipoPuesto);
  }

  if (nomTipoPuesto !== undefined) {
    finalParams.nomTipoPuesto = String(nomTipoPuesto).trim();
  }

  response(res, 200, await getOhsPuestos(finalParams));
};

/**
 * Sincroniza todos los puestos desde Jobs.subcategories.
 */
const postOhsSyncAllPuestosFromJobs = async (req, res) => {
  const { dryRun = true } = req.body || {};
  response(res, 200, await syncOhsPuestosFromJobsLocal({ dryRun }));
};

/* ==========================================================================
   Endpoints: trabajadores
========================================================================== */

/**
 * Consulta trabajadores en OHS por parámetros directos o por usuario local.
 */
const postOhsGetTrabajadores = async (req, res) => {
  const {
    userId,
    dni,
    firstName,
    lastName,
    codTrabajador,
    params = {},
  } = req.body || {};

  const finalParams = { ...params };

  if (userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw new ClientError("Usuario no encontrado", 404);

    if (user.firstName) finalParams.nomTrabajador = user.firstName;

    if (user.lastName) {
      const names = splitLastName(user.lastName);
      finalParams.apellido1Trabajador = names.apellido1Trabajador;
      finalParams.apellido2Trabajador = names.apellido2Trabajador;
    }

    if (user.dni) finalParams.codIdentificador = normalizeDniOhs(user.dni);
  }

  if (dni) finalParams.codIdentificador = normalizeDniOhs(dni);
  if (firstName) finalParams.nomTrabajador = String(firstName).trim();

  if (lastName) {
    const names = splitLastName(lastName);
    finalParams.apellido1Trabajador = names.apellido1Trabajador;
    finalParams.apellido2Trabajador = names.apellido2Trabajador;
  }

  if (codTrabajador) finalParams.codTrabajador = Number(codTrabajador);

  response(res, 200, await getOhsTrabajadores(finalParams));
};

/**
 * Consulta un trabajador en OHS por DNI.
 */
const postOhsGetTrabajadorByDni = async (req, res) => {
  const { dni } = req.body || {};
  if (!dni) throw new ClientError("Falta DNI/NIE", 400);

  response(res, 200, await getOhsTrabajadorByDni(normalizeDniOhs(dni)));
};

/**
 * Sincroniza un trabajador básico desde User.
 */
const postOhsSyncTrabajadorFromUser = async (req, res) => {
  const { userId, payload = {} } = req.body || {};
  response(res, 200, await ensureOhsTrabajadorForUser(userId, payload));
};

/**
 * Sincroniza el centro real del trabajador desde Sesame.
 */
const postOhsSyncTrabajadorRealFromSesameUser = async (req, res) => {
  const { userId, dryRun = false } = req.body || {};
  response(res, 200, await syncOhsTrabajadorRealFromSesameUser(userId, { dryRun }));
};

/**
 * Sincroniza el puesto real del trabajador desde Periods + Jobs.
 */
const postOhsSyncTrabajadorPuestoReal = async (req, res) => {
  const { userId, dryRun = false } = req.body || {};
  response(res, 200, await syncOhsTrabajadorPuestoReal(userId, { dryRun }));
};

/**
 * Sincroniza completamente un trabajador.
 */
const postOhsSyncTrabajadorFull = async (req, res) => {
  const { userId, dryRun = false } = req.body || {};
  response(res, 200, await syncOhsTrabajadorFull(userId, { dryRun }));
};

/**
 * Sincroniza todos los trabajadores activos.
 */
const postOhsSyncAllTrabajadores = async (req, res) => {
  const { dryRun = true, limit = 0 } = req.body || {};
  response(res, 200, await syncActiveUsersWithOhsLocal({ dryRun, limit: Number(limit) }));
};

/**
 * Sincroniza todos los centros reales de trabajadores.
 */
const postOhsSyncAllTrabajadoresCentros = async (req, res) => {
  const { dryRun = true, limit = 0 } = req.body || {};
  response(res, 200, await syncActiveUsersOhsCentersFromSesameLocal({ dryRun, limit: Number(limit) }));
};

/**
 * Sincroniza todos los puestos reales de trabajadores.
 */
const postOhsSyncAllTrabajadoresPuestos = async (req, res) => {
  const { dryRun = true, limit = 0 } = req.body || {};
  response(res, 200, await syncActiveUsersOhsPuestosFromPeriodsLocal({ dryRun, limit: Number(limit) }));
};

/**
 * Sincroniza todo el bloque OHS.
 */
const postOhsSyncAll = async (req, res) => {
  const { dryRun = true, limitCentros = 0, limitUsers = 0 } = req.body || {};

  response(res, 200, await syncOhsAllLocal({
    dryRun,
    limitCentros: Number(limitCentros),
    limitUsers: Number(limitUsers),
  }));
};


/**
 * Da de baja un trabajador en OHS usando el endpoint DELETE.
 * En OHS no se interpreta como borrado físico, sino como baja/inactivación.
 */
const bajaOhsTrabajadorForUser = async (userId) => {
  if (!userId) throw new ClientError("Falta userId", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  if (!isValidOhsCode(user.userIdOhs)) {
    return {
      action: "skip-without-userIdOhs",
      userId: String(user._id),
      reason: "El usuario no tiene userIdOhs válido",
    };
  }

  const deleted = await deleteOhsTrabajador(user.userIdOhs);

  return {
    action: "baja-ohs-trabajador",
    userId: String(user._id),
    codTrabajador: String(user.userIdOhs),
    data: deleted,
  };
};

/**
 * Da de baja un centro en OHS usando el endpoint DELETE.
 * En OHS no se interpreta como borrado físico, sino como baja/inactivación.
 */
const bajaOhsCentroForWorkplace = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId);
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  if (!isValidOhsCode(workplace.codCentroOhs)) {
    return {
      action: "skip-without-codCentroOhs",
      workplaceId: String(workplace._id),
      reason: "El centro no tiene codCentroOhs válido",
    };
  }

  const deleted = await deleteOhsCentro(workplace.codCentroOhs);

  return {
    action: "baja-ohs-centro",
    workplaceId: String(workplace._id),
    codCentro: String(workplace.codCentroOhs),
    data: deleted,
  };
};

//BORRAR
/**
 * Vacía OHS de pruebas y limpia los códigos OHS locales.
 * Uso exclusivo para preparar una sincronización completa desde cero.
 */
/**
 * Vacía OHS de pruebas y limpia los códigos OHS locales.
 * Uso exclusivo para preparar una sincronización completa desde cero.
 */
/**
 * Vacía OHS de pruebas y limpia los códigos OHS locales.
 * Uso exclusivo para preparar una sincronización completa desde cero.
 */

const hasItems = (items) => Array.isArray(items) && items.length > 0;

const compactOhsResult = (result = {}) => {
  const output = {};

  if (hasItems(result.errors)) output.errors = result.errors;
  if (hasItems(result.skipped)) output.skipped = result.skipped;

  return output;
};

const buildOnlyOhsIssuesReport = ({ wipe, sync }) => {
  return {
    wipe: {
      trabajadores: compactOhsResult(wipe?.trabajadores),
      puestos: compactOhsResult(wipe?.puestos),
      centros: compactOhsResult(wipe?.centros),
    },
    sync: {
      centros: compactOhsResult(sync?.centros),
      puestos: compactOhsResult(sync?.puestos),
      trabajadores: compactOhsResult(sync?.trabajadores),
      trabajadoresCentros: compactOhsResult(sync?.trabajadoresCentros),
      trabajadoresPuestos: compactOhsResult(sync?.trabajadoresPuestos),
    },
  };
};

const removeEmptyObjects = (value) => {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    const clean = {};

    Object.entries(value).forEach(([key, item]) => {
      const cleanedItem = removeEmptyObjects(item);

      const isEmptyObject =
        cleanedItem &&
        typeof cleanedItem === "object" &&
        !Array.isArray(cleanedItem) &&
        Object.keys(cleanedItem).length === 0;

      if (!isEmptyObject) clean[key] = cleanedItem;
    });

    return clean;
  }

  return value;
};
const wipeOhsTestDataLocal = async ({
  dryRun = true,
  confirm = false,
  cleanLocal = true,
  verbose = false,
} = {}) => {
  if (process.env.NODE_ENV === "production") {
    throw new ClientError("Esta función no puede ejecutarse en producción", 403);
  }

  if (!confirm) {
    throw new ClientError("Debes enviar confirm: true para ejecutar esta limpieza", 400);
  }

  logOhs(verbose, "INICIO wipe OHS", { dryRun, cleanLocal });

  const results = {
    dryRun,
    cleanLocal,
    trabajadores: {
      total: 0,
      deleted: [],
      errors: [],
    },
    puestos: {
      total: 0,
      deleted: [],
      errors: [],
    },
    centros: {
      total: 0,
      deleted: [],
      errors: [],
    },
    local: {
      skipped: dryRun || !cleanLocal,
      users: null,
      workplaces: null,
      jobs: null,
    },
  };

  logOhs(verbose, "Consultando trabajadores OHS...");
  const trabajadoresData = await getOhsTrabajadores();
  const trabajadores = getOhsTrabajadoresItems(trabajadoresData);

  results.trabajadores.total = trabajadores.length;

  logOhs(verbose, `Trabajadores OHS encontrados para borrar: ${trabajadores.length}`);

  for (const trabajador of trabajadores) {
    const codTrabajador = trabajador.codTrabajador;

    if (!isValidOhsCode(codTrabajador)) continue;

    try {
      if (!dryRun) {
        await deleteOhsTrabajador(codTrabajador);
      }

      logOhs(
        verbose,
        `Trabajador borrado OHS: ${codTrabajador} - ${trabajador.codIdentificador || ""}`
      );

      results.trabajadores.deleted.push({
        codTrabajador: String(codTrabajador),
        dni: trabajador.codIdentificador || "",
        name: [
          trabajador.nomTrabajador,
          trabajador.apellido1Trabajador,
          trabajador.apellido2Trabajador,
        ].filter(Boolean).join(" "),
        dryRun,
      });
    } catch (error) {
      logOhs(verbose, `ERROR borrando trabajador OHS: ${codTrabajador}`, error.message);

      results.trabajadores.errors.push({
        codTrabajador: String(codTrabajador),
        dni: trabajador.codIdentificador || "",
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  logOhs(verbose, "Consultando puestos OHS...");
  const puestosData = await getOhsPuestos();
  const puestos = getOhsPuestosItems(puestosData);

  results.puestos.total = puestos.length;

  logOhs(verbose, `Puestos OHS encontrados para borrar: ${puestos.length}`);

  for (const puesto of puestos) {
    const codTipoPuesto = puesto.codTipoPuesto;

    if (!isValidOhsCode(codTipoPuesto)) continue;

    try {
      if (!dryRun) {
        await deleteOhsPuesto(codTipoPuesto);
      }

      logOhs(verbose, `Puesto borrado OHS: ${codTipoPuesto} - ${puesto.nomTipoPuesto || ""}`);

      results.puestos.deleted.push({
        codTipoPuesto: String(codTipoPuesto),
        name: puesto.nomTipoPuesto || "",
        dryRun,
      });
    } catch (error) {
      logOhs(verbose, `ERROR borrando puesto OHS: ${codTipoPuesto}`, error.message);

      results.puestos.errors.push({
        codTipoPuesto: String(codTipoPuesto),
        name: puesto.nomTipoPuesto || "",
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  logOhs(verbose, "Consultando centros OHS...");
  const centrosData = await getOhsCentros();
  const centros = getOhsCentrosItems(centrosData);

  results.centros.total = centros.length;

  logOhs(verbose, `Centros OHS encontrados para borrar: ${centros.length}`);

  for (const centro of centros) {
    const codCentro = centro.codCentro;

    if (!isValidOhsCode(codCentro)) continue;

    try {
      if (!dryRun) {
        await deleteOhsCentro(codCentro);
      }

      logOhs(verbose, `Centro borrado OHS: ${codCentro} - ${centro.nomCentro || ""}`);

      results.centros.deleted.push({
        codCentro: String(codCentro),
        name: centro.nomCentro || "",
        dryRun,
      });
    } catch (error) {
      logOhs(verbose, `ERROR borrando centro OHS: ${codCentro}`, error.message);

      results.centros.errors.push({
        codCentro: String(codCentro),
        name: centro.nomCentro || "",
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
      });
    }
  }

  if (!dryRun && cleanLocal) {
    logOhs(verbose, "Limpiando códigos OHS locales en Mongo...");

    const users = await User.updateMany(
      { userIdOhs: { $exists: true, $nin: [null, ""] } },
      { $set: { userIdOhs: null } }
    );

    const workplaces = await Workplace.updateMany(
      { codCentroOhs: { $exists: true, $nin: [null, ""] } },
      { $set: { codCentroOhs: null } }
    );

    const jobs = await Jobs.updateMany(
      { "subcategories.codTipoPuestoOhs": { $exists: true, $nin: [null, ""] } },
      { $set: { "subcategories.$[].codTipoPuestoOhs": null } }
    );

    logOhs(verbose, "Códigos locales limpiados", {
      users: users.modifiedCount,
      workplaces: workplaces.modifiedCount,
      jobs: jobs.modifiedCount,
    });

    results.local = {
      skipped: false,
      users: users.modifiedCount,
      workplaces: workplaces.modifiedCount,
      jobs: jobs.modifiedCount,
    };
  }

  logOhs(verbose, "FIN wipe OHS", {
    trabajadores: {
      total: results.trabajadores.total,
      deleted: results.trabajadores.deleted.length,
      errors: results.trabajadores.errors.length,
    },
    puestos: {
      total: results.puestos.total,
      deleted: results.puestos.deleted.length,
      errors: results.puestos.errors.length,
    },
    centros: {
      total: results.centros.total,
      deleted: results.centros.deleted.length,
      errors: results.centros.errors.length,
    },
    local: results.local,
  });

  return results;
};

// BORRAR DESPUÉS DE LA PRUEBA
const fs = require("fs");
const path = require("path");
const testWipeAndSyncOhsLocal = async () => {
  const startedAt = Date.now();
  const startedAtIso = new Date().toISOString();

  const report = {
  name: "testWipeAndSyncOhsLocal",
  startedAt: startedAtIso,
  finishedAt: null,
  durationSeconds: null,
  status: "running",
  summary: {
    wipe: null,
    sync: null,
  },
  issues: {
    wipe: null,
    sync: null,
  },
  errors: {
    fatal: null,
  },
};

  const logsDir = path.join(process.cwd(), "ohs-logs");

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const fileName = `ohs-sync-report-${startedAtIso.replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(logsDir, fileName);

  const saveReport = () => {
    report.finishedAt = new Date().toISOString();
    report.durationSeconds = Math.round((Date.now() - startedAt) / 1000);

    fs.writeFileSync(
      filePath,
      JSON.stringify(report, null, 2),
      "utf8"
    );

    console.log("");
    console.log("====================================================");
    console.log("REPORTE JSON GUARDADO");
    console.log("====================================================");
    console.log(filePath);
    console.log("");
  };

  try {
    console.log("");
    console.log("====================================================");
    console.log("INICIO PRUEBA OHS: BORRAR TODO + SINCRONIZAR TODO");
    console.log("====================================================");
    console.log("");

    console.log("====================================================");
    console.log("1/2 BORRANDO OHS DE PRUEBAS");
    console.log("====================================================");

    const wipe = await wipeOhsTestDataLocal({
      dryRun: false,
      confirm: true,
      cleanLocal: true,
      verbose: true,
    });

  

    report.summary.wipe = {
      trabajadores: {
        total: wipe.trabajadores.total,
        deleted: wipe.trabajadores.deleted.length,
        errors: wipe.trabajadores.errors.length,
      },
      puestos: {
        total: wipe.puestos.total,
        deleted: wipe.puestos.deleted.length,
        errors: wipe.puestos.errors.length,
      },
      centros: {
        total: wipe.centros.total,
        deleted: wipe.centros.deleted.length,
        errors: wipe.centros.errors.length,
      },
      local: wipe.local,
    };

    console.log("");
    console.log("RESUMEN BORRADO OHS:");
    console.dir(report.summary.wipe, { depth: null });

    if (
      wipe.trabajadores.errors.length ||
      wipe.puestos.errors.length ||
      wipe.centros.errors.length
    ) {
      console.log("");
      console.log("ERRORES EN BORRADO OHS:");
      console.dir(
        {
          trabajadores: wipe.trabajadores.errors.slice(0, 20),
          puestos: wipe.puestos.errors.slice(0, 20),
          centros: wipe.centros.errors.slice(0, 20),
        },
        { depth: null }
      );
    }

    console.log("");
    console.log("====================================================");
    console.log("2/2 SINCRONIZANDO TODO OHS");
    console.log("====================================================");

    const sync = await syncOhsAllLocal({
      dryRun: false,
      limitCentros: 0,
      limitUsers: 0,
      verbose: true,
    });

   

    report.summary.sync = {
      centros: {
        total: sync.centros.total,
        created: sync.centros.created.length,
        updated: sync.centros.updated.length,
        linkedAndUpdated: sync.centros.linkedAndUpdated.length,
        errors: sync.centros.errors.length,
      },
      puestos: {
        total: sync.puestos.total,
        created: sync.puestos.created.length,
        updated: sync.puestos.updated.length,
        linkedAndUpdated: sync.puestos.linkedAndUpdated.length,
        skipped: sync.puestos.skipped.length,
        errors: sync.puestos.errors.length,
      },
      trabajadores: {
        total: sync.trabajadores.total,
        created: sync.trabajadores.created.length,
        updated: sync.trabajadores.updated.length,
        linkedAndUpdated: sync.trabajadores.linkedAndUpdated.length,
        errors: sync.trabajadores.errors.length,
      },
      trabajadoresCentros: {
        totalWorkplaces: sync.trabajadoresCentros.totalWorkplaces,
        updated: sync.trabajadoresCentros.updated.length,
        skipped: sync.trabajadoresCentros.skipped.length,
        errors: sync.trabajadoresCentros.errors.length,
      },
      trabajadoresPuestos: {
        total: sync.trabajadoresPuestos.total,
        updated: sync.trabajadoresPuestos.updated.length,
        skipped: sync.trabajadoresPuestos.skipped.length,
        errors: sync.trabajadoresPuestos.errors.length,
      },
    };

    const issues = removeEmptyObjects(buildOnlyOhsIssuesReport({ wipe, sync }));

report.issues = {
  wipe: issues.wipe || null,
  sync: issues.sync || null,
};

    console.log("");
    console.log("RESUMEN SINCRONIZACIÓN OHS:");
    console.dir(report.summary.sync, { depth: null });

    if (
      sync.centros.errors.length ||
      sync.puestos.errors.length ||
      sync.trabajadores.errors.length ||
      sync.trabajadoresCentros.errors.length ||
      sync.trabajadoresPuestos.errors.length
    ) {
      console.log("");
      console.log("ERRORES EN SINCRONIZACIÓN OHS:");
      console.dir(
        {
          centros: sync.centros.errors.slice(0, 20),
          puestos: sync.puestos.errors.slice(0, 20),
          trabajadores: sync.trabajadores.errors.slice(0, 20),
          trabajadoresCentros: sync.trabajadoresCentros.errors.slice(0, 20),
          trabajadoresPuestos: sync.trabajadoresPuestos.errors.slice(0, 20),
        },
        { depth: null }
      );
    }

    report.status = "finished";

    console.log("");
    console.log("====================================================");
    console.log(`FIN PRUEBA OHS. Duración: ${Math.round((Date.now() - startedAt) / 1000)}s`);
    console.log("====================================================");
    console.log("");

    saveReport();

    return {
      wipe,
      sync,
      reportPath: filePath,
    };
  } catch (error) {
    report.status = "failed";

    report.errors.fatal = {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      body: error.body,
      url: error.url,
    };

    console.log("");
    console.log("====================================================");
    console.log("ERROR FATAL EN PRUEBA OHS");
    console.log("====================================================");
    console.dir(report.errors.fatal, { depth: null });

    saveReport();

    throw error;
  }
};

//fin borrar

module.exports = {
  postOhsGetCentros: catchAsync(postOhsGetCentros),
  postOhsSyncCentroFromWorkplace: catchAsync(postOhsSyncCentroFromWorkplace),
  postOhsSyncAllCentros: catchAsync(postOhsSyncAllCentros),

  postOhsGetPuestos: catchAsync(postOhsGetPuestos),
  postOhsSyncAllPuestosFromJobs: catchAsync(postOhsSyncAllPuestosFromJobs),

  postOhsGetTrabajadores: catchAsync(postOhsGetTrabajadores),
  postOhsGetTrabajadorByDni: catchAsync(postOhsGetTrabajadorByDni),
  postOhsSyncTrabajadorFromUser: catchAsync(postOhsSyncTrabajadorFromUser),
  postOhsSyncTrabajadorRealFromSesameUser: catchAsync(postOhsSyncTrabajadorRealFromSesameUser),
  postOhsSyncTrabajadorPuestoReal: catchAsync(postOhsSyncTrabajadorPuestoReal),
  postOhsSyncTrabajadorFull: catchAsync(postOhsSyncTrabajadorFull),

  postOhsSyncAllTrabajadores: catchAsync(postOhsSyncAllTrabajadores),
  postOhsSyncAllTrabajadoresCentros: catchAsync(postOhsSyncAllTrabajadoresCentros),
  postOhsSyncAllTrabajadoresPuestos: catchAsync(postOhsSyncAllTrabajadoresPuestos),
  postOhsSyncAll: catchAsync(postOhsSyncAll),

  bajaOhsTrabajadorForUser,
  bajaOhsCentroForWorkplace,

  ensureOhsTrabajadorForUser,
  syncOhsCentroForWorkplace,
  syncOhsPuesto,
  syncOhsPuestosFromJobsLocal,
  syncOhsTrabajadorRealFromSesameUser,
  syncOhsTrabajadorPuestoReal,
  syncOhsTrabajadorFull,
};