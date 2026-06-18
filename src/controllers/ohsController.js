const { User, Workplace, Jobs, Periods, Dispositive, Leaves } = require("../models/indexModels");

const {
  getOhsCentros,
  createOhsCentro,
  updateOhsCentro,
  deleteOhsCentro,

  getOhsPuestos,
  createOhsPuesto,
  updateOhsPuesto,
  deleteOhsPuesto,

  getOhsTrabajadorByDniIncludingDeleted,
  getOhsTrabajadorByCodIncludingDeleted,
  createOhsTrabajador,
  updateOhsTrabajador,
  deleteOhsTrabajador
} = require("../services/ohsServices");

const sesameService = require("../services/sesameServices");
const { ClientError, catchAsync, response } = require("../utils/indexUtils");

/* ==========================================================================
   Helpers generales
========================================================================== */

const hasActiveLeaveForUser = async (userId) => {
  if (!userId) return false;

  const activeLeave = await Leaves.exists({
    idUser: userId,
    active: { $ne: false },
    $or: [
      { actualEndLeaveDate: { $exists: false } },
      { actualEndLeaveDate: null },
    ],
  });

  return !!activeLeave;
};

const mapGenderToOhs = (gender) => {
  const value = String(gender || "").trim().toLowerCase();

  if (value === "male" || value === "h" || value === "hombre") return "H";
  if (value === "female" || value === "m" || value === "mujer") return "M";

  return "M";
};

const normalizeDniOhs = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

const formatDateOhs = (date) => {
  if (!date) return undefined;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
};

const cleanUndefined = (obj = {}) => {
  const clean = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) clean[key] = value;
  });

  return clean;
};

const splitLastName = (lastName = "") => {
  const parts = String(lastName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return { apellido1Trabajador: "", apellido2Trabajador: "" };
  if (parts.length === 1) return { apellido1Trabajador: parts[0], apellido2Trabajador: "" };

  return {
    apellido1Trabajador: parts[0],
    apellido2Trabajador: parts.slice(1).join(" "),
  };
};

const isValidOhsCode = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
};

const normalizeTextOhs = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

/* ==========================================================================
   Helpers respuestas OHS
========================================================================== */

const getOhsCentrosItems = (data) => data?.listaCentrosCompletos || data?.listaCentros || [];

const getOhsPuestosItems = (data) =>
  data?.listaPuestosCompletos || data?.listaPuestos || data?.listaTiposPuesto || [];

const getOhsTrabajadoresItems = (data) =>
  data?.listaTrabajadorCompletos ||
  data?.listaTrabajadoresCompletos ||
  data?.listaTrabajadores ||
  [];

const getCodCentroFromOhsCentro = (centro) => {
  const value = centro?.codCentro || centro?.CodCentro || null;
  return isValidOhsCode(value) ? Number(value) : null;
};

const getCodCentroFromOhsResponse = (data) => {
  const value =
    data?.codCentro ||
    data?.CodCentro ||
    data?.listaCentros?.[0]?.codCentro ||
    data?.listaCentros?.[0]?.CodCentro ||
    data?.listaCentrosCompletos?.[0]?.codCentro ||
    data?.listaCentrosCompletos?.[0]?.CodCentro ||
    null;

  return isValidOhsCode(value) ? Number(value) : null;
};

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

const getCodTrabajadorFromOhsResponse = (data) => {
  const value =
    data?.codTrabajador ||
    data?.CodTrabajador ||
    data?.listaTrabajadorCompletos?.[0]?.codTrabajador ||
    data?.listaTrabajadorCompletos?.[0]?.CodTrabajador ||
    data?.listaTrabajadoresCompletos?.[0]?.codTrabajador ||
    data?.listaTrabajadoresCompletos?.[0]?.CodTrabajador ||
    data?.listaTrabajadores?.[0]?.codTrabajador ||
    data?.listaTrabajadores?.[0]?.CodTrabajador ||
    null;

  return isValidOhsCode(value) ? Number(value) : null;
};

/* ==========================================================================
   Centros OHS
   Nota: NO enviamos población/provincia ni sus códigos internos.
   OHS no los sincroniza correctamente si no son sus códigos internos.
========================================================================== */

const buildOhsCentroFromWorkplace = (workplace, extra = {}) => {
  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);
  if (!workplace.name) throw new ClientError("El centro de trabajo no tiene nombre", 400);

  const postcode = workplace.resolvedAddress?.postcode || "";
  const address = workplace.address || workplace.resolvedAddress?.formatted || "";

  return cleanUndefined({
    nomCentro: String(workplace.name || "").trim(),
    domicilioAlta: {
      codPostal: String(postcode || "").trim(),
      desDomicilio: String(address || "").trim(),
    },
    codExternoCentro: String(workplace._id),
    listaTrabajadoresResponsablesSoporteInternosNIFs: [],
    listaTrabajadoresResponsablesSoporteExternos: [],
    listaTrabajadoresResponsablesVsNIFs: [],
    listaTrabajadoresResponsablesTecnicosNIFs: [],
    ...extra,
  });
};

const getWorkplaceForOhs = async (workplaceId) => {
  if (!workplaceId) throw new ClientError("Falta workplaceId", 400);

  const workplace = await Workplace.findById(workplaceId)
    .populate("province", "name")
    .lean();

  if (!workplace) throw new ClientError("Centro de trabajo no encontrado", 404);

  return workplace;
};

const findOhsCentroByName = async (workplaceName) => {
  if (!workplaceName) return null;

  const data = await getOhsCentros({ nomCentro: String(workplaceName).trim() });
  const items = getOhsCentrosItems(data);
  if (!items.length) return null;

  const normalizedName = normalizeTextOhs(workplaceName);

  const matches = items.filter((item) => {
    const itemName = item?.nomCentro || item?.NomCentro || "";
    return normalizeTextOhs(itemName) === normalizedName;
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new ClientError(`Hay más de un centro en OHS con el nombre exacto "${workplaceName}"`, 409);
  }

  return null;
};

const createOhsCentroForWorkplace = async (workplaceId, extraPayload = {}) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  if (isValidOhsCode(workplace.codCentroOhs)) {
    throw new ClientError("El centro de trabajo ya tiene codCentroOhs", 409);
  }

  const existingCentro = await findOhsCentroByName(workplace.name);
  const existingCodCentro = getCodCentroFromOhsCentro(existingCentro);

  if (existingCodCentro) {
    await Workplace.updateOne(
      { _id: workplace._id },
      { $set: { codCentroOhs: String(existingCodCentro) } }
    );

    return updateOhsCentroForWorkplace(workplace._id, extraPayload);
  }

  const payload = buildOhsCentroFromWorkplace(workplace, extraPayload);
  const created = await createOhsCentro(payload);
  const codCentro = getCodCentroFromOhsResponse(created);

  if (!codCentro) {
    const error = new ClientError("OHS no devolvió un codCentro válido", 500);
    error.payload = payload;
    error.data = created;
    throw error;
  }

  await Workplace.updateOne(
    { _id: workplace._id },
    { $set: { codCentroOhs: String(codCentro) } }
  );

  return {
    action: "created",
    workplaceId: String(workplace._id),
    workplaceName: workplace.name,
    codCentro: String(codCentro),
    payload,
    data: created,
  };
};

const updateOhsCentroForWorkplace = async (workplaceId, extraPayload = {}) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  let codCentro = isValidOhsCode(workplace.codCentroOhs) ? Number(workplace.codCentroOhs) : null;

  if (!codCentro) {
    const existingCentro = await findOhsCentroByName(workplace.name);
    codCentro = getCodCentroFromOhsCentro(existingCentro);

    if (!codCentro) {
      return createOhsCentroForWorkplace(workplace._id, extraPayload);
    }

    await Workplace.updateOne(
      { _id: workplace._id },
      { $set: { codCentroOhs: String(codCentro) } }
    );
  }

  const payload = buildOhsCentroFromWorkplace(workplace, extraPayload);
  const updated = await updateOhsCentro(codCentro, payload);

  return {
    action: "updated",
    workplaceId: String(workplace._id),
    workplaceName: workplace.name,
    codCentro: String(codCentro),
    payload,
    data: updated,
  };
};

const deleteOhsCentroForWorkplace = async (workplaceId) => {
  const workplace = await getWorkplaceForOhs(workplaceId);

  if (!isValidOhsCode(workplace.codCentroOhs)) {
    return {
      action: "skip-without-codCentroOhs",
      workplaceId: String(workplace._id),
      workplaceName: workplace.name,
      reason: "El centro no tiene codCentroOhs válido",
    };
  }

  const deleted = await deleteOhsCentro(workplace.codCentroOhs);

  return {
    action: "deleted",
    workplaceId: String(workplace._id),
    workplaceName: workplace.name,
    codCentro: String(workplace.codCentroOhs),
    data: deleted,
  };
};

/* ==========================================================================
   Puestos OHS desde Jobs.subcategories
========================================================================== */

const buildOhsPuestoPayload = ({ name, description, codTipoPuesto } = {}) => {
  if (!name) throw new ClientError("Falta el nombre del puesto", 400);

  const payload = {
    nomTipoPuesto: String(name).trim(),
    desTipoPuesto: String(description || name).trim(),
  };

  if (isValidOhsCode(codTipoPuesto)) payload.codTipoPuesto = Number(codTipoPuesto);

  return payload;
};

const getJobSubcategoryById = async (subcategoryId) => {
  if (!subcategoryId) return null;

  const job = await Jobs.findOne(
    { "subcategories._id": subcategoryId },
    { name: 1, public: 1, "subcategories.$": 1 }
  ).lean();

  if (!job?.subcategories?.length) return null;

  const subcategory = job.subcategories[0];

  return {
    jobId: String(job._id),
    jobName: job.name,
    jobPublic: job.public,
    subcategoryId: String(subcategory._id),
    subcategoryName: subcategory.name,
    subcategoryPublic: subcategory.public,
    codTipoPuestoOhs: subcategory.codTipoPuestoOhs || null,
  };
};

const buildOhsPuestoNameFromSubcategory = (item) =>
  `${item.jobName} - ${item.subcategoryName}`.trim();

const findOhsPuestoByName = async (name) => {
  if (!name) return null;

  const data = await getOhsPuestos({ nomTipoPuesto: String(name).trim() });
  const items = getOhsPuestosItems(data);
  if (!items.length) return null;

  const normalizedName = normalizeTextOhs(name);

  const matches = items.filter((item) => {
    const itemName = item?.nomTipoPuesto || item?.NomTipoPuesto || "";
    return normalizeTextOhs(itemName) === normalizedName;
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new ClientError(`Hay más de un puesto en OHS con el nombre exacto "${name}"`, 409);
  }

  return null;
};

const syncOhsPuesto = async ({ name, description, codTipoPuesto } = {}) => {
  const payload = buildOhsPuestoPayload({ name, description, codTipoPuesto });

if (isValidOhsCode(codTipoPuesto)) {
  const updated = await updateOhsPuesto(codTipoPuesto, payload);

  const checked = await findOhsPuestoByName(payload.nomTipoPuesto);

  console.log("[OHS PUESTO CHECK]");
  console.dir({
    expectedCodTipoPuesto: Number(codTipoPuesto),
    expectedName: payload.nomTipoPuesto,
    foundCodTipoPuesto: checked?.codTipoPuesto || null,
    foundName: checked?.nomTipoPuesto || "",
    foundDescription: checked?.desTipoPuesto || "",
    raw: checked,
  }, { depth: null });

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
    const updated = await updateOhsPuesto(existingCodTipoPuesto, {
      ...payload,
      codTipoPuesto: Number(existingCodTipoPuesto),
    });

    return {
      action: "linked-and-updated",
      codTipoPuesto: String(existingCodTipoPuesto),
      payload: {
        ...payload,
        codTipoPuesto: Number(existingCodTipoPuesto),
      },
      data: updated,
    };
  }

  const created = await createOhsPuesto(payload);
  let createdCodTipoPuesto = getCodTipoPuestoFromOhsPuesto(created);

  if (!createdCodTipoPuesto) {
    const found = await findOhsPuestoByName(payload.nomTipoPuesto);
    createdCodTipoPuesto = getCodTipoPuestoFromOhsPuesto(found);
  }

  if (!createdCodTipoPuesto) {
    const error = new ClientError(`OHS no devolvió codTipoPuesto válido para "${payload.nomTipoPuesto}"`, 500);
    error.payload = payload;
    error.data = created;
    throw error;
  }

  return {
    action: "created",
    codTipoPuesto: String(createdCodTipoPuesto),
    payload,
    data: created,
  };
};

const syncOhsPuestoFromJobSubcategory = async (subcategoryId) => {
  if (!subcategoryId) throw new ClientError("Falta subcategoryId", 400);

  const item = await getJobSubcategoryById(subcategoryId);
  if (!item) throw new ClientError("Subcategoría de puesto no encontrada", 404);
  if (!item.subcategoryName) throw new ClientError("La subcategoría no tiene nombre", 400);

  const name = buildOhsPuestoNameFromSubcategory(item);

  const result = await syncOhsPuesto({
    name,
    description: name,
    codTipoPuesto: item.codTipoPuestoOhs,
  });

  console.log(result)

  if (
    result.codTipoPuesto &&
    String(result.codTipoPuesto) !== String(item.codTipoPuestoOhs || "")
  ) {
    await Jobs.updateOne(
      { _id: item.jobId, "subcategories._id": item.subcategoryId },
      { $set: { "subcategories.$.codTipoPuestoOhs": String(result.codTipoPuesto) } }
    );
  }

  return {
    ...result,
    jobId: item.jobId,
    jobName: item.jobName,
    subcategoryId: item.subcategoryId,
    subcategoryName: item.subcategoryName,
    name,
  };
};

const deleteOhsPuestoFromJobSubcategory = async (subcategoryId) => {
  if (!subcategoryId) throw new ClientError("Falta subcategoryId", 400);

  const item = await getJobSubcategoryById(subcategoryId);

  if (!item) {
    return {
      action: "skip-subcategory-not-found",
      subcategoryId: String(subcategoryId),
      reason: "Subcategoría no encontrada",
    };
  }

  if (!isValidOhsCode(item.codTipoPuestoOhs)) {
    return {
      action: "skip-without-codTipoPuestoOhs",
      jobId: item.jobId,
      jobName: item.jobName,
      subcategoryId: item.subcategoryId,
      subcategoryName: item.subcategoryName,
      reason: "La subcategoría no tiene codTipoPuestoOhs válido",
    };
  }

  if (typeof deleteOhsPuesto !== "function") {
    throw new ClientError("deleteOhsPuesto no está definido en ohsServices", 500);
  }

  const deleted = await deleteOhsPuesto(item.codTipoPuestoOhs);

  return {
    action: "deleted",
    jobId: item.jobId,
    jobName: item.jobName,
    subcategoryId: item.subcategoryId,
    subcategoryName: item.subcategoryName,
    codTipoPuesto: String(item.codTipoPuestoOhs),
    data: deleted,
  };
};

/* ==========================================================================
   Relaciones reales trabajador-centro y trabajador-puesto
   Regla central:
   Cada vez que se actualiza un trabajador, se recalculan y envían juntos:
   - datos actuales del trabajador
   - centro real desde Sesame/Workplace/OHS por nombre
   - puesto real desde Periods/Jobs
========================================================================== */

const buildOhsListaPuestosTrabajador = (codTipoPuesto) => {
  if (!isValidOhsCode(codTipoPuesto)) return [];
  return [Number(codTipoPuesto)];
};

const getSesameOfficeAssignationsForUser = async (user) => {
  if (!user?.userIdSesame) return [];

  const data = await sesameService.getEmployeeOfficeAssignations({
    employeeId: String(user.userIdSesame),
    limit: 200,
    page: 1,
  });

  return data?.data || [];
};

const resolveOhsCentroFromWorkplaceByName = async (workplace) => {
  if (!workplace?.name) {
    return {
      codCentro: null,
      workplace: workplace || null,
      reason: "El Workplace no tiene nombre",
    };
  }

  const ohsCentro = await findOhsCentroByName(workplace.name);
  const codCentro = getCodCentroFromOhsCentro(ohsCentro);

  if (!codCentro) {
    return {
      codCentro: null,
      workplace,
      reason: `No existe centro OHS con el nombre exacto "${workplace.name}"`,
    };
  }

  if (String(workplace.codCentroOhs || "") !== String(codCentro)) {
    await Workplace.updateOne(
      { _id: workplace._id },
      { $set: { codCentroOhs: String(codCentro) } }
    );
  }

  return {
    codCentro: Number(codCentro),
    workplace: {
      ...workplace,
      codCentroOhs: String(codCentro),
    },
    ohsCentro,
    reason: null,
  };
};

const resolveOhsCentroRealFromUser = async (user) => {
  const assignations = await getSesameOfficeAssignationsForUser(user);

  const offices = assignations.map((item) => ({
    officeIdSesame: item?.office?.id || item?.officeId || null,
    officeName: item?.office?.name || item?.officeName || item?.name || "",
    isMainOffice: Boolean(item?.isMainOffice),
  }));

  /*
   * 1) Prioridad: oficina real de Sesame
   */
  if (assignations.length) {
    const mainAssignation =
      assignations.find((item) => item?.isMainOffice) ||
      (assignations.length === 1 ? assignations[0] : null);

    if (!mainAssignation) {
      return {
        codCentro: null,
        workplace: null,
        officeIdSesame: null,
        offices,
        source: "sesame",
        reason: "El usuario tiene varias oficinas en Sesame y ninguna marcada como principal",
      };
    }

    const officeIdSesame = mainAssignation?.office?.id || mainAssignation?.officeId || null;

    if (!officeIdSesame) {
      return {
        codCentro: null,
        workplace: null,
        officeIdSesame: null,
        offices,
        source: "sesame",
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
        codCentro: null,
        workplace: null,
        officeIdSesame,
        offices,
        source: "sesame",
        reason: "No existe Workplace local vinculado a esa oficina Sesame",
      };
    }

    const resolved = await resolveOhsCentroFromWorkplaceByName(workplace);

    return {
      ...resolved,
      officeIdSesame,
      offices,
      source: "sesame",
    };
  }

  /*
   * 2) Fallback: si NO tiene oficina Sesame,
   * usar el centro/workplace del dispositivo del periodo activo.
   */
  const period = await getActivePeriodForUser(user._id);

  if (!period) {
    return {
      codCentro: null,
      workplace: null,
      officeIdSesame: null,
      offices,
      source: "period-device",
      reason: "El usuario no tiene oficina Sesame ni periodo activo",
    };
  }

  const dispositiveId =
    period.dispositiveId?._id ||
    period.dispositiveId ||
    period.device ||
    null;

  if (!dispositiveId) {
    return {
      codCentro: null,
      workplace: null,
      officeIdSesame: null,
      offices,
      source: "period-device",
      periodId: String(period._id),
      reason: "El periodo activo no tiene dispositiveId ni device",
    };
  }

  let workplace = null;

  /*
   * Caso A:
   * El dispositivo viene populado y tiene workplaces[].
   */
  const dispositiveWorkplaces = Array.isArray(period.dispositiveId?.workplaces)
    ? period.dispositiveId.workplaces
    : [];

  if (dispositiveWorkplaces.length) {
    workplace = await Workplace.findOne({
      _id: { $in: dispositiveWorkplaces },
      active: true,
    })
      .select("_id name officeIdSesame codCentroOhs active")
      .lean();
  }

  /*
   * Caso B:
   * El dispositivo tiene workplaceId o workplace directo.
   */
  if (!workplace) {
    const workplaceId =
      period.dispositiveId?.workplaceId ||
      period.dispositiveId?.workplace ||
      null;

    if (workplaceId) {
      workplace = await Workplace.findOne({
        _id: workplaceId,
        active: true,
      })
        .select("_id name officeIdSesame codCentroOhs active")
        .lean();
    }
  }

  /*
   * Caso C:
   * Si el modelo Workplace tuviera relación directa con dispositivo.
   * Lo dejamos como fallback por si existe en tu colección.
   */
  if (!workplace) {
    workplace = await Workplace.findOne({
      active: true,
      $or: [
        { dispositiveId },
        { dispositive: dispositiveId },
        { device: dispositiveId },
      ],
    })
      .select("_id name officeIdSesame codCentroOhs active")
      .lean();
  }

  /*
   * Caso D:
   * Buscar el dispositivo completo por si populate no trajo workplaces.
   */
  if (!workplace) {
    const dispositive = await Dispositive.findById(dispositiveId)
      .select("_id name workplaces workplaceId workplace")
      .lean();

    const workplaceIds = Array.isArray(dispositive?.workplaces)
      ? dispositive.workplaces
      : [];

    const directWorkplaceId = dispositive?.workplaceId || dispositive?.workplace || null;

    if (directWorkplaceId) {
      workplace = await Workplace.findOne({
        _id: directWorkplaceId,
        active: true,
      })
        .select("_id name officeIdSesame codCentroOhs active")
        .lean();
    }

    if (!workplace && workplaceIds.length) {
      workplace = await Workplace.findOne({
        _id: { $in: workplaceIds },
        active: true,
      })
        .select("_id name officeIdSesame codCentroOhs active")
        .lean();
    }
  }

  if (!workplace) {
    return {
      codCentro: null,
      workplace: null,
      officeIdSesame: null,
      offices,
      source: "period-device",
      periodId: String(period._id),
      dispositiveId: String(dispositiveId),
      dispositiveName: period.dispositiveId?.name || "",
      reason: "No se ha encontrado Workplace activo vinculado al dispositivo del periodo activo",
    };
  }

  const resolved = await resolveOhsCentroFromWorkplaceByName(workplace);

  return {
    ...resolved,
    officeIdSesame: workplace.officeIdSesame || null,
    offices,
    source: "period-device",
    periodId: String(period._id),
    dispositiveId: String(dispositiveId),
    dispositiveName: period.dispositiveId?.name || "",
  };
};

const getActivePeriodForUser = async (userId) => {
  return Periods.findOne({
    idUser: userId,
    active: true,
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  })
    .sort({ startDate: -1 })
    .lean();
};

const resolveOhsPuestoRealFromUser = async (userId) => {
  const period = await getActivePeriodForUser(userId);

  if (!period) {
    return {
      codTipoPuesto: null,
      period: null,
      puesto: null,
      reason: "El trabajador no tiene periodo activo",
    };
  }

  const puesto = await getJobSubcategoryById(period.position);

  if (!puesto) {
    return {
      codTipoPuesto: null,
      period,
      puesto: null,
      reason: "La posición del periodo activo no corresponde a ninguna subcategoría de Jobs",
    };
  }

  if (!isValidOhsCode(puesto.codTipoPuestoOhs)) {
    return {
      codTipoPuesto: null,
      period,
      puesto,
      reason: "La subcategoría del puesto no tiene codTipoPuestoOhs",
    };
  }

  return {
    codTipoPuesto: Number(puesto.codTipoPuestoOhs),
    period,
    puesto,
    reason: null,
  };
};

const resolveOhsTrabajadorRelationsPayload = async (user) => {
  const result = {
    payload: {},
    centro: null,
    puesto: null,
    warnings: [],
  };

const resolvedCentro = await resolveOhsCentroRealFromUser(user);

if (resolvedCentro.codCentro) {
  result.payload.codCentro = Number(resolvedCentro.codCentro);

  result.centro = {
    codCentro: String(resolvedCentro.codCentro),
    workplaceId: resolvedCentro.workplace?._id ? String(resolvedCentro.workplace._id) : null,
    workplaceName: resolvedCentro.workplace?.name || "",
    officeIdSesame: resolvedCentro.officeIdSesame || null,
    source: resolvedCentro.source || null,
    periodId: resolvedCentro.periodId || null,
    dispositiveId: resolvedCentro.dispositiveId || null,
    dispositiveName: resolvedCentro.dispositiveName || "",
  };
} else {
  result.warnings.push({
    type: "center-not-resolved",
    reason: resolvedCentro.reason,
    officeIdSesame: resolvedCentro.officeIdSesame || null,
    offices: resolvedCentro.offices || [],
    source: resolvedCentro.source || null,
    periodId: resolvedCentro.periodId || null,
    dispositiveId: resolvedCentro.dispositiveId || null,
    dispositiveName: resolvedCentro.dispositiveName || "",
  });
}

  const resolvedPuesto = await resolveOhsPuestoRealFromUser(user._id);

  if (resolvedPuesto.codTipoPuesto) {
    result.payload.listaPuestosTrabajador = buildOhsListaPuestosTrabajador(
      resolvedPuesto.codTipoPuesto
    );

    result.puesto = {
      codTipoPuesto: String(resolvedPuesto.codTipoPuesto),
      periodId: resolvedPuesto.period?._id ? String(resolvedPuesto.period._id) : null,
      jobId: resolvedPuesto.puesto?.jobId || null,
      jobName: resolvedPuesto.puesto?.jobName || "",
      subcategoryId: resolvedPuesto.puesto?.subcategoryId || null,
      subcategoryName: resolvedPuesto.puesto?.subcategoryName || "",
    };
  } else {
    result.warnings.push({
      type: "puesto-not-resolved",
      reason: resolvedPuesto.reason,
      periodId: resolvedPuesto.period?._id ? String(resolvedPuesto.period._id) : null,
    });
  }

  return result;
};

/* ==========================================================================
   Trabajadores OHS
========================================================================== */

const findOhsTrabajadorByUserIncludingDeleted = async (user) => {
  if (!user?.dni) return null;

  const dni = normalizeDniOhs(user.dni);

  const data = await getOhsTrabajadorByDniIncludingDeleted(dni);
  const items = getOhsTrabajadoresItems(data);

  const matches = items.filter((item) =>
    normalizeDniOhs(item.codIdentificador) === dni
  );

  if (!matches.length) return null;

  if (matches.length > 1) {
    throw new ClientError(`Hay más de un trabajador en OHS con el DNI ${user.dni}`, 409);
  }

  return matches[0];
};

const buildOhsTrabajadorPutPayload = ({
  user,
  currentOhs = {},
  relationsPayload = {},
  extraPayload = {},
}) => {
  if (!user) throw new ClientError("Usuario no encontrado", 404);
  if (!user.firstName) throw new ClientError("El usuario no tiene nombre", 400);
  if (!user.dni) throw new ClientError("El usuario no tiene DNI/NIE", 400);

  const { apellido1Trabajador, apellido2Trabajador } = splitLastName(user.lastName);

  const payload = cleanUndefined({
  ...currentOhs,

  codTrabajador: currentOhs.codTrabajador
    ? Number(currentOhs.codTrabajador)
    : undefined,

  nomTrabajador: String(user.firstName || "").trim(),
  apellido1Trabajador,
  apellido2Trabajador,
  codIdentificador: normalizeDniOhs(user.dni),
  fecNacimiento: user.birthday ? formatDateOhs(user.birthday) : currentOhs.fecNacimiento,
  desEmail: user.email ? String(user.email).trim().toLowerCase() : currentOhs.desEmail,
  indSexo: mapGenderToOhs(user.gender),

  ...relationsPayload,
  ...extraPayload,
});

if (payload.listaPuestosTrabajador === null) {
  delete payload.listaPuestosTrabajador;
}

return payload;
};

const findCurrentOhsTrabajadorForUser = async (user) => {
  if (!user?.dni) {
    return {
      currentOhs: null,
      codTrabajador: null,
    };
  }

  const currentOhs = await findOhsTrabajadorByUserIncludingDeleted(user);
  const codTrabajador = currentOhs?.codTrabajador || null;

  if (
    user.userIdOhs &&
    codTrabajador &&
    String(user.userIdOhs) !== String(codTrabajador)
  ) {
    console.log("[OHS USER ID DESCUADRADO]", {
      userId: String(user._id),
      dni: user.dni,
      userIdOhsLocal: user.userIdOhs,
      codTrabajadorOhs: codTrabajador,
    });
  }

  return {
    currentOhs,
    codTrabajador: isValidOhsCode(codTrabajador) ? Number(codTrabajador) : null,
  };
};

/**
 * FUNCIÓN CENTRAL DE TRABAJADORES.
 *
 * Cada vez que se actualiza un usuario en OHS:
 * - toma los datos actuales antiguos de OHS
 * - actualiza nombre, DNI, email, fecha, sexo desde Mongo
 * - busca el centro real por Sesame -> Workplace -> nomCentro en OHS
 * - busca el puesto real por Periods -> Jobs.subcategories
 * - manda TODO junto en un único PUT completo
 */
const syncOhsTrabajadorForUser = async (
  userId,
  extraPayload = {},
  { createIfMissing = true, dryRun = false } = {}
) => {
  if (!userId) throw new ClientError("Falta userId", 400);

const user = await User.findById(userId).lean();
if (!user) throw new ClientError("Usuario no encontrado", 404);

if (user.apafa === true) {
  return {
    action: "skip-apafa",
    userId: String(user._id),
    dni: user.dni || "",
    reason: "Usuario APAFA, no se sincroniza con OHS",
  };
}

  const { currentOhs, codTrabajador } = await findCurrentOhsTrabajadorForUser(user);
  if (!codTrabajador && !createIfMissing) {
    return {
      action: "skip-without-ohs-worker",
      userId: String(user._id),
      dni: user.dni || "",
      reason: "Trabajador no encontrado en OHS",
    };
  }

const activeLeave = await hasActiveLeaveForUser(user._id);
const isReactivation = extraPayload?.fecBaja === null;
const shouldResolveRelations = !activeLeave || isReactivation;

let relations;

if (shouldResolveRelations) {
  relations = await resolveOhsTrabajadorRelationsPayload(user);
} else {
  const resolvedPuesto = await resolveOhsPuestoRealFromUser(user._id);

  if (!resolvedPuesto.codTipoPuesto) {
    return {
      action: "skip-active-leave-without-position",
      userId: String(user._id),
      dni: user.dni || "",
      codTrabajador: codTrabajador ? String(codTrabajador) : null,
      reason: "Usuario con baja activa: no se actualiza OHS porque no se puede reenviar listaPuestosTrabajador sin borrar el puesto",
      warning: resolvedPuesto.reason,
    };
  }

  relations = {
    payload: {
      codCentro: currentOhs.codCentro,
      listaPuestosTrabajador: [Number(resolvedPuesto.codTipoPuesto)],
    },
    centro: {
      codCentro: currentOhs.codCentro || null,
      workplaceId: null,
      workplaceName: currentOhs.desCentro || "",
      source: "current-ohs",
    },
    puesto: {
      codTipoPuesto: String(resolvedPuesto.codTipoPuesto),
      periodId: resolvedPuesto.period?._id ? String(resolvedPuesto.period._id) : null,
      jobId: resolvedPuesto.puesto?.jobId || null,
      jobName: resolvedPuesto.puesto?.jobName || "",
      subcategoryId: resolvedPuesto.puesto?.subcategoryId || null,
      subcategoryName: resolvedPuesto.puesto?.subcategoryName || "",
      source: "period-preserved-active-leave",
    },
    warnings: [
      {
        type: "relations-preserved-active-leave",
        reason: "Usuario con baja activa: se conserva centro actual de OHS y se reenvía el puesto desde el periodo activo",
      },
    ],
  };
}

const payload = buildOhsTrabajadorPutPayload({
  user,
  currentOhs: currentOhs || {},
  relationsPayload: relations.payload,
  extraPayload: {
    codTrabajador: codTrabajador ? Number(codTrabajador) : undefined,
    ...extraPayload,
  },
});

  if (dryRun) {
    return {
      action: codTrabajador ? "would-update" : "would-create",
      userId: String(user._id),
      dni: user.dni || "",
      codTrabajador: codTrabajador ? String(codTrabajador) : null,
      payload,
      centro: relations.centro,
      puesto: relations.puesto,
      warnings: relations.warnings,
    };
  }

  if (!codTrabajador) {
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
      dni: user.dni || "",
      codTrabajador: String(createdId),
      payload,
      centro: relations.centro,
      puesto: relations.puesto,
      warnings: relations.warnings,
      data: created,
    };
  }

  const updated = await updateOhsTrabajador(codTrabajador, payload);

  if (!user.userIdOhs || String(user.userIdOhs) !== String(codTrabajador)) {
    await User.updateOne(
      { _id: user._id },
      { $set: { userIdOhs: String(codTrabajador) } }
    );
  }

  return {
    action: currentOhs?.fecBaja && payload.fecBaja === null ? "reactivated" : "updated",
    userId: String(user._id),
    dni: user.dni || "",
    codTrabajador: String(codTrabajador),
    payload,
    centro: relations.centro,
    puesto: relations.puesto,
    warnings: relations.warnings,
    data: updated,
  };
};

const bajaOhsTrabajadorForUser = async (userId, fechaBaja = new Date()) => {
  return syncOhsTrabajadorForUser(
    userId,
    { fecBaja: formatDateOhs(fechaBaja) || new Date().toISOString() },
    { createIfMissing: false }
  );
};

const reactivarOhsTrabajadorForUser = async (userId, extraPayload = {}) => {
  return syncOhsTrabajadorForUser(
    userId,
    { fecBaja: null, ...extraPayload },
    { createIfMissing: true }
  );
};

/**
 * LOCAL / MANTENIMIENTO.
 * Corrige todos los trabajadores activos en OHS.
 * Usa syncOhsTrabajadorForUser(), así que también manda centro + puesto juntos.
 */
const syncAllOhsTrabajadoresActivosLocal = async ({
  dryRun = true,
  limit = 0,
  verbose = false,
} = {}) => {
  let query = User.find({
    employmentStatus: "activo",
    dni: { $exists: true, $ne: "" },
    firstName: { $exists: true, $ne: "" },
  })
    .select("_id firstName lastName dni email gender birthday userIdOhs userIdSesame employmentStatus")
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) query = query.limit(limit);

  const users = await query;

  const results = {
    dryRun,
    total: users.length,
    updated: [],
    created: [],
    skipped: [],
    errors: [],
  };

  for (const user of users) {
    try {
      if (verbose) {
        console.log("");
        console.log("====================================================");
        console.log(`[OHS TRABAJADOR] ${user.dni || ""} - ${user.firstName || ""} ${user.lastName || ""}`);
        console.log("====================================================");
      }

      const result = await syncOhsTrabajadorForUser(user._id, {}, { dryRun });

      if (result.action?.startsWith("skip")) {
        results.skipped.push(result);
        continue;
      }

      const list = result.action === "created" || result.action === "would-create"
        ? "created"
        : "updated";

      results[list].push({
        userId: String(user._id),
        userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        userIdSesame: user.userIdSesame || null,
        action: result.action,
        codCentro: result.payload?.codCentro || null,
        listaPuestosTrabajador: result.payload?.listaPuestosTrabajador || null,
        centro: result.centro,
        puesto: result.puesto,
        warnings: result.warnings,
        payload: result.payload,
        data: result.data,
      });

      if (verbose) {
        console.log("[OHS TRABAJADOR] Resultado:");
        console.dir({
          action: result.action,
          userId: String(user._id),
          userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
          dni: user.dni || "",
          codCentro: result.payload?.codCentro || null,
          listaPuestosTrabajador: result.payload?.listaPuestosTrabajador || null,
          centro: result.centro,
          puesto: result.puesto,
          warnings: result.warnings,
        }, { depth: null });
      }
    } catch (error) {
      results.errors.push({
        userId: String(user._id),
        userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        userIdSesame: user.userIdSesame || null,
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
        payload: error.payload || null,
        data: error.data || null,
      });

      if (verbose) {
        console.log("[OHS TRABAJADOR] ERROR:");
        console.dir({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          message: error.message,
          body: error.body,
          payload: error.payload || null,
        }, { depth: null });
      }
    }
  }

  return results;
};
/* ==========================================================================
   Exports limpios para otros controladores
========================================================================== */
/**
 * LOCAL / MANTENIMIENTO
 *
 * Busca trabajadores activos con periodo activo vigente,
 * pero sin oficina/centro asignado en Sesame, y los actualiza en OHS.
 *
 * Usa syncOhsTrabajadorForUser(), por tanto:
 * - recalcula centro real
 * - como no hay oficina Sesame, debe usar el centro del dispositivo del periodo activo
 * - recalcula puesto real desde el periodo activo
 * - manda todo junto en un único PUT completo
 */
// const syncOhsTrabajadoresActivosSinCentroSesameLocal = async ({
//   dryRun = true,
//   limit = 0,
//   verbose = false,
// } = {}) => {
//   let usersQuery = User.find({
//     employmentStatus: "activo",
//     dni: { $exists: true, $ne: "" },
//     firstName: { $exists: true, $ne: "" },
//   })
//     .select("_id firstName lastName dni email gender birthday userIdOhs userIdSesame employmentStatus")
//     .sort({ lastName: 1, firstName: 1 });

//   if (limit > 0) usersQuery = usersQuery.limit(limit);

//   const users = await usersQuery;

//   const results = {
//     dryRun,
//     totalChecked: users.length,
//     totalMatched: 0,
//     updated: [],
//     created: [],
//     skipped: [],
//     errors: [],
//   };

//   for (const user of users) {
//     try {
//       if (verbose) {
//         console.log("");
//         console.log("====================================================");
//         console.log(`[OHS SIN CENTRO SESAME] ${user.dni || ""} - ${user.firstName || ""} ${user.lastName || ""}`);
//         console.log("====================================================");
//       }

//       const period = await getActivePeriodForUser(user._id);

//       if (!period) {
//         results.skipped.push({
//           userId: String(user._id),
//           userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
//           dni: user.dni || "",
//           name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//           reason: "Usuario activo sin periodo activo vigente",
//         });
//         continue;
//       }

//       let assignations = [];

//       if (user.userIdSesame) {
//         assignations = await getSesameOfficeAssignationsForUser(user);
//       }

//       if (assignations.length > 0) {
//         results.skipped.push({
//           userId: String(user._id),
//           userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
//           dni: user.dni || "",
//           name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//           userIdSesame: user.userIdSesame || null,
//           periodId: String(period._id),
//           reason: "El usuario sí tiene oficina/centro asignado en Sesame",
//           sesameOffices: assignations.map((item) => ({
//             officeIdSesame: item?.office?.id || item?.officeId || null,
//             officeName: item?.office?.name || item?.officeName || item?.name || "",
//             isMainOffice: Boolean(item?.isMainOffice),
//           })),
//         });
//         continue;
//       }

//       results.totalMatched += 1;

//       if (dryRun) {
//         const preview = await syncOhsTrabajadorForUser(user._id, {}, { dryRun: true });

//         results.updated.push({
//           userId: String(user._id),
//           userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
//           dni: user.dni || "",
//           name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//           userIdSesame: user.userIdSesame || null,
//           periodId: String(period._id),
//           action: preview.action,
//           codCentro: preview.payload?.codCentro || null,
//           listaPuestosTrabajador: preview.payload?.listaPuestosTrabajador || null,
//           centro: preview.centro,
//           puesto: preview.puesto,
//           warnings: preview.warnings,
//           payload: preview.payload,
//         });

//         if (verbose) {
//           console.log("[OHS SIN CENTRO SESAME] DRY RUN:");
//           console.dir({
//             action: preview.action,
//             userId: String(user._id),
//             dni: user.dni || "",
//             periodId: String(period._id),
//             codCentro: preview.payload?.codCentro || null,
//             listaPuestosTrabajador: preview.payload?.listaPuestosTrabajador || null,
//             centro: preview.centro,
//             puesto: preview.puesto,
//             warnings: preview.warnings,
//           }, { depth: null });
//         }

//         continue;
//       }

//       const result = await syncOhsTrabajadorForUser(user._id);

//       const list = result.action === "created" ? "created" : "updated";

//       results[list].push({
//         userId: String(user._id),
//         userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
//         dni: user.dni || "",
//         name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//         userIdSesame: user.userIdSesame || null,
//         periodId: String(period._id),
//         action: result.action,
//         codCentro: result.payload?.codCentro || null,
//         listaPuestosTrabajador: result.payload?.listaPuestosTrabajador || null,
//         centro: result.centro,
//         puesto: result.puesto,
//         warnings: result.warnings,
//         payload: result.payload,
//         data: result.data,
//       });

//       if (verbose) {
//         console.log("[OHS SIN CENTRO SESAME] Resultado:");
//         console.dir({
//           action: result.action,
//           userId: String(user._id),
//           userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
//           dni: user.dni || "",
//           periodId: String(period._id),
//           codCentro: result.payload?.codCentro || null,
//           listaPuestosTrabajador: result.payload?.listaPuestosTrabajador || null,
//           centro: result.centro,
//           puesto: result.puesto,
//           warnings: result.warnings,
//         }, { depth: null });
//       }
//     } catch (error) {
//       results.errors.push({
//         userId: String(user._id),
//         userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
//         dni: user.dni || "",
//         name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//         userIdSesame: user.userIdSesame || null,
//         message: error.message,
//         statusCode: error.statusCode,
//         body: error.body,
//         url: error.url,
//         payload: error.payload || null,
//         data: error.data || null,
//       });

//       if (verbose) {
//         console.log("[OHS SIN CENTRO SESAME] ERROR:");
//         console.dir({
//           userId: String(user._id),
//           dni: user.dni || "",
//           name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
//           message: error.message,
//           body: error.body,
//           payload: error.payload || null,
//         }, { depth: null });
//       }
//     }
//   }

//   return results;
// };

/**
 * LOCAL / MANTENIMIENTO
 *
 * Elimina de OHS todos los trabajadores que en Mongo son APAFA.
 *
 * Regla:
 * - APAFA no debe existir en OHS.
 * - Si existe en OHS, se elimina con DELETE.
 * - Después se limpia userIdOhs en Mongo.
 */
const deleteAllOhsTrabajadoresApafaLocal = async ({
  dryRun = true,
  limit = 0,
  verbose = false,
} = {}) => {
  let query = User.find({
    apafa: true,
    dni: { $exists: true, $ne: "" },
  })
    .select("_id firstName lastName dni email userIdOhs apafa employmentStatus")
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) query = query.limit(limit);

  const users = await query;

  const results = {
    dryRun,
    total: users.length,
    deleted: [],
    skipped: [],
    errors: [],
  };

  for (const user of users) {
    try {
      if (verbose) {
        console.log("");
        console.log("====================================================");
        console.log(`[OHS APAFA DELETE] ${user.dni || ""} - ${user.firstName || ""} ${user.lastName || ""}`);
        console.log("====================================================");
      }

      let currentOhs = null;
      let codTrabajador = user.userIdOhs || null;

      if (codTrabajador && isValidOhsCode(codTrabajador)) {
        const data = await getOhsTrabajadorByCodIncludingDeleted(Number(codTrabajador));
        currentOhs = getOhsTrabajadoresItems(data)?.[0] || null;
      }

      if (!currentOhs) {
        const data = await getOhsTrabajadorByDniIncludingDeleted(normalizeDniOhs(user.dni));
        const items = getOhsTrabajadoresItems(data);

        if (items.length > 1) {
          throw new ClientError(`Hay más de un trabajador en OHS con el DNI ${user.dni}`, 409);
        }

        currentOhs = items[0] || null;
        codTrabajador = currentOhs?.codTrabajador || currentOhs?.CodTrabajador || null;
      }

      if (!isValidOhsCode(codTrabajador)) {
        if (user.userIdOhs) {
          if (!dryRun) {
            await User.updateOne(
              { _id: user._id },
              { $unset: { userIdOhs: "" } }
            );
          }

          results.skipped.push({
            userId: String(user._id),
            dni: user.dni || "",
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
            reason: "No se encontró trabajador en OHS, se limpia userIdOhs local",
            dryRun,
          });

          continue;
        }

        results.skipped.push({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          reason: "No existe en OHS",
        });

        continue;
      }

      if (dryRun) {
        results.deleted.push({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          codTrabajador: String(codTrabajador),
          userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
          action: "would-delete-apafa-from-ohs",
          currentOhs: {
            codTrabajador: currentOhs?.codTrabajador || currentOhs?.CodTrabajador || null,
            codIdentificador: currentOhs?.codIdentificador || currentOhs?.CodIdentificador || null,
            nomTrabajador: currentOhs?.nomTrabajador || currentOhs?.NomTrabajador || null,
            apellido1Trabajador: currentOhs?.apellido1Trabajador || currentOhs?.Apellido1Trabajador || null,
            apellido2Trabajador: currentOhs?.apellido2Trabajador || currentOhs?.Apellido2Trabajador || null,
            fecBaja: currentOhs?.fecBaja || currentOhs?.FecBaja || null,
          },
        });

        continue;
      }

      const deleted = await deleteOhsTrabajador(Number(codTrabajador));

      await User.updateOne(
        { _id: user._id },
        { $unset: { userIdOhs: "" } }
      );

      results.deleted.push({
        userId: String(user._id),
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        codTrabajador: String(codTrabajador),
        userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
        action: "deleted-apafa-from-ohs",
        data: deleted,
      });

      if (verbose) {
        console.log("[OHS APAFA DELETE] Eliminado:");
        console.dir({
          userId: String(user._id),
          dni: user.dni || "",
          codTrabajador: String(codTrabajador),
        }, { depth: null });
      }
    } catch (error) {
      results.errors.push({
        userId: String(user._id),
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
        data: error.data || null,
      });

      if (verbose) {
        console.log("[OHS APAFA DELETE] ERROR:");
        console.dir({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          message: error.message,
          body: error.body,
        }, { depth: null });
      }
    }
  }

  return results;
};

/**
 * LOCAL / MANTENIMIENTO
 *
 * Actualiza el sexo/género de todos los trabajadores existentes en OHS.
 *
 * Regla:
 * - No crea trabajadores nuevos en OHS.
 * - No sincroniza APAFA.
 * - Usa syncOhsTrabajadorForUser(), así que manda payload completo.
 * - El helper mapGenderToOhs() convierte:
 *   male / h / hombre  -> H
 *   female / m / mujer -> M
 *   cualquier otra cosa -> M
 */
const syncAllOhsTrabajadoresGenderLocal = async ({
  dryRun = true,
  limit = 0,
  verbose = false,
} = {}) => {
  let query = User.find({
    apafa: { $ne: true },
    dni: { $exists: true, $ne: "" },
    firstName: { $exists: true, $ne: "" },
    $or: [
      { userIdOhs: { $exists: true, $nin: [null, ""] } },
      { employmentStatus: "activo" },
    ],
  })
    .select("_id firstName lastName dni email gender birthday userIdOhs userIdSesame employmentStatus apafa")
    .sort({ lastName: 1, firstName: 1 });

  if (limit > 0) query = query.limit(limit);

  const users = await query;

  const results = {
    dryRun,
    total: users.length,
    updated: [],
    skipped: [],
    errors: [],
  };

  for (const user of users) {
    try {
      if (verbose) {
        console.log("");
        console.log("====================================================");
        console.log(`[OHS GENDER] ${user.dni || ""} - ${user.firstName || ""} ${user.lastName || ""}`);
        console.log("====================================================");
      }

      if (user.apafa === true) {
        results.skipped.push({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          reason: "Usuario APAFA, no se sincroniza con OHS",
        });
        continue;
      }

      const expectedGender = mapGenderToOhs(user.gender);

      const result = await syncOhsTrabajadorForUser(
        user._id,
        {},
        {
          createIfMissing: false,
          dryRun,
        }
      );

      if (result.action?.startsWith("skip")) {
        results.skipped.push({
          ...result,
          expectedGender,
        });
        continue;
      }

      results.updated.push({
        userId: String(user._id),
        userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        genderMongo: user.gender || null,
        genderOhsExpected: expectedGender,
        genderPayload: result.payload?.indSexo || null,
        action: result.action,
        centro: result.centro || null,
        puesto: result.puesto || null,
        warnings: result.warnings || [],
        payload: result.payload,
        data: result.data,
      });

      if (verbose) {
        console.log("[OHS GENDER] Resultado:");
        console.dir({
          action: result.action,
          userId: String(user._id),
          userIdOhs: result.codTrabajador ? String(result.codTrabajador) : null,
          dni: user.dni || "",
          genderMongo: user.gender || null,
          genderOhsExpected: expectedGender,
          genderPayload: result.payload?.indSexo || null,
          codCentro: result.payload?.codCentro || null,
          listaPuestosTrabajador: result.payload?.listaPuestosTrabajador || null,
          warnings: result.warnings || [],
        }, { depth: null });
      }
    } catch (error) {
      results.errors.push({
        userId: String(user._id),
        userIdOhs: user.userIdOhs ? String(user.userIdOhs) : null,
        dni: user.dni || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        genderMongo: user.gender || null,
        expectedGender: mapGenderToOhs(user.gender),
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        url: error.url,
        payload: error.payload || null,
        data: error.data || null,
      });

      if (verbose) {
        console.log("[OHS GENDER] ERROR:");
        console.dir({
          userId: String(user._id),
          dni: user.dni || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          genderMongo: user.gender || null,
          expectedGender: mapGenderToOhs(user.gender),
          message: error.message,
          body: error.body,
        }, { depth: null });
      }
    }
  }

  return results;
};


const runOhsSafe = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error(`[OHS SAFE] ${label}:`, {
      message: err.message,
      statusCode: err.statusCode,
      payload: err.payload || null,
      data: err.data || null,
    });

    return {
      action: "ohs-error",
      label,
      message: err.message,
      payload: err.payload || null,
      data: err.data || null,
    };
  }
};

const syncOhsTrabajador = async (req, res) => {
  const { userId, dryRun = false } = req.body || {};

  if (!userId) throw new ClientError("Falta userId", 400);

  queueSyncOhsTrabajadorForUser(userId, {}, {
    createIfMissing: false,
    dryRun: Boolean(dryRun),
  });

  return response(res, 200, {
    action: "queued",
    userId,
    dryRun: Boolean(dryRun),
  });
};

const runOhsBackground = (label, fn) => {
  setImmediate(async () => {
    const result = await runOhsSafe(label, fn);

    const logData = {
      action: result?.action || null,
      userId: result?.userId || null,
      dni: result?.dni || null,
      codTrabajador: result?.codTrabajador || null,

      codCentro: result?.centro?.codCentro || result?.payload?.codCentro || null,
      workplaceId: result?.centro?.workplaceId || null,
      workplaceName: result?.centro?.workplaceName || "",

      codTipoPuesto:
        result?.puesto?.codTipoPuesto ||
        result?.payload?.listaPuestosTrabajador?.[0] ||
        null,
      puesto: result?.puesto
        ? `${result.puesto.jobName || ""} - ${result.puesto.subcategoryName || ""}`.trim()
        : "",

      warnings: result?.warnings || [],
    };

    if (result?.action === "ohs-error") {
      console.log(`[OHS BACKGROUND ERROR] ${label}`);
      console.dir(result, { depth: null });
      return;
    }

    if (logData.warnings.length) {
      console.log(`[OHS BACKGROUND WARNINGS] ${label}`);
      console.dir(logData.warnings, { depth: null });
    }
  });
};

const queueSyncOhsTrabajadorForUser = (userId, extraPayload = {}, options = {}) => {
  if (!userId) return;

  runOhsBackground(`sync trabajador OHS user ${userId}`, () =>
    syncOhsTrabajadorForUser(userId, extraPayload, options)
  );
};

const queueBajaOhsTrabajadorForUser = (userId, fechaBaja = new Date()) => {
  if (!userId) return;

  runOhsBackground(`baja trabajador OHS user ${userId}`, () =>
    bajaOhsTrabajadorForUser(userId, fechaBaja)
  );
};

const queueReactivarOhsTrabajadorForUser = (userId, extraPayload = {}) => {
  if (!userId) return;

  runOhsBackground(`reactivar trabajador OHS user ${userId}`, () =>
    reactivarOhsTrabajadorForUser(userId, extraPayload)
  );
};

const queueCreateOhsCentroForWorkplace = (workplaceId, extraPayload = {}) => {
  if (!workplaceId) return;

  runOhsBackground(`crear centro OHS workplace ${workplaceId}`, () =>
    createOhsCentroForWorkplace(workplaceId, extraPayload)
  );
};

const queueUpdateOhsCentroForWorkplace = (workplaceId, extraPayload = {}) => {
  if (!workplaceId) return;

  runOhsBackground(`actualizar centro OHS workplace ${workplaceId}`, () =>
    updateOhsCentroForWorkplace(workplaceId, extraPayload)
  );
};

const queueDeleteOhsCentroFromSnapshot = (workplace) => {
  if (!workplace?._id) return;

  runOhsBackground(`eliminar centro OHS workplace ${workplace._id}`, async () => {
    if (!isValidOhsCode(workplace.codCentroOhs)) {
      return {
        action: "skip-without-codCentroOhs",
        workplaceId: String(workplace._id),
        workplaceName: workplace.name || "",
      };
    }

    const deleted = await deleteOhsCentro(workplace.codCentroOhs);

    return {
      action: "deleted",
      workplaceId: String(workplace._id),
      workplaceName: workplace.name || "",
      codCentro: String(workplace.codCentroOhs),
      data: deleted,
    };
  });
};

const queueSyncOhsPuestoFromJobSubcategory = (subcategoryId) => {
  if (!subcategoryId) return;

  runOhsBackground(`sync puesto OHS subcategory ${subcategoryId}`, () =>
    syncOhsPuestoFromJobSubcategory(subcategoryId)
  );
};

const queueDeleteOhsPuestoFromSnapshot = ({ jobId, jobName, subcategory } = {}) => {
  if (!subcategory?._id) return;

  runOhsBackground(`eliminar puesto OHS subcategory ${subcategory._id}`, async () => {
    if (!isValidOhsCode(subcategory.codTipoPuestoOhs)) {
      return {
        action: "skip-without-codTipoPuestoOhs",
        jobId: jobId ? String(jobId) : null,
        jobName: jobName || "",
        subcategoryId: String(subcategory._id),
        subcategoryName: subcategory.name || "",
      };
    }

    const deleted = await deleteOhsPuesto(subcategory.codTipoPuestoOhs);

    return {
      action: "deleted",
      jobId: jobId ? String(jobId) : null,
      jobName: jobName || "",
      subcategoryId: String(subcategory._id),
      subcategoryName: subcategory.name || "",
      codTipoPuesto: String(subcategory.codTipoPuestoOhs),
      data: deleted,
    };
  });
};

const queueDeleteOhsPuestosFromJobSnapshot = (job) => {
  if (!job?.subcategories?.length) return;

  for (const subcategory of job.subcategories) {
    queueDeleteOhsPuestoFromSnapshot({
      jobId: job._id,
      jobName: job.name,
      subcategory,
    });
  }
};
module.exports = {
  // Endpoint manual
  syncOhsTrabajador: catchAsync(syncOhsTrabajador),

  // Trabajadores OHS
  queueSyncOhsTrabajadorForUser,
  queueBajaOhsTrabajadorForUser,
  queueReactivarOhsTrabajadorForUser,

  // Centros OHS
  queueCreateOhsCentroForWorkplace,
  queueUpdateOhsCentroForWorkplace,
  queueDeleteOhsCentroFromSnapshot,

  // Puestos OHS
  queueSyncOhsPuestoFromJobSubcategory,
  queueDeleteOhsPuestoFromSnapshot,
  queueDeleteOhsPuestosFromJobSnapshot,
};
