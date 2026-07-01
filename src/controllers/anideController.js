const mongoose = require("mongoose");
const {
  AnideCentro,
  AnideUsuariaAtendida,
  Provinces
} = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const BED_STATUSES = ["available", "maintenance", "unusable", "reserved"];
const FAMILY_RELATIONSHIPS = ["child", "dependent"];

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

const isActiveStay = (stay) =>
  !!stay && stay.active !== false && (!stay.endDate || stay.endDate === null);

// Se reutiliza para la responsable y para cualquier familiar.
const getActiveStay = (person) =>
  (person?.staysAnide || []).find(isActiveStay) || null;

const closeStay = (stay, endDate, notes = "") => {
  stay.active = false;
  stay.endDate = new Date(endDate);

  if (notes) {
    stay.notes = stay.notes ? `${stay.notes}\n${notes}` : notes;
  }
};

const makeStay = ({ centroId, province = null, habitacionId, camaId, startDate, notes = "" }) => ({
  centro: toId(centroId, "centroId"),
  province: province && mongoose.Types.ObjectId.isValid(province) ? toId(province, "province") : null,
  habitacionId: toId(habitacionId, "habitacionId"),
  camaId: toId(camaId, "camaId"),
  startDate: new Date(startDate),
  endDate: null,
  active: true,
  notes: String(notes || "").trim(),
});

const getCentroOrFail = async (centroId) => {
  const centro = await AnideCentro.findById(toId(centroId, "centroId"));
  if (!centro) throw new ClientError("Centro ANIDE no encontrado", 404);
  return centro;
};

const getUsuariaOrFail = async (usuariaId) => {
  const usuaria = await AnideUsuariaAtendida.findById(toId(usuariaId, "usuariaId"));
  if (!usuaria) throw new ClientError("Usuaria ANIDE no encontrada", 404);
  return usuaria;
};

const getFamilyMemberOrFail = (usuaria, familyMemberId) => {
  const member = usuaria.familyMembers?.id(familyMemberId);
  if (!member) throw new ClientError("Familiar no encontrado en la unidad familiar", 404);
  return member;
};

const findHabitacion = (centro, habitacionId) => {
  const habitacion = centro.habitaciones.id(habitacionId);
  if (!habitacion) throw new ClientError("Habitación no encontrada", 404);
  return habitacion;
};

const findCama = (habitacion, camaId) => {
  const cama = habitacion.camas.id(camaId);
  if (!cama) throw new ClientError("Cama no encontrada", 404);
  return cama;
};

const assertCentroHabitacionCamaValid = async ({ centroId, habitacionId, camaId }) => {
  const centro = await getCentroOrFail(centroId);
  if (centro.active === false) throw new ClientError("El centro ANIDE no está activo", 400);

  const habitacion = findHabitacion(centro, habitacionId);
  if (habitacion.active === false) throw new ClientError("La habitación no está activa", 400);

  const cama = findCama(habitacion, camaId);
  if (cama.active === false) throw new ClientError("La cama no está activa", 400);
  if (["maintenance", "unusable", "reserved"].includes(cama.status)) {
    throw new ClientError("La cama no está disponible para asignación", 400);
  }

  return { centro, habitacion, cama };
};

/*
  Una cama está ocupada si tiene una estancia activa de la responsable
  O de cualquiera de sus familiares. Se hace en JS deliberadamente:
  evita consultas Mongo complejas e incorrectas con arrays anidados.
*/
const getActiveBedOccupant = async ({ centroId, camaId, ignoreUsuariaId = null, ignoreFamilyMemberId = null }) => {
  const users = await AnideUsuariaAtendida.find({ active: true })
    .select("_id firstName lastName staysAnide familyMembers")
    .lean();

  const wantedCentro = String(centroId);
  const wantedBed = String(camaId);

  for (const usuaria of users) {
    const userId = String(usuaria._id);

    for (const stay of usuaria.staysAnide || []) {
      if (
        isActiveStay(stay) &&
        String(stay.centro) === wantedCentro &&
        String(stay.camaId) === wantedBed &&
        !(ignoreUsuariaId && userId === String(ignoreUsuariaId))
      ) {
        return { occupantType: "primary", usuariaId: userId, stay };
      }
    }

    for (const member of usuaria.familyMembers || []) {
      for (const stay of member.staysAnide || []) {
        if (
          isActiveStay(stay) &&
          String(stay.centro) === wantedCentro &&
          String(stay.camaId) === wantedBed &&
          !(
            ignoreUsuariaId &&
            userId === String(ignoreUsuariaId) &&
            ignoreFamilyMemberId &&
            String(member._id) === String(ignoreFamilyMemberId)
          )
        ) {
          return {
            occupantType: "familyMember",
            usuariaId: userId,
            familyMemberId: String(member._id),
            stay,
          };
        }
      }
    }
  }

  return null;
};

const assertCamaLibre = async (params) => {
  const occupied = await getActiveBedOccupant(params);
  if (occupied) throw new ClientError("La cama seleccionada ya está ocupada", 400);
};

const hasActiveOccupancyInRoom = async ({ centroId, habitacionId }) => {
  const users = await AnideUsuariaAtendida.find({ active: true })
    .select("staysAnide familyMembers")
    .lean();

  return users.some((usuaria) => {
    const primaryOccupied = (usuaria.staysAnide || []).some(
      (stay) => isActiveStay(stay) && String(stay.centro) === String(centroId) && String(stay.habitacionId) === String(habitacionId)
    );
    if (primaryOccupied) return true;

    return (usuaria.familyMembers || []).some((member) =>
      (member.staysAnide || []).some(
        (stay) => isActiveStay(stay) && String(stay.centro) === String(centroId) && String(stay.habitacionId) === String(habitacionId)
      )
    );
  });
};

const hasActiveOccupancyInBed = async ({ centroId, camaId }) =>
  !!(await getActiveBedOccupant({ centroId, camaId }));

const normalizeFamilyMemberInput = (input = {}) => {
  const relationship = String(input.relationship || "").trim();
  if (!FAMILY_RELATIONSHIPS.includes(relationship)) {
    throw new ClientError("La relación familiar debe ser child o dependent", 400);
  }
  if (!String(input.firstName || "").trim()) {
    throw new ClientError("El nombre del familiar es requerido", 400);
  }

  return {
    firstName: String(input.firstName).trim(),
    lastName: String(input.lastName || "").trim(),
    birthday: input.birthday ? new Date(input.birthday) : null,
    relationship,
    documentId: normalizeDocumentId(input.documentId),
    notes: String(input.notes || "").trim(),
    active: input.active === undefined ? true : input.active === true || input.active === "true",
  };
};

const getActiveFamilyMembers = (usuaria) =>
  (usuaria.familyMembers || []).filter((member) => member.active !== false);

const normalizeAssignments = (familyAssignments = []) => {
  if (!Array.isArray(familyAssignments)) {
    throw new ClientError("familyAssignments debe ser una lista", 400);
  }
  return familyAssignments;
};

const validateFamilyAssignments = async ({
  usuaria,
  centroId,
  familyAssignments,
  requireAllActive = true,
}) => {
  const assignments = normalizeAssignments(familyAssignments);
  const activeMembers = getActiveFamilyMembers(usuaria);

  /*
    - Para una unidad activa se exige cama para todos sus familiares activos.
    - Cuando la responsable vuelve después de una salida, los familiares
      están inactivos: solo se reactivan y alojan los que vengan incluidos
      explícitamente en familyAssignments.
  */
  const requiredMembers = requireAllActive ? activeMembers : [];
  const requiredIds = new Set(requiredMembers.map((member) => String(member._id)));
  const validIds = new Set(
    (usuaria.familyMembers || []).map((member) => String(member._id))
  );

  if (requireAllActive && assignments.length !== requiredMembers.length) {
    throw new ClientError(
      "Debes asignar una cama a cada familiar activo de la unidad familiar",
      400
    );
  }

  const seenMembers = new Set();
  const seenBeds = new Set();
  const checked = [];

  for (const assignment of assignments) {
    const memberId = String(assignment.familyMemberId || "");

    if (!validIds.has(memberId) || seenMembers.has(memberId)) {
      throw new ClientError(
        "Las asignaciones familiares contienen un familiar inválido o repetido",
        400
      );
    }

    seenMembers.add(memberId);

    const habitacionId = assignment.habitacionId;
    const camaId = assignment.camaId;

    if (!habitacionId || !camaId) {
      throw new ClientError("Cada familiar debe tener habitación y cama", 400);
    }

    const bedKey = `${centroId}|${habitacionId}|${camaId}`;

    if (seenBeds.has(bedKey)) {
      throw new ClientError("No puedes asignar dos personas a la misma cama", 400);
    }

    seenBeds.add(bedKey);

    await assertCentroHabitacionCamaValid({ centroId, habitacionId, camaId });
    await assertCamaLibre({ centroId, camaId });

    checked.push({
      familyMemberId: memberId,
      habitacionId,
      camaId,
      notes: String(assignment.notes || "").trim(),
    });
  }

  if (requireAllActive) {
    const assignedIds = new Set(
      checked.map((assignment) => String(assignment.familyMemberId))
    );

    for (const memberId of requiredIds) {
      if (!assignedIds.has(memberId)) {
        throw new ClientError(
          "Debes asignar una cama a cada familiar activo de la unidad familiar",
          400
        );
      }
    }
  }

  return checked;
};

/* =====================================================
   CENTROS ANIDE
===================================================== */

const anideCentroManager = async (req, res) => {
  const { type } = req.body || {};
  if (!type) throw new ClientError("La acción type es requerida", 400);

  if (type === "list") {
    const { q = "", province, active, page = 1, limit = 50 } = req.body || {};
    const filters = {};
    if (q) filters.name = { $regex: String(q).trim(), $options: "i" };
    if (province && mongoose.Types.ObjectId.isValid(province)) filters.province = toId(province, "province");
    if (active !== undefined && active !== "") filters.active = active === true || active === "true";

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    const total = await AnideCentro.countDocuments(filters);
    const items = await AnideCentro.find(filters)
      .populate("province", "name")
      .sort({ name: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return response(res, 200, { items, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) });
  }

  if (type === "get") {
    const centro = await AnideCentro.findById(toId(req.body?.centroId, "centroId")).populate("province", "name").lean();
    if (!centro) throw new ClientError("Centro ANIDE no encontrado", 404);
    return response(res, 200, centro);
  }

  if (type === "create") {
    const { name, province, active = true, habitaciones = [] } = req.body || {};
    if (!name) throw new ClientError("El nombre del centro es requerido", 400);
    if (!province) throw new ClientError("La provincia es requerida", 400);
    const centro = await AnideCentro.create({ name: String(name).trim(), province: toId(province, "province"), active, habitaciones });
    return response(res, 200, centro);
  }

  if (type === "update" || type === "toggle") {
    const { centroId, name, province, active } = req.body || {};
    if (type === "toggle" && active === undefined) throw new ClientError("El campo active es requerido", 400);
    const updateFields = {};
    if (name !== undefined) updateFields.name = String(name).trim();
    if (province !== undefined) updateFields.province = toId(province, "province");
    if (active !== undefined) updateFields.active = active === true || active === "true";

    const centro = await AnideCentro.findByIdAndUpdate(toId(centroId, "centroId"), { $set: updateFields }, { new: true, runValidators: true });
    if (!centro) throw new ClientError("Centro ANIDE no encontrado", 404);
    return response(res, 200, centro);
  }

  if (type === "roomAdd") {
    const { centroId, name, notes = "" } = req.body || {};
    if (!name) throw new ClientError("El nombre de la habitación es requerido", 400);
    const centro = await getCentroOrFail(centroId);
    centro.habitaciones.push({ name: String(name).trim(), active: true, camas: [], notes });
    await centro.save();
    return response(res, 200, centro);
  }

  if (type === "roomUpdate") {
    const { centroId, habitacionId, name, active, notes } = req.body || {};
    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);

    if ((active === false || active === "false") && await hasActiveOccupancyInRoom({ centroId, habitacionId })) {
      throw new ClientError("No se puede desactivar la habitación porque tiene camas ocupadas", 400);
    }

    if (name !== undefined) habitacion.name = String(name).trim();
    if (active !== undefined) habitacion.active = active === true || active === "true";
    if (notes !== undefined) habitacion.notes = notes;
    await centro.save();
    return response(res, 200, centro);
  }

  if (type === "bedAdd") {
    const { centroId, habitacionId, name, active = true, status = "available", capacity = 1, notes = "" } = req.body || {};
    if (!name) throw new ClientError("El nombre de la cama es requerido", 400);
    if (!BED_STATUSES.includes(status)) throw new ClientError("El estado de la cama no es válido", 400);
    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);
    habitacion.camas.push({ name: String(name).trim(), active: active !== false && active !== "false", status, capacity: Math.max(Number(capacity || 1), 1), notes });
    await centro.save();
    return response(res, 200, centro);
  }

  if (type === "bedUpdate") {
    const { centroId, habitacionId, camaId, name, active, status, capacity, notes } = req.body || {};
    if (status !== undefined && !BED_STATUSES.includes(status)) throw new ClientError("El estado de la cama no es válido", 400);
    const centro = await getCentroOrFail(centroId);
    const habitacion = findHabitacion(centro, habitacionId);
    const cama = findCama(habitacion, camaId);
    const occupied = await hasActiveOccupancyInBed({ centroId, camaId });

    if (occupied && (active === false || active === "false")) throw new ClientError("No se puede desactivar una cama ocupada", 400);
    if (occupied && status !== undefined && ["maintenance", "unusable", "reserved"].includes(status)) {
      throw new ClientError("No se puede bloquear una cama ocupada", 400);
    }

    if (name !== undefined) cama.name = String(name).trim();
    if (active !== undefined) cama.active = active === true || active === "true";
    if (status !== undefined) cama.status = status;
    if (capacity !== undefined) cama.capacity = Math.max(Number(capacity || 1), 1);
    if (notes !== undefined) cama.notes = notes;
    await centro.save();
    return response(res, 200, centro);
  }

  throw new ClientError("Acción de centro ANIDE no soportada", 400);
};

/* =====================================================
   USUARIAS ANIDE Y UNIDADES FAMILIARES
===================================================== */

const anideUsuariaManager = async (req, res) => {
  const { type } = req.body || {};
  if (!type) throw new ClientError("La acción type es requerida", 400);

  if (type === "list") {
    const { q = "", documentId = "", nationality = "", gender = "", active, centroId, onlyWithActiveStay = false, page = 1, limit = 50 } = req.body || {};
    const filters = {};
if (q) {
  const value = String(q).trim();
  const normalizedDocument = normalizeDocumentId(value);

  /*
    Se busca en:
    - Nombre y apellidos actuales.
    - Documento / identificador.
    - Todos los nombres guardados en aliases:
      historial de cambios de nombre.
  */
  filters.$or = [
    { firstName: { $regex: value, $options: "i" } },
    { lastName: { $regex: value, $options: "i" } },
    { documentId: { $regex: normalizedDocument, $options: "i" } },

    { "aliases.firstName": { $regex: value, $options: "i" } },
    { "aliases.lastName": { $regex: value, $options: "i" } },
  ];
}

    if (documentId) filters.documentId = { $regex: normalizeDocumentId(documentId), $options: "i" };
    if (nationality) filters.nationality = { $regex: String(nationality).trim(), $options: "i" };
    if (gender !== undefined && gender !== "") filters.gender = gender;
    if (active !== undefined && active !== "") filters.active = active === true || active === "true";

    if (centroId || onlyWithActiveStay) {
      const stayMatch = { active: true, $or: [{ endDate: null }, { endDate: { $exists: false } }] };
      if (centroId) stayMatch.centro = toId(centroId, "centroId");
      filters.staysAnide = { $elemMatch: stayMatch };
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    const total = await AnideUsuariaAtendida.countDocuments(filters);
    const items = await AnideUsuariaAtendida.find(filters).sort({ updatedAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    return response(res, 200, { items, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) });
  }

  if (type === "get") {
    const usuaria = await AnideUsuariaAtendida.findById(toId(req.body?.usuariaId, "usuariaId"))
      .populate("staysAnide.centro", "name province active habitaciones")
      .populate("staysAnide.province", "name")
      .populate("familyMembers.staysAnide.centro", "name province active habitaciones")
      .populate("familyMembers.staysAnide.province", "name")
      .lean();
    if (!usuaria) throw new ClientError("Usuaria ANIDE no encontrada", 404);
    return response(res, 200, usuaria);
  }

  if (type === "create") {
    const { firstName, lastName = "", documentId, birthday = null, nationality = "", gender = "", notes = "", createdBy = null } = req.body || {};
    if (!firstName) throw new ClientError("El nombre es requerido", 400);
    if (!documentId) throw new ClientError("El documento es requerido", 400);
    const usuaria = await AnideUsuariaAtendida.create({
      firstName: String(firstName).trim(), lastName: String(lastName || "").trim(), documentId: normalizeDocumentId(documentId),
      birthday: birthday ? new Date(birthday) : null, nationality: String(nationality || "").trim(), gender, notes,
      createdBy: createdBy && mongoose.Types.ObjectId.isValid(createdBy) ? toId(createdBy, "createdBy") : null,
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
      notes,
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

    if (updatedBy && mongoose.Types.ObjectId.isValid(updatedBy)) {
      updateFields.updatedBy = toId(updatedBy, "updatedBy");
    }

    const usuaria = await AnideUsuariaAtendida.findByIdAndUpdate(
      toId(usuariaId, "usuariaId"),
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!usuaria) throw new ClientError("Usuaria ANIDE no encontrada", 404);

    return response(res, 200, usuaria);
  }

  if (type === "toggle") {
    throw new ClientError(
      "El estado de una usuaria se gestiona mediante alojamiento y salida, no manualmente.",
      400
    );
  }

  if (type === "aliasAdd") {
    const { usuariaId, firstName, lastName = "", changedBy = null, reason = "" } = req.body || {};
    if (!firstName) throw new ClientError("El nombre del alias es requerido", 400);
    const usuaria = await getUsuariaOrFail(usuariaId);
    usuaria.aliases.push({ firstName: String(firstName).trim(), lastName: String(lastName || "").trim(), changedBy: changedBy && mongoose.Types.ObjectId.isValid(changedBy) ? toId(changedBy, "changedBy") : null, reason });
    await usuaria.save();
    return response(res, 200, usuaria);
  }

  // Se reutiliza el mismo manager/type. No se crea ruta adicional.
  if (type === "familyMemberAdd") {
    const { usuariaId } = req.body || {};
    const usuaria = await getUsuariaOrFail(usuariaId);
    usuaria.familyMembers.push(normalizeFamilyMemberInput(req.body || {}));
    await usuaria.save();
    return response(res, 200, usuaria);
  }

  if (type === "familyMemberUpdate") {
    const { usuariaId, familyMemberId, firstName, lastName, birthday, relationship, documentId, notes } = req.body || {};
    const usuaria = await getUsuariaOrFail(usuariaId);
    const member = getFamilyMemberOrFail(usuaria, familyMemberId);

    if (firstName !== undefined && !String(firstName).trim()) throw new ClientError("El nombre del familiar es requerido", 400);
    if (relationship !== undefined && !FAMILY_RELATIONSHIPS.includes(relationship)) throw new ClientError("La relación familiar debe ser child o dependent", 400);

    if (firstName !== undefined) member.firstName = String(firstName).trim();
    if (lastName !== undefined) member.lastName = String(lastName || "").trim();
    if (birthday !== undefined) member.birthday = birthday ? new Date(birthday) : null;
    if (relationship !== undefined) member.relationship = relationship;
    if (documentId !== undefined) member.documentId = normalizeDocumentId(documentId);
    if (notes !== undefined) member.notes = String(notes || "").trim();

    await usuaria.save();
    return response(res, 200, usuaria);
  }

  if (type === "assignStay") {
    const {
      usuariaId,
      familyMemberId = null,
      centroId,
      province = null,
      habitacionId,
      camaId,
      startDate,
      familyAssignments = [],
      notes = "",
    } = req.body || {};

    if (!startDate) {
      throw new ClientError("La fecha de entrada es requerida", 400);
    }

    const usuaria = await getUsuariaOrFail(usuariaId);

    await assertCentroHabitacionCamaValid({ centroId, habitacionId, camaId });

    /*
      Reutilizamos assignStay para volver a alojar individualmente a un menor
      o persona dependiente. Nunca puede asignarse fuera de la vivienda actual
      de la responsable.
    */
    if (familyMemberId) {
      const responsibleStay = getActiveStay(usuaria);

      if (!responsibleStay) {
        throw new ClientError(
          "No se puede volver a alojar a un familiar si la responsable no está alojada.",
          400
        );
      }

      if (String(responsibleStay.centro) !== String(centroId)) {
        throw new ClientError(
          "Un menor o persona dependiente solo puede alojarse en la vivienda de su responsable.",
          400
        );
      }

      const member = getFamilyMemberOrFail(usuaria, familyMemberId);

      if (getActiveStay(member)) {
        throw new ClientError("El familiar ya tiene una estancia activa.", 400);
      }

      await assertCamaLibre({ centroId, camaId });

      member.staysAnide.push(
        makeStay({
          centroId,
          province,
          habitacionId,
          camaId,
          startDate,
          notes,
        })
      );

      member.active = true;

      await usuaria.save();
      return response(res, 200, usuaria);
    }

    if (getActiveStay(usuaria)) {
      throw new ClientError(
        "La usuaria ya tiene una estancia activa. Usa mover de cama o cerrar estancia.",
        400
      );
    }

    await assertCamaLibre({ centroId, camaId });

    /*
      Si la responsable estaba fuera, todos los familiares estarán inactivos.
      En ese caso familyAssignments indica cuáles vuelven con ella y deben
      reactivarse. Si la unidad sigue activa, se exige cama para todos los
      familiares activos.
    */
    const familyChecked = await validateFamilyAssignments({
      usuaria,
      centroId,
      familyAssignments,
      requireAllActive: getActiveFamilyMembers(usuaria).length > 0,
    });

    const occupiedKeys = new Set([`${centroId}|${habitacionId}|${camaId}`]);

    familyChecked.forEach((item) => {
      occupiedKeys.add(`${centroId}|${item.habitacionId}|${item.camaId}`);
    });

    if (occupiedKeys.size !== familyChecked.length + 1) {
      throw new ClientError(
        "No puedes asignar dos personas de la unidad a la misma cama",
        400
      );
    }

    usuaria.staysAnide.push(
      makeStay({
        centroId,
        province,
        habitacionId,
        camaId,
        startDate,
        notes,
      })
    );

    familyChecked.forEach((assignment) => {
      const member = getFamilyMemberOrFail(usuaria, assignment.familyMemberId);

      member.staysAnide.push(
        makeStay({
          centroId,
          province,
          habitacionId: assignment.habitacionId,
          camaId: assignment.camaId,
          startDate,
          notes: assignment.notes,
        })
      );

      member.active = true;
    });

    usuaria.active = true;

    await usuaria.save();
    return response(res, 200, usuaria);
  }

  if (type === "moveStay") {
    const { usuariaId, familyMemberId = null, centroId, province = null, habitacionId, camaId, moveDate, familyAssignments = [], notes = "" } = req.body || {};
    if (!moveDate) throw new ClientError("La fecha de movimiento es requerida", 400);
    const usuaria = await getUsuariaOrFail(usuariaId);

    await assertCentroHabitacionCamaValid({ centroId, habitacionId, camaId });

    // Movimiento individual de un menor/dependiente: nunca cambia de vivienda.
    if (familyMemberId) {
      const responsibleStay = getActiveStay(usuaria);
      if (!responsibleStay) throw new ClientError("La responsable no tiene una estancia activa", 400);
      if (String(responsibleStay.centro) !== String(centroId)) {
        throw new ClientError("Un menor o persona dependiente solo puede trasladarse dentro de la vivienda de su responsable", 400);
      }

      const member = getFamilyMemberOrFail(usuaria, familyMemberId);
      const activeStay = getActiveStay(member);
      if (!activeStay) throw new ClientError("El familiar no tiene una estancia activa", 400);
      await assertCamaLibre({ centroId, camaId, ignoreUsuariaId: usuariaId, ignoreFamilyMemberId: familyMemberId });

      closeStay(activeStay, moveDate, notes);
      member.staysAnide.push(
        makeStay({ centroId, province, habitacionId, camaId, startDate: moveDate, notes })
      );
      member.active = true;
      await usuaria.save();
      return response(res, 200, usuaria);
    }

    // Movimiento de responsable. Dentro de la misma vivienda se mueve solo ella.
    const currentStay = getActiveStay(usuaria);
    if (!currentStay) throw new ClientError("La usuaria no tiene una estancia activa", 400);
    await assertCamaLibre({ centroId, camaId, ignoreUsuariaId: usuariaId });

    const changesCentro = String(currentStay.centro) !== String(centroId);
    if (!changesCentro) {
      closeStay(currentStay, moveDate, notes);
      usuaria.staysAnide.push(makeStay({ centroId, province, habitacionId, camaId, startDate: moveDate, notes }));
      await usuaria.save();
      return response(res, 200, usuaria);
    }

    // Si cambia de vivienda, toda la unidad se traslada obligatoriamente.
    const familyChecked = await validateFamilyAssignments({ usuaria, centroId, familyAssignments, startDate: moveDate });
    const occupiedKeys = new Set([`${centroId}|${habitacionId}|${camaId}`]);
    familyChecked.forEach((item) => occupiedKeys.add(`${centroId}|${item.habitacionId}|${item.camaId}`));
    if (occupiedKeys.size !== familyChecked.length + 1) throw new ClientError("No puedes asignar dos personas de la unidad a la misma cama", 400);

    closeStay(currentStay, moveDate, notes);
    usuaria.staysAnide.push(makeStay({ centroId, province, habitacionId, camaId, startDate: moveDate, notes }));

    getActiveFamilyMembers(usuaria).forEach((member) => {
      const previousStay = getActiveStay(member);
      if (previousStay) closeStay(previousStay, moveDate, `Traslado junto a la responsable. ${notes}`.trim());
      const assignment = familyChecked.find((item) => String(item.familyMemberId) === String(member._id));
      member.staysAnide.push(
        makeStay({
          centroId,
          province,
          habitacionId: assignment.habitacionId,
          camaId: assignment.camaId,
          startDate: moveDate,
          notes: assignment.notes || "Traslado junto a la responsable",
        })
      );
      member.active = true;
    });

    usuaria.active = true;
    await usuaria.save();
    return response(res, 200, usuaria);
  }

  if (type === "closeStay") {
    const {
      usuariaId,
      familyMemberId = null,
      endDate,
      notes = "",
    } = req.body || {};

    if (!endDate) {
      throw new ClientError("La fecha de salida es requerida", 400);
    }

    const usuaria = await getUsuariaOrFail(usuariaId);

    // Salida individual de menor/persona dependiente.
    if (familyMemberId) {
      const member = getFamilyMemberOrFail(usuaria, familyMemberId);
      const stay = getActiveStay(member);

      if (!stay) {
        throw new ClientError("El familiar no tiene una estancia activa", 400);
      }

      closeStay(stay, endDate, notes);
      member.active = false;

      await usuaria.save();
      return response(res, 200, usuaria);
    }

    /*
      La responsable es el eje de la unidad:
      su salida cierra y desactiva a todos los familiares que estén alojados,
      además de marcarla a ella como inactiva.
    */
    const stay = getActiveStay(usuaria);

    if (!stay) {
      throw new ClientError("La usuaria no tiene una estancia activa", 400);
    }

    closeStay(stay, endDate, notes);

    (usuaria.familyMembers || []).forEach((member) => {
      const familyStay = getActiveStay(member);

      if (familyStay) {
        closeStay(
          familyStay,
          endDate,
          `Salida junto a la responsable. ${notes}`.trim()
        );
      }

      member.active = false;
    });

    usuaria.active = false;

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
  const centro = await AnideCentro.findById(toId(centroId, "centroId")).populate("province", "name").lean();
  if (!centro) throw new ClientError("Centro ANIDE no encontrado", 404);

  const usuarias = await AnideUsuariaAtendida.find({ active: true })
    .select("_id firstName lastName documentId nationality gender staysAnide familyMembers")
    .lean();

  const occupiedByCama = {};
  const centerKey = String(centro._id);

  usuarias.forEach((usuaria) => {
    const responsibleName = buildFullName(usuaria);
    const primaryStay = (usuaria.staysAnide || []).find((stay) => isActiveStay(stay) && String(stay.centro) === centerKey);
    if (primaryStay?.camaId) {
      occupiedByCama[String(primaryStay.camaId)] = {
        occupantType: "primary",
        usuariaId: String(usuaria._id),
        name: responsibleName,
        documentId: usuaria.documentId || "",
        nationality: usuaria.nationality || "",
        gender: usuaria.gender || "",
        responsibleId: String(usuaria._id),
        responsibleName,
        stayId: String(primaryStay._id),
        startDate: primaryStay.startDate,
        notes: primaryStay.notes || "",
      };
    }

    (usuaria.familyMembers || []).forEach((member) => {
      const familyStay = (member.staysAnide || []).find((stay) => isActiveStay(stay) && String(stay.centro) === centerKey);
      if (!familyStay?.camaId) return;
      occupiedByCama[String(familyStay.camaId)] = {
        occupantType: "familyMember",
        usuariaId: String(usuaria._id),
        familyMemberId: String(member._id),
        relationship: member.relationship,
        name: buildFullName(member),
        documentId: member.documentId || "",
        responsibleId: String(usuaria._id),
        responsibleName,
        stayId: String(familyStay._id),
        startDate: familyStay.startDate,
        notes: familyStay.notes || "",
      };
    });
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
      const usable = active && !["unusable", "maintenance", "reserved"].includes(status);
      totalBeds += 1;
      if (usable) { activeBeds += 1; roomActiveBeds += 1; }
      if (occupied) { occupiedBeds += 1; roomOccupiedBeds += 1; }
      return { _id: String(cama._id), name: cama.name, active, status, capacity: cama.capacity || 1, notes: cama.notes || "", occupied: !!occupied, usuaria: occupied };
    });
    return { _id: String(habitacion._id), name: habitacion.name, active: habitacion.active !== false, notes: habitacion.notes || "", camas, activeBeds: roomActiveBeds, occupiedBeds: roomOccupiedBeds, freeBeds: Math.max(roomActiveBeds - roomOccupiedBeds, 0) };
  });

  return response(res, 200, {
    centro: { _id: String(centro._id), name: centro.name, province: centro.province || null, active: centro.active !== false },
    summary: { totalBeds, activeBeds, occupiedBeds, freeBeds: Math.max(activeBeds - occupiedBeds, 0) },
    habitaciones,
  });
};


module.exports = {
  anideCentroManager: catchAsync(anideCentroManager),
  anideUsuariaManager: catchAsync(anideUsuariaManager),
  anideCentroOccupancy: catchAsync(anideCentroOccupancy),
};
