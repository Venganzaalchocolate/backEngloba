// controllers/volunteerApplicationController.js
const mongoose = require("mongoose");
const { catchAsync, response, ClientError, toId } = require("../utils/indexUtils");
const { Provinces, Studies, Program, VolunteerApplication, Dispositive } = require("../models/indexModels");
const provinces = require("../models/provinces");

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);

const PROGRAM_AREA_ENUM = [
  "igualdad",
  "desarrollo comunitario",
  "lgtbiq",
  "infancia y juventud",
  "personas con discapacidad",
  "mayores",
];

const STATE_ENUM = ["no asignado", "activo", "descartado", "pendiente"];
const GENDER=['male', 'female', 'others', 'nonBinary']


const sanitizeObjectIds = (arr) =>
  (arr || [])
    .map((x) => (typeof x === "object" && x?._id ? x._id : x))
    .map((x) => String(x).trim())
    .filter((x) => isValidId(x))
    .map((x) => new mongoose.Types.ObjectId(x));

const sanitizeAreas = (arr) =>
  (arr || [])
    .map((x) => String(x || "").trim())
    .filter((x) => PROGRAM_AREA_ENUM.includes(x));


const sanitizeIdsArray = (arr) =>
  (arr || [])
    .map((x) => (typeof x === "object" && x?._id ? x._id : x))
    .map((x) => String(x))
    .filter((x) => isValidId(x));

    // helpers/stateVolunteer.js (o dentro del controller, arriba)
const computeVolunteerState = ({ chronology = [] }) => {
  const hasChronology = Array.isArray(chronology) && chronology.length > 0;

  const hasOpenChronology = hasChronology
    ? chronology.some((c) => !c?.endAt) // endAt null/undefined/""
    : false;

  if (hasOpenChronology) return "activo";

  if (hasChronology) {
    // si hay cronología y no hay ninguna abierta -> todas cerradas
    return "descartado";
  }

  return "no asignado";
};

// dentro del controller (o helper)
const syncVolunteerState = async (id) => {
   const doc = await VolunteerApplication.findById(id)
    .select("state chronology interview")
    .lean();
  if (!doc) throw new ClientError("Solicitud no encontrada", 404);

  const nextState = computeVolunteerState(doc);

  if (doc.state !== nextState) {
    await VolunteerApplication.updateOne({ _id: id }, { $set: { state: nextState } });
  }

  // ✅ doc completo para el front
  return VolunteerApplication.findById(id)
    .populate([
      { path: "programInterest", select: "name acronym area active" },
      { path: "internalNotes.userId", select: "firstName lastName email" },
      { path: "interview.userId", select: "firstName lastName email" },
    ])
    .lean();
};


/**
 * CREATE
 * - programInterest puede venir vacío
 * - areaInterest puede venir vacío
 * - province/studies/programs se validan si vienen
 * - disableAt se calcula en el schema (pre-validate) si no viene
 */
const createVolunteerApplication = async (req, res) => {
  const {
    firstName,
    lastName,
    birthDate,
    documentId,
    phone,
    email,
    province,
    localidad,
    occupation,
    occupationOtherText,
    studies,
    studiesOtherText,
    availability,
    programInterest,
    areaInterest,
    referralSource,
    form,
    userNote,
    gender
  } = req.body;

  if (!firstName) throw new ClientError("Falta firstName", 400);
  if (!lastName) throw new ClientError("Falta lastName", 400);
  if (!birthDate) throw new ClientError("Falta birthDate", 400);
  if (!documentId) throw new ClientError("Falta documentId", 400);
  if (!phone) throw new ClientError("Falta phone", 400);
  if (!email) throw new ClientError("Falta email", 400);
  if (!province) throw new ClientError("Falta province", 400);
  if (!localidad) throw new ClientError("Falta localidad", 400);
  if (!occupation) throw new ClientError("Falta occupation", 400);
  if (!availability) throw new ClientError("Falta availability", 400);
  if (!referralSource) throw new ClientError("Falta referralSource", 400);
 

  if (gender === undefined || gender === null || String(gender).trim() === "") {
  throw new ClientError("Falta género", 400);
}

const g = String(gender).trim(); // si quieres case-insensitive: .toLowerCase()
if (!GENDER.includes(g)) {
  throw new ClientError("Género inválido", 400);
}


  if (!isValidId(province)) throw new ClientError("province inválido", 400);

  const occArr = occupation || [];
  if (!occArr.length) throw new ClientError("occupation debe tener al menos una opción", 400);

  const studiesArr = sanitizeIdsArray(studies || []);
  const programsArr = sanitizeIdsArray(programInterest || []);

  const areasArr = (areaInterest || [])
    .map((x) => String(x))
    .filter((x) => PROGRAM_AREA_ENUM.includes(x));

  if (!programsArr.length && !areasArr.length) {
    throw new ClientError("Debes indicar programInterest o areaInterest", 400);
  }

  // Construimos el payload base
  const payload = {
    firstName,
    lastName,
    birthDate,
    documentId,
    phone,
    email,
    province,
    localidad,
    occupation: occArr,
    occupationOtherText: occupationOtherText || "",
    studies: studiesArr,
    studiesOtherText: studiesOtherText || "",
    availability,
    programInterest: programsArr,
    areaInterest: areasArr,
    referralSource,
    active: true,
    userNote: userNote || "",
    gender: g

  };

  

  // Solo setear form si viene (para no pisarlo con undefined)
  if (form) payload.form = form;

  // UPDATE si existe documentId, CREATE si no existe (upsert)
  const doc = await VolunteerApplication.findOneAndUpdate(
    { documentId },
    { $set: payload },
    {
      new: true,               // devuelve el doc ya actualizado/creado
      upsert: true,            // si no existe, lo crea
      runValidators: true,     // valida en update también
      setDefaultsOnInsert: true,
    }
  );

  response(res, 200, doc);
};

/**
 * READ (by id)
 * - populate province, studies, programs
 */
const getVolunteerApplicationById = async (req, res) => {
  const { volunteerApplicationId } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);

  const doc = await VolunteerApplication.findById(id)
    .populate([
      { path: "programInterest", select: "name acronym area active" },
      { path: "internalNotes.userId", select: "firstName lastName email" },
      { path: "interview.userId", select: "firstName lastName email" },
    ])
    .lean();

  if (!doc) throw new ClientError("Solicitud no encontrada", 404);
  response(res, 200, doc);
};

/**
 * LIST (filtros básicos)
 * body: { active, province, programId, area, q, page, limit }
 */
const listVolunteerApplications = async (req, res) => {
  const {
    active,
    province,
    programId,
    area,
    q,
    page = 1,
    limit = 25,
  } = req.body || {};

  const query = {};

  if (active !== undefined) query.active = !!active;
  if (province !== undefined) {
    if (province && !isValidId(province)) throw new ClientError("province inválido", 400);
    if (province) query.province = province;
  }
  if (programId !== undefined) {
    if (programId && !isValidId(programId)) throw new ClientError("programId inválido", 400);
    if (programId) query.programInterest = new mongoose.Types.ObjectId(programId);
  }
  if (area !== undefined) {
    if (area && !PROGRAM_AREA_ENUM.includes(area)) throw new ClientError("area inválida", 400);
    if (area) query.areaInterest = area;
  }

  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    query.$or = [
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { documentId: rx },
      { localidad: rx },
      { phone: rx }, 
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    VolunteerApplication.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .select(
        "firstName lastName province areaInterest active disableAt internalNotes disabledAt createdAt state"
      )
      .populate([
        { path: "programInterest", select: "name acronym area" },
      ])
      .lean(),
    VolunteerApplication.countDocuments(query),
  ]);

  response(res, 200, {
    items,
    page: p,
    limit: l,
    total,
    pages: Math.ceil(total / l),
  });
};

/**
 * UPDATE
 * - update campos básicos
 * - programInterest (array) puede quedar vacío, pero si queda vacío debe haber areaInterest
 */
const updateVolunteerApplication = async (req, res) => {
  const {
    volunteerApplicationId,
    firstName,
    lastName,
    birthDate,
    documentId,
    phone,
    email,
    province,
    localidad,
    occupation,
    occupationOtherText,
    studies,
    studiesOtherText,
    availability,
    programInterest,
    areaInterest,
    referralSource,
    active,
    disableAt,
    disabledReason,
    userNote,
    chronologyAdd,
    state,
    gender
  } = req.body;

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);
  const current = await VolunteerApplication.findById(id);
  if (!current) throw new ClientError("Solicitud no encontrada", 404);

  const update = {};

  if (firstName !== undefined) update.firstName = firstName;
  if (lastName !== undefined) update.lastName = lastName;
  if (birthDate !== undefined) update.birthDate = birthDate;
  if (documentId !== undefined) update.documentId = documentId;
  if (phone !== undefined) update.phone = phone;
  if (email !== undefined) update.email = email;

  if (province !== undefined) {
    if (!isValidId(province)) throw new ClientError("province inválido", 400);
    update.province = province;
  }

    if (gender !== undefined) {
    const g = String(gender || "").trim();
    if (!GENDER.includes(g)) {
      throw new ClientError("Género inválido", 400);
    }
    update.gender = g;
  }
  if (localidad !== undefined) update.localidad = localidad;

  if (occupation !== undefined) {
    const occArr = occupation || [];
    update.occupation = occArr;
    if (!occArr.includes("otro")) update.occupationOtherText = "";
  }
  if (occupationOtherText !== undefined) update.occupationOtherText = occupationOtherText;

  if (studies !== undefined) {
    const studiesArr = sanitizeIdsArray(studies || []);
    update.studies = studiesArr;
  }
  if (studiesOtherText !== undefined) update.studiesOtherText = studiesOtherText;

  if (availability !== undefined) update.availability = availability;

  if (programInterest !== undefined) {
    const programsArr = sanitizeIdsArray(programInterest || []);
    update.programInterest = programsArr;
  }

  if (areaInterest !== undefined) {
    const areasArr = (areaInterest || [])
      .map((x) => String(x))
      .filter((x) => PROGRAM_AREA_ENUM.includes(x));
    update.areaInterest = areasArr;
  }

  if (referralSource !== undefined) update.referralSource = referralSource;

  if (userNote !== undefined) update.userNote = userNote;

  // ✅ STATE
  if (state !== undefined) {
    const s = String(state || "").trim();
    if (!STATE_ENUM.includes(s)) {
      throw new ClientError("state inválido", 400);
    }
    update.state = s;
  }
  // activar/desactivar manualmente (además del cron)
  if (active !== undefined) {
    update.active = !!active;
    if (!update.active) update.disabledAt = new Date();
  }

  if (disableAt !== undefined) update.disableAt = disableAt;
  if (disabledReason !== undefined) update.disabledReason = disabledReason;

  // Regla de negocio: después del update, debe haber programas o áreas
  const nextPrograms =
    update.programInterest !== undefined ? update.programInterest : current.programInterest || [];
  const nextAreas =
    update.areaInterest !== undefined ? update.areaInterest : current.areaInterest || [];

  if ((!nextPrograms || !nextPrograms.length) && (!nextAreas || !nextAreas.length)) {
    throw new ClientError("Debes indicar programInterest o areaInterest", 400);
  }
  // =========================
  // CHRONOLOGY (append)
  // =========================
  const push = {};
  
  if (chronologyAdd !== undefined && chronologyAdd !== null) {
    const { startAt, endAt, dispositive, hours, notes } = chronologyAdd;

    if (!startAt) throw new ClientError("Falta chronologyAdd.startAt", 400);
    if (!dispositive) throw new ClientError("Falta chronologyAdd.dispositive", 400);
    if (hours === undefined || hours === null) throw new ClientError("Falta chronologyAdd.hours", 400);

    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) throw new ClientError("chronologyAdd.startAt inválido", 400);

    let endDate = null;
    if (endAt) {
      endDate = new Date(endAt);
      if (Number.isNaN(endDate.getTime())) throw new ClientError("chronologyAdd.endAt inválido", 400);
      if (endDate < startDate) throw new ClientError("chronologyAdd.endAt no puede ser anterior a startAt", 400);
    }

    if (!isValidId(dispositive)) throw new ClientError("chronologyAdd.dispositive inválido", 400);
    const dispExists = await Dispositive.exists({ _id: dispositive });
    if (!dispExists) throw new ClientError("chronologyAdd.dispositive no existe", 404);

    const h = Number(hours);
    if (Number.isNaN(h) || h < 0) throw new ClientError("chronologyAdd.hours inválido", 400);

    push.chronology = {
      startAt: startDate,
      endAt: endDate,
      dispositive: new mongoose.Types.ObjectId(dispositive),
      hours: h,
      notes: notes ? String(notes) : "",
      createdAt: new Date(),
      createdBy: req.user?._id ? new mongoose.Types.ObjectId(req.user._id) : null,
    };
  }

  const updateOps = { $set: update };
  if (Object.keys(push).length) updateOps.$push = push;

  const updated = await VolunteerApplication.findByIdAndUpdate(
    id,
    updateOps,
    { new: true }
  );

  return response(res, 200, updated);
};

/**
 * DELETE (hard delete)
 * Si prefieres NO borrar nunca, cambia esto por soft-delete (active:false).
 */
const deleteVolunteerApplication = async (req, res) => {
  const { volunteerApplicationId } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);

  const exists = await VolunteerApplication.exists({ _id: id });
  if (!exists) throw new ClientError("Solicitud no encontrada", 404);

  await VolunteerApplication.deleteOne({ _id: id });
  return response(res, 200, { ok: true, volunteerApplicationId: String(id) });
};

/**
 * SOFT DELETE / DISABLE (recomendado)
 */
const disableVolunteerApplication = async (req, res) => {
  const { volunteerApplicationId, disabledReason = "manual_disable" } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);

  const updated = await VolunteerApplication.findByIdAndUpdate(
    id,
    { $set: { active: false, disabledAt: new Date(), disabledReason } },
    { new: true }
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);
  return response(res, 200, updated);
};

const addInternalNote = async (req, res) => {
  const { volunteerApplicationId, note, userId } = req.body; 
  // userId: si ya tienes auth en req.user._id, usa ese y no lo pases por body.

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (!note) throw new ClientError("Falta note", 400);

  const id = toId(volunteerApplicationId);
  const authorId = userId || req.user?._id; // ajusta a tu auth real
  if (!authorId) throw new ClientError("Falta userId (autor de la nota)", 400);
  if (!isValidId(authorId)) throw new ClientError("userId inválido", 400);

const updated = await VolunteerApplication.findByIdAndUpdate(
  id,
  {
    $push: {
      internalNotes: {
        userId: new mongoose.Types.ObjectId(authorId),
        note,
        createdAt: new Date(),
      },
    },
  },
  { new: true }
)
  .populate([
      { path: "programInterest", select: "name acronym area active" },
      { path: "internalNotes.userId", select: "firstName lastName email" },
      { path: "interview.userId", select: "firstName lastName email" },
    ])
  .lean();

if (!updated) throw new ClientError("Solicitud no encontrada", 404);

// si quieres devolver SOLO el array:
response(res, 200, updated);
};


// =========================
// CHRONOLOGY helpers
// =========================
const parseDateOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const resolveAuthorId = (req) => {
  const id = req.user?._id || null;
  return id && isValidId(id) ? new mongoose.Types.ObjectId(id) : null;
};

// =========================
// CHRONOLOGY (ADD)
// body: { volunteerApplicationId, startAt, endAt?, dispositive, hours, notes? }
// =========================
const volunteerAddChronology = async (req, res) => {
  const {
    volunteerApplicationId,
    startAt,
    endAt,
    hours,
    notes = "",
    dispositives, // array opcional
    areas,        // array
    provinces,    // array
  } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (!startAt) throw new ClientError("Falta startAt", 400);
  if (hours === undefined || hours === null) throw new ClientError("Falta hours", 400);

  const id = toId(volunteerApplicationId);

  const s = parseDateOrNull(startAt);
  if (!s) throw new ClientError("startAt inválido", 400);

  const e = parseDateOrNull(endAt);
  if (e && e < s) throw new ClientError("endAt no puede ser anterior a startAt", 400);

  const h = Number(hours);
  if (Number.isNaN(h) || h < 0) throw new ClientError("hours inválido", 400);

  const dispositivesArr = sanitizeObjectIds(dispositives || []);
  const provincesArr = sanitizeObjectIds(provinces || []);
  const areasArr = sanitizeAreas(areas || []);

  // si quieres exigir algo:
  // if (!areasArr.length && !provincesArr.length && !dispositivesArr.length) {
  //   throw new ClientError("Debes indicar areas y/o provinces (dispositives opcional)", 400);
  // }

  const exists = await VolunteerApplication.exists({ _id: id });
  if (!exists) throw new ClientError("Solicitud no encontrada", 404);

  const updated = await VolunteerApplication.findByIdAndUpdate(
    id,
    {
      $push: {
        chronology: {
          startAt: s,
          endAt: e,
          dispositives: dispositivesArr, // ✅ opcional
          provinces: provincesArr,
          areas: areasArr,
          hours: h,
          notes: String(notes || ""),
          createdAt: new Date(),
          createdBy: resolveAuthorId(req),
        },
      },
    },
    { new: true }
  )
    .select("chronology")
    .lean();

    
  const nextState = await syncVolunteerState(id);

  response(res, 200, nextState);
};


// =========================
const volunteerChronologyUpdate = async (req, res) => {
  const {
    volunteerApplicationId,
    chronologyId,
    chronologyItemId,
    startAt,
    endAt,
    dispositives, // ✅ array opcional
    provinces,    // ✅ array
    areas,        // ✅ array
    hours,
    notes,
  } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const chronoId = chronologyId || chronologyItemId;
  if (!chronoId) throw new ClientError("Falta chronologyId", 400);
  if (!isValidId(chronoId)) throw new ClientError("chronologyId inválido", 400);

  const id = toId(volunteerApplicationId);

  const exists = await VolunteerApplication.exists({
    _id: id,
    "chronology._id": new mongoose.Types.ObjectId(chronoId),
  });
  if (!exists) throw new ClientError("Entrada de cronología no encontrada", 404);

  const $set = {};

  if (startAt !== undefined) {
    const s = parseDateOrNull(startAt);
    if (!s) throw new ClientError("startAt inválido", 400);
    $set["chronology.$.startAt"] = s;
  }

  if (endAt !== undefined) {
    const e = parseDateOrNull(endAt); // puede ser null
    $set["chronology.$.endAt"] = e;
  }

  if (dispositives !== undefined) {
    $set["chronology.$.dispositives"] = sanitizeObjectIds(dispositives || []);
  }

  if (provinces !== undefined) {
    $set["chronology.$.provinces"] = sanitizeObjectIds(provinces || []);
  }

  if (areas !== undefined) {
    $set["chronology.$.areas"] = sanitizeAreas(areas || []);
  }

  if (hours !== undefined) {
    const h = Number(hours);
    if (Number.isNaN(h) || h < 0) throw new ClientError("hours inválido", 400);
    $set["chronology.$.hours"] = h;
  }

  if (notes !== undefined) {
    $set["chronology.$.notes"] = String(notes || "");
  }

  if (!Object.keys($set).length) {
    throw new ClientError("No hay cambios que guardar", 400);
  }

  // coherencia de fechas si se tocaron
  const touchesDates = startAt !== undefined || endAt !== undefined;
  if (touchesDates) {
    const doc = await VolunteerApplication.findOne(
      { _id: id, "chronology._id": chronoId },
      { "chronology.$": 1 }
    ).lean();

    const current = doc?.chronology?.[0];
    const s = startAt !== undefined ? parseDateOrNull(startAt) : current?.startAt;
    const e = endAt !== undefined ? parseDateOrNull(endAt) : current?.endAt;

    if (!s) throw new ClientError("startAt inválido", 400);
    if (e && e < s) throw new ClientError("endAt no puede ser anterior a startAt", 400);
  }

  const updated = await VolunteerApplication.findOneAndUpdate(
    { _id: id, "chronology._id": chronoId },
    { $set },
  )


    const nextState = await syncVolunteerState(id);

  response(res, 200, nextState);
};


// =========================
// CHRONOLOGY (DELETE)
// body: { volunteerApplicationId, chronologyId } (o chronologyItemId)
// =========================
const volunteerChronologyDelete = async (req, res) => {
  const { volunteerApplicationId, chronologyId, chronologyItemId } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const chronoId = chronologyId || chronologyItemId;
  if (!chronoId) throw new ClientError("Falta chronologyId", 400);
  if (!isValidId(chronoId)) throw new ClientError("chronologyId inválido", 400);

  const id = toId(volunteerApplicationId);

  const exists = await VolunteerApplication.exists({
    _id: id,
    "chronology._id": new mongoose.Types.ObjectId(chronoId),
  });
  if (!exists) throw new ClientError("Entrada de cronología no encontrada", 404);

  const updated = await VolunteerApplication.findByIdAndUpdate(
    id,
    { $pull: { chronology: { _id: new mongoose.Types.ObjectId(chronoId) } } },
    { new: true }
  )
    .select("chronology")
    .lean();

    const nextState = await syncVolunteerState(id);

  response(res, 200, nextState);
};





const INTERVIEW_STATUS_ENUM = ["pendiente", "realizada", "cancelada"];

const parseDateISO = (v) => {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(v); // acepta ISO
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const setVolunteerInterview = async (req, res) => {
  const { volunteerApplicationId, interviewId, interview, action } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  const id = toId(volunteerApplicationId);

  // --------- CLEAR ALL ----------
  if (action === "clear_all") {
    const updated = await VolunteerApplication.findByIdAndUpdate(
      id,
      { $set: { interview: [] } },
      { new: true }
    )
    
    if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
    const nextState = await syncVolunteerState(id);
    return response(res, 200, nextState);
  }

  // --------- REMOVE ONE ----------
  if (action === "remove_one") {
    if (!interviewId) throw new ClientError("Falta interviewId", 400);
    if (!isValidId(interviewId)) throw new ClientError("interviewId inválido", 400);

    const updated = await VolunteerApplication.findByIdAndUpdate(
      id,
      { $pull: { interview: { _id: new mongoose.Types.ObjectId(interviewId) } } },
      { new: true }
    )

    if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
    const nextState = await syncVolunteerState(id);

    response(res, 200, nextState);

  }

  // --------- VALIDAR interview ----------
  if (!interview || typeof interview !== "object") {
    throw new ClientError("Falta interview (objeto)", 400);
  }

  const { userId, date, status, notes } = interview;

  // normalizaciones
  const d = parseDateISO(date);
  if (date !== undefined && date !== null && date !== "" && !d) {
    throw new ClientError("interview.date inválida", 400);
  }

  if (status !== undefined && !INTERVIEW_STATUS_ENUM.includes(String(status))) {
    throw new ClientError("interview.status inválido", 400);
  }

  const n = notes !== undefined ? String(notes || "").trim() : undefined;
  if (n !== undefined && n.length > 2000) {
    throw new ClientError("interview.notes demasiado largo", 400);
  }

  // userId: puede venir null para “sin asignar”
  let userObjId = undefined;
  if (userId !== undefined) {
    if (userId === null || userId === "") {
      userObjId = null;
    } else {
      if (!isValidId(userId)) throw new ClientError("interview.userId inválido", 400);
      userObjId = new mongoose.Types.ObjectId(userId);
    }
  } else {
    // opcional: fallback a req.user si no mandas userId
    // if (req?.user?._id) userObjId = new mongoose.Types.ObjectId(req.user._id);
  }

  // --------- UPDATE ONE ----------
  if (interviewId) {
    if (!isValidId(interviewId)) throw new ClientError("interviewId inválido", 400);

    const $set = {};
    if (userObjId !== undefined) $set["interview.$.userId"] = userObjId;
    if (date !== undefined) $set["interview.$.date"] = d; // d puede ser null
    if (status !== undefined) $set["interview.$.status"] = String(status);
    if (n !== undefined) $set["interview.$.notes"] = n;

    if (!Object.keys($set).length) throw new ClientError("No hay cambios que guardar", 400);

    const updated = await VolunteerApplication.findOneAndUpdate(
      { _id: id, "interview._id": new mongoose.Types.ObjectId(interviewId) },
      { $set },
      { new: true }
    )

    if (!updated) throw new ClientError("VolunteerApplication/Entrevista no encontrada", 404);
    const nextState = await syncVolunteerState(id);
    response(res, 200, nextState);
  }

  // --------- ADD NEW ----------
  const newInterview = {
    userId: userObjId === undefined ? null : userObjId,
    date: date === undefined ? null : d,
    status: status === undefined ? "pendiente" : String(status),
    notes: n === undefined ? "" : n,
    createdAt: new Date(),
  };

  const updated = await VolunteerApplication.findByIdAndUpdate(
    id,
    { $push: { interview: newInterview } },
    { new: true }
  )

  if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
  const nextState = await syncVolunteerState(id);
  response(res, 200, nextState);
};

// =========================
// INTERNAL NOTES (DELETE ONE)
// body: { volunteerApplicationId, noteId }
// =========================
const deleteInternalNote = async (req, res) => {
  const { volunteerApplicationId, noteId } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (!noteId) throw new ClientError("Falta noteId", 400);
  if (!isValidId(noteId)) throw new ClientError("noteId inválido", 400);

  const id = toId(volunteerApplicationId);

  const exists = await VolunteerApplication.exists({ _id: id });
  if (!exists) throw new ClientError("Solicitud no encontrada", 404);

  // opcional: si quieres validar que la nota exista
  const noteExists = await VolunteerApplication.exists({
    _id: id,
    "internalNotes._id": new mongoose.Types.ObjectId(noteId),
  });
  if (!noteExists) throw new ClientError("Nota interna no encontrada", 404);

  await VolunteerApplication.updateOne(
    { _id: id },
    { $pull: { internalNotes: { _id: new mongoose.Types.ObjectId(noteId) } } })

  // ✅ devolver doc completo ya populado + state sincronizado
  const fullDoc = await syncVolunteerState(id);

  response(res, 200, fullDoc);
};




module.exports = {
  createVolunteerApplication: catchAsync(createVolunteerApplication),
  getVolunteerApplicationById: catchAsync(getVolunteerApplicationById),
  listVolunteerApplications: catchAsync(listVolunteerApplications),
  updateVolunteerApplication: catchAsync(updateVolunteerApplication),
  deleteVolunteerApplication: catchAsync(deleteVolunteerApplication),
  disableVolunteerApplication: catchAsync(disableVolunteerApplication),
  addInternalNote: catchAsync(addInternalNote),
  deleteInternalNote: catchAsync(deleteInternalNote),
  volunteerAddChronology:catchAsync(volunteerAddChronology),  
  volunteerChronologyUpdate:catchAsync(volunteerChronologyUpdate), 
  volunteerChronologyDelete:catchAsync(volunteerChronologyDelete),
  setVolunteerInterview: catchAsync(setVolunteerInterview),
};
