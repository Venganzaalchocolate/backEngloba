const mongoose = require("mongoose");
const {
  AnideCentro,
  AnideUsuariaAtendida,
  Provinces,
} = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const BED_STATUSES = ["available", "maintenance", "unusable", "reserved"];

const toId = (id, fieldName = "id") => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ClientError(`"${fieldName}" no es un ObjectId válido`, 400);
  }

  return new mongoose.Types.ObjectId(id);
};

const normalizeDocumentId = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

const buildFullName = (item = {}) =>
  `${item.firstName || ""} ${item.lastName || ""}`.trim();

const getCentroOrFail = async (centroId) => {
  const centro = await AnideCentro.findById(toId(centroId, "centroId"));

  if (!centro) {
    throw new ClientError("Centro ANIDE no encontrado", 404);
  }

  return centro;
};

const getUsuariaOrFail = async (usuariaId) => {
  const usuaria = await AnideUsuariaAtendida.findById(
    toId(usuariaId, "usuariaId")
  );

  if (!usuaria) {
    throw new ClientError("Usuaria ANIDE no encontrada", 404);
  }

  return usuaria;
};

const findHabitacion = (centro, habitacionId) => {
  const habitacion = centro.habitaciones.id(habitacionId);

  if (!habitacion) {
    throw new ClientError("Habitación no encontrada", 404);
  }

  return habitacion;
};

const findCama = (habitacion, camaId) => {
  const cama = habitacion.camas.id(camaId);

  if (!cama) {
    throw new ClientError("Cama no encontrada", 404);
  }

  return cama;
};

const getActiveStay = (usuaria) => {
  return (usuaria.staysAnide || []).find((stay) => {
    return stay.active !== false && (!stay.endDate || stay.endDate === null);
  });
};

const assertCentroHabitacionCamaValid = async ({
  centroId,
  habitacionId,
  camaId,
}) => {
  const centro = await getCentroOrFail(centroId);

  if (centro.active === false) {
    throw new ClientError("El centro ANIDE no está activo", 400);
  }

  const habitacion = findHabitacion(centro, habitacionId);

  if (habitacion.active === false) {
    throw new ClientError("La habitación no está activa", 400);
  }

  const cama = findCama(habitacion, camaId);

  if (cama.active === false) {
    throw new ClientError("La cama no está activa", 400);
  }

  if (["maintenance", "unusable", "reserved"].includes(cama.status)) {
    throw new ClientError("La cama no está disponible para asignación", 400);
  }

  return { centro, habitacion, cama };
};

const assertCamaLibre = async ({ centroId, camaId, excludeUsuariaId = null }) => {
  const query = {
    active: true,
    staysAnide: {
      $elemMatch: {
        centro: toId(centroId, "centroId"),
        camaId: toId(camaId, "camaId"),
        active: true,
        $or: [{ endDate: null }, { endDate: { $exists: false } }],
      },
    },
  };

  if (excludeUsuariaId) {
    query._id = { $ne: toId(excludeUsuariaId, "excludeUsuariaId") };
  }

  const exists = await AnideUsuariaAtendida.exists(query);

  if (exists) {
    throw new ClientError("La cama seleccionada ya está ocupada", 400);
  }
};

/* =====================================================
   CENTROS ANIDE
===================================================== */

const anideCentroManager = async (req, res) => {
  const { type } = req.body || {};

  if (!type) {
    throw new ClientError("La acción type es requerida", 400);
  }

  if (type === "list") {
    const {
      q = "",
      province,
      active,
      page = 1,
      limit = 50,
    } = req.body || {};

    const filters = {};

    if (q) {
      filters.name = { $regex: String(q).trim(), $options: "i" };
    }

    if (province && mongoose.Types.ObjectId.isValid(province)) {
      filters.province = toId(province, "province");
    }

    if (active !== undefined && active !== "") {
      filters.active = active === true || active === "true";
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;

    const total = await AnideCentro.countDocuments(filters);

    const items = await AnideCentro.find(filters)
      .populate("province", "name")
      .sort({ name: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return response(res, 200, {
      items,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    });
  }

  if (type === "get") {
    const { centroId } = req.body || {};

    const centro = await AnideCentro.findById(toId(centroId, "centroId"))
      .populate("province", "name")
      .lean();

    if (!centro) {
      throw new ClientError("Centro ANIDE no encontrado", 404);
    }

    return response(res, 200, centro);
  }

  if (type === "create") {
    const { name, province, active = true, habitaciones = [] } = req.body || {};

    if (!name) throw new ClientError("El nombre del centro es requerido", 400);
    if (!province) throw new ClientError("La provincia es requerida", 400);

    const centro = await AnideCentro.create({
      name: String(name).trim(),
      province: toId(province, "province"),
      active,
      habitaciones,
    });

    return response(res, 200, centro);
  }

  if (type === "update") {
    const { centroId, name, province, active } = req.body || {};
    const updateFields = {};

    if (name !== undefined) updateFields.name = String(name).trim();
    if (province !== undefined) updateFields.province = toId(province, "province");
    if (active !== undefined) updateFields.active = active;

    const centro = await AnideCentro.findByIdAndUpdate(
      toId(centroId, "centroId"),
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!centro) {
      throw new ClientError("Centro ANIDE no encontrado", 404);
    }

    return response(res, 200, centro);
  }

  if (type === "toggle") {
    const { centroId, active } = req.body || {};

    if (active === undefined) {
      throw new ClientError("El campo active es requerido", 400);
    }

    const centro = await AnideCentro.findByIdAndUpdate(
      toId(centroId, "centroId"),
      { $set: { active } },
      { new: true, runValidators: true }
    );

    if (!centro) {
      throw new ClientError("Centro ANIDE no encontrado", 404);
    }

    return response(res, 200, centro);
  }

  if (type === "roomAdd") {
    const { centroId, name, notes = "" } = req.body || {};

    if (!name) {
      throw new ClientError("El nombre de la habitación es requerido", 400);
    }

    const centro = await getCentroOrFail(centroId);

    centro.habitaciones.push({
      name: String(name).trim(),
      active: true,
      camas: [],
      notes,
    });

    await centro.save();

    return response(res, 200, centro);
  }

  if (type === "roomUpdate") {
    const { centroId, habitacionId, name, active, notes } = req.body || {};

    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);

    if (active === false) {
      const camasIds = (habitacion.camas || []).map((cama) => cama._id);

      const hasActiveStays = await AnideUsuariaAtendida.exists({
        active: true,
        staysAnide: {
          $elemMatch: {
            centro: centro._id,
            habitacionId: toId(habitacionId, "habitacionId"),
            camaId: { $in: camasIds },
            active: true,
            $or: [{ endDate: null }, { endDate: { $exists: false } }],
          },
        },
      });

      if (hasActiveStays) {
        throw new ClientError(
          "No se puede desactivar la habitación porque tiene camas ocupadas",
          400
        );
      }
    }

    if (name !== undefined) habitacion.name = String(name).trim();
    if (active !== undefined) habitacion.active = active;
    if (notes !== undefined) habitacion.notes = notes;

    await centro.save();

    return response(res, 200, centro);
  }

  if (type === "bedAdd") {
    const {
      centroId,
      habitacionId,
      name,
      active = true,
      status = "available",
      capacity = 1,
      notes = "",
    } = req.body || {};

    if (!name) {
      throw new ClientError("El nombre de la cama es requerido", 400);
    }

    if (!BED_STATUSES.includes(status)) {
      throw new ClientError("El estado de la cama no es válido", 400);
    }

    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);

    habitacion.camas.push({
      name: String(name).trim(),
      active,
      status,
      capacity: Math.max(Number(capacity || 1), 1),
      notes,
    });

    await centro.save();

    return response(res, 200, centro);
  }

  if (type === "bedUpdate") {
    const {
      centroId,
      habitacionId,
      camaId,
      name,
      active,
      status,
      capacity,
      notes,
    } = req.body || {};

    if (status !== undefined && !BED_STATUSES.includes(status)) {
      throw new ClientError("El estado de la cama no es válido", 400);
    }

    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);
    const cama = findCama(habitacion, camaId);

    const hasActiveStay = await AnideUsuariaAtendida.exists({
      active: true,
      staysAnide: {
        $elemMatch: {
          centro: centro._id,
          camaId: cama._id,
          active: true,
          $or: [{ endDate: null }, { endDate: { $exists: false } }],
        },
      },
    });

    if (hasActiveStay && active === false) {
      throw new ClientError("No se puede desactivar una cama ocupada", 400);
    }

    if (
      hasActiveStay &&
      ["maintenance", "unusable", "reserved"].includes(status)
    ) {
      throw new ClientError("No se puede bloquear una cama ocupada", 400);
    }

    if (name !== undefined) cama.name = String(name).trim();
    if (active !== undefined) cama.active = active;
    if (status !== undefined) cama.status = status;
    if (capacity !== undefined) cama.capacity = Math.max(Number(capacity || 1), 1);
    if (notes !== undefined) cama.notes = notes;

    await centro.save();

    return response(res, 200, centro);
  }

  throw new ClientError("Acción de centro ANIDE no soportada", 400);
};

/* =====================================================
   USUARIAS ANIDE
===================================================== */

const anideUsuariaManager = async (req, res) => {
  const { type } = req.body || {};

  if (!type) {
    throw new ClientError("La acción type es requerida", 400);
  }

  if (type === "list") {
    const {
      q = "",
      documentId = "",
      nationality = "",
      gender = "",
      active,
      centroId,
      onlyWithActiveStay = false,
      page = 1,
      limit = 50,
    } = req.body || {};

    const filters = {};

    if (q) {
      const value = String(q).trim();

      filters.$or = [
        { firstName: { $regex: value, $options: "i" } },
        { lastName: { $regex: value, $options: "i" } },
        { documentId: { $regex: normalizeDocumentId(value), $options: "i" } },
      ];
    }

    if (documentId) {
      filters.documentId = {
        $regex: normalizeDocumentId(documentId),
        $options: "i",
      };
    }

    if (nationality) {
      filters.nationality = {
        $regex: String(nationality).trim(),
        $options: "i",
      };
    }

    if (gender !== undefined && gender !== "") {
      filters.gender = gender;
    }

    if (active !== undefined && active !== "") {
      filters.active = active === true || active === "true";
    }

    if (centroId) {
      filters.staysAnide = {
        $elemMatch: {
          centro: toId(centroId, "centroId"),
          ...(onlyWithActiveStay
            ? {
                active: true,
                $or: [{ endDate: null }, { endDate: { $exists: false } }],
              }
            : {}),
        },
      };
    } else if (onlyWithActiveStay) {
      filters.staysAnide = {
        $elemMatch: {
          active: true,
          $or: [{ endDate: null }, { endDate: { $exists: false } }],
        },
      };
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;

    const total = await AnideUsuariaAtendida.countDocuments(filters);

    const items = await AnideUsuariaAtendida.find(filters)
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return response(res, 200, {
      items,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    });
  }

  if (type === "get") {
    const { usuariaId } = req.body || {};

    const usuaria = await AnideUsuariaAtendida.findById(
      toId(usuariaId, "usuariaId")
    )
      .populate("staysAnide.centro", "name province active habitaciones")
      .populate("staysAnide.province", "name")
      .lean();

    if (!usuaria) {
      throw new ClientError("Usuaria ANIDE no encontrada", 404);
    }

    return response(res, 200, usuaria);
  }

  if (type === "create") {
    const {
      firstName,
      lastName = "",
      documentId,
      birthday = null,
      nationality = "",
      gender = "",
      familyUnit = {},
      notes = "",
      createdBy = null,
    } = req.body || {};

    if (!firstName) throw new ClientError("El nombre es requerido", 400);
    if (!documentId) throw new ClientError("El documento es requerido", 400);

    const usuaria = await AnideUsuariaAtendida.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName || "").trim(),
      documentId: normalizeDocumentId(documentId),
      birthday: birthday ? new Date(birthday) : null,
      nationality: String(nationality || "").trim(),
      gender,
      familyUnit: {
        children: Number(familyUnit.children || 0),
        dependents: Number(familyUnit.dependents || 0),
        adults: Number(familyUnit.adults || 0),
        notes: String(familyUnit.notes || "").trim(),
      },
      notes,
      createdBy:
        createdBy && mongoose.Types.ObjectId.isValid(createdBy)
          ? createdBy
          : null,
    });

    return response(res, 200, usuaria);
  }

  if (type === "update") {
    const {
      usuariaId,
      firstName,
      lastName,
      documentId,
      birthday,
      nationality,
      gender,
      familyUnit,
      notes,
      active,
      updatedBy,
    } = req.body || {};

    const updateFields = {};

    if (firstName !== undefined) updateFields.firstName = String(firstName).trim();
    if (lastName !== undefined) updateFields.lastName = String(lastName || "").trim();
    if (documentId !== undefined) updateFields.documentId = normalizeDocumentId(documentId);
    if (birthday !== undefined) updateFields.birthday = birthday ? new Date(birthday) : null;
    if (nationality !== undefined) updateFields.nationality = String(nationality || "").trim();
    if (gender !== undefined) updateFields.gender = gender;
    if (notes !== undefined) updateFields.notes = notes;
    if (active !== undefined) updateFields.active = active;

    if (familyUnit !== undefined) {
      updateFields.familyUnit = {
        children: Number(familyUnit.children || 0),
        dependents: Number(familyUnit.dependents || 0),
        adults: Number(familyUnit.adults || 0),
        notes: String(familyUnit.notes || "").trim(),
      };
    }

    if (updatedBy && mongoose.Types.ObjectId.isValid(updatedBy)) {
      updateFields.updatedBy = updatedBy;
    }

    const usuaria = await AnideUsuariaAtendida.findByIdAndUpdate(
      toId(usuariaId, "usuariaId"),
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!usuaria) {
      throw new ClientError("Usuaria ANIDE no encontrada", 404);
    }

    return response(res, 200, usuaria);
  }

  if (type === "toggle") {
    const { usuariaId, active } = req.body || {};

    if (active === undefined) {
      throw new ClientError("El campo active es requerido", 400);
    }

    const usuaria = await AnideUsuariaAtendida.findByIdAndUpdate(
      toId(usuariaId, "usuariaId"),
      { $set: { active } },
      { new: true, runValidators: true }
    );

    if (!usuaria) {
      throw new ClientError("Usuaria ANIDE no encontrada", 404);
    }

    return response(res, 200, usuaria);
  }

  if (type === "aliasAdd") {
    const {
      usuariaId,
      firstName,
      lastName = "",
      changedBy = null,
      reason = "",
    } = req.body || {};

    if (!firstName) {
      throw new ClientError("El nombre del alias es requerido", 400);
    }

    const usuaria = await getUsuariaOrFail(usuariaId);

    usuaria.aliases.push({
      firstName: String(firstName).trim(),
      lastName: String(lastName || "").trim(),
      changedBy:
        changedBy && mongoose.Types.ObjectId.isValid(changedBy)
          ? changedBy
          : null,
      reason,
    });

    await usuaria.save();

    return response(res, 200, usuaria);
  }

  if (type === "assignStay") {
    const {
      usuariaId,
      centroId,
      province = null,
      habitacionId,
      camaId,
      startDate,
      companions = {},
      notes = "",
    } = req.body || {};

    if (!startDate) {
      throw new ClientError("La fecha de entrada es requerida", 400);
    }

    await assertCentroHabitacionCamaValid({ centroId, habitacionId, camaId });
    await assertCamaLibre({ centroId, camaId, excludeUsuariaId: usuariaId });

    const usuaria = await getUsuariaOrFail(usuariaId);
    const activeStay = getActiveStay(usuaria);

    if (activeStay) {
      throw new ClientError(
        "La usuaria ya tiene una estancia activa. Usa mover de cama o cerrar estancia.",
        400
      );
    }

    usuaria.staysAnide.push({
      centro: toId(centroId, "centroId"),
      province:
        province && mongoose.Types.ObjectId.isValid(province)
          ? province
          : null,
      habitacionId: toId(habitacionId, "habitacionId"),
      camaId: toId(camaId, "camaId"),
      startDate: new Date(startDate),
      endDate: null,
      active: true,
      companions: {
        children: Number(companions.children || 0),
        dependents: Number(companions.dependents || 0),
        adults: Number(companions.adults || 0),
        notes: String(companions.notes || "").trim(),
      },
      notes,
    });

    usuaria.active = true;

    await usuaria.save();

    return response(res, 200, usuaria);
  }

  if (type === "moveStay") {
    const {
      usuariaId,
      centroId,
      province = null,
      habitacionId,
      camaId,
      moveDate,
      companions = null,
      notes = "",
    } = req.body || {};

    if (!moveDate) {
      throw new ClientError("La fecha de movimiento es requerida", 400);
    }

    await assertCentroHabitacionCamaValid({ centroId, habitacionId, camaId });
    await assertCamaLibre({ centroId, camaId, excludeUsuariaId: usuariaId });

    const usuaria = await getUsuariaOrFail(usuariaId);
    const activeStay = getActiveStay(usuaria);

    if (!activeStay) {
      throw new ClientError("La usuaria no tiene una estancia activa", 400);
    }

    const nextCompanions = companions || activeStay.companions || {};

    activeStay.active = false;
    activeStay.endDate = new Date(moveDate);

    usuaria.staysAnide.push({
      centro: toId(centroId, "centroId"),
      province:
        province && mongoose.Types.ObjectId.isValid(province)
          ? province
          : null,
      habitacionId: toId(habitacionId, "habitacionId"),
      camaId: toId(camaId, "camaId"),
      startDate: new Date(moveDate),
      endDate: null,
      active: true,
      companions: {
        children: Number(nextCompanions.children || 0),
        dependents: Number(nextCompanions.dependents || 0),
        adults: Number(nextCompanions.adults || 0),
        notes: String(nextCompanions.notes || "").trim(),
      },
      notes,
    });

    await usuaria.save();

    return response(res, 200, usuaria);
  }

  if (type === "closeStay") {
    const { usuariaId, endDate, notes = "" } = req.body || {};

    if (!endDate) {
      throw new ClientError("La fecha de salida es requerida", 400);
    }

    const usuaria = await getUsuariaOrFail(usuariaId);
    const activeStay = getActiveStay(usuaria);

    if (!activeStay) {
      throw new ClientError("La usuaria no tiene una estancia activa", 400);
    }

    activeStay.active = false;
    activeStay.endDate = new Date(endDate);

    if (notes) {
      activeStay.notes = activeStay.notes
        ? `${activeStay.notes}\n${notes}`
        : notes;
    }

    await usuaria.save();

    return response(res, 200, usuaria);
  }

  throw new ClientError("Acción de usuaria ANIDE no soportada", 400);
};

/* =====================================================
   OCUPACIÓN CENTRO
===================================================== */

const anideCentroOccupancy = async (req, res) => {
  const { centroId } = req.body || {};

  const centro = await AnideCentro.findById(toId(centroId, "centroId"))
    .populate("province", "name")
    .lean();

  if (!centro) {
    throw new ClientError("Centro ANIDE no encontrado", 404);
  }

  const usuarias = await AnideUsuariaAtendida.find({
    active: true,
    staysAnide: {
      $elemMatch: {
        centro: centro._id,
        active: true,
        $or: [{ endDate: null }, { endDate: { $exists: false } }],
      },
    },
  })
    .select("_id firstName lastName documentId nationality gender familyUnit staysAnide")
    .lean();

  const occupiedByCama = {};

  usuarias.forEach((usuaria) => {
    const stay = (usuaria.staysAnide || []).find((item) => {
      return (
        String(item.centro) === String(centro._id) &&
        item.active !== false &&
        (!item.endDate || item.endDate === null)
      );
    });

    if (!stay?.camaId) return;

    occupiedByCama[String(stay.camaId)] = {
      usuariaId: String(usuaria._id),
      name: buildFullName(usuaria),
      documentId: usuaria.documentId || "",
      nationality: usuaria.nationality || "",
      gender: usuaria.gender || "",
      familyUnit: usuaria.familyUnit || {},
      companions: stay.companions || {},
      stayId: String(stay._id),
      startDate: stay.startDate,
      notes: stay.notes || "",
    };
  });

  let totalBeds = 0;
  let activeBeds = 0;
  let occupiedBeds = 0;

  const habitaciones = (centro.habitaciones || []).map((habitacion) => {
    let roomActiveBeds = 0;
    let roomOccupiedBeds = 0;

    const camas = (habitacion.camas || []).map((cama) => {
      const occupied = occupiedByCama[String(cama._id)] || null;
      const active = cama.active !== false;
      const status = cama.status || "available";
      const usable = active && status !== "unusable" && status !== "maintenance";

      totalBeds += 1;
      if (usable) activeBeds += 1;
      if (usable) roomActiveBeds += 1;

      if (occupied) {
        occupiedBeds += 1;
        roomOccupiedBeds += 1;
      }

      return {
        _id: String(cama._id),
        name: cama.name,
        active,
        status,
        capacity: cama.capacity || 1,
        notes: cama.notes || "",
        occupied: !!occupied,
        usuaria: occupied,
      };
    });

    return {
      _id: String(habitacion._id),
      name: habitacion.name,
      active: habitacion.active !== false,
      notes: habitacion.notes || "",
      camas,
      activeBeds: roomActiveBeds,
      occupiedBeds: roomOccupiedBeds,
      freeBeds: Math.max(roomActiveBeds - roomOccupiedBeds, 0),
    };
  });

  return response(res, 200, {
    centro: {
      _id: String(centro._id),
      name: centro.name,
      province: centro.province || null,
      active: centro.active !== false,
    },
    summary: {
      totalBeds,
      activeBeds,
      occupiedBeds,
      freeBeds: Math.max(activeBeds - occupiedBeds, 0),
    },
    habitaciones,
  });
};

/* =====================================================
   PRUEBA LOCAL - SEED ANIDE
   Borrar después de usar
===================================================== */

const normalizeText = (value = "") =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const findProvinceIdByName = async (name) => {
  const provinces = await Provinces.find({}).select("_id name").lean();

  const province = provinces.find((item) => {
    return normalizeText(item.name) === normalizeText(name);
  });

  if (!province) {
    console.log("Provincias disponibles:");
    provinces.forEach((item) => console.log(`- "${item.name}"`));

    throw new Error(`No se encontró la provincia: ${name}`);
  }

  return province._id;
};

const createDemoRoom = (name, totalBeds = 2, extra = {}) => ({
  name,
  active: extra.active !== false,
  notes: extra.notes || "",
  camas: Array.from({ length: totalBeds }).map((_, index) => ({
    name: `Cama ${index + 1}`,
    active: true,
    status: "available",
    capacity: 1,
    notes: "",
  })),
});

const getRoom = (centro, roomIndex) => centro.habitaciones[roomIndex];
const getBed = (room, bedIndex) => room.camas[bedIndex];

const buildDemoStay = ({
  centro,
  room,
  bed,
  startDate,
  companions = {},
  notes = "",
}) => ({
  centro: centro._id,
  province: centro.province,
  habitacionId: room._id,
  camaId: bed._id,
  startDate: new Date(startDate),
  endDate: null,
  active: true,
  companions: {
    children: Number(companions.children || 0),
    dependents: Number(companions.dependents || 0),
    adults: Number(companions.adults || 0),
    notes: String(companions.notes || "").trim(),
  },
  notes,
});

module.exports = {
  anideCentroManager: catchAsync(anideCentroManager),
  anideUsuariaManager: catchAsync(anideUsuariaManager),
  anideCentroOccupancy: catchAsync(anideCentroOccupancy),
};