// controllers/volunteerApplicationController.js
const mongoose = require("mongoose");
const { catchAsync, response, ClientError, toId } = require("../utils/indexUtils");
const { VolunteerApplication } = require("../models/indexModels");

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
const GENDER = ["male", "female", "others", "nonBinary"];

const INTERVIEW_STATUS_ENUM = ["pendiente", "realizada", "cancelada"];

// =====================================================
// POPULATE (reutilizable) + 1 query siempre
// =====================================================
const VOLUNTEER_POPULATE = [
  { path: "programInterest", select: "name acronym area active" },
  { path: "internalNotes.userId", select: "firstName lastName email" },
  { path: "interview.userId", select: "firstName lastName email" },
  // Si en statusEvents guardas userId y quieres verlo poblado:
  // { path: "statusEvents.userId", select: "firstName lastName email" },
];

const withComputedStatus = (doc) => {
  if (!doc) return doc;

  const evs = Array.isArray(doc.statusEvents) ? doc.statusEvents : [];
  const last = evs.length ? evs[evs.length - 1] : null;

  const active = last?.type === "disable" ? false : true; // enable/none => true

  return {
    ...doc,
    active,
    lastStatus: last
      ? { type: last.type, at: last.at, reason: last.reason, userId: last.userId }
      : null,
  };
};

const populateVolunteer = async (query) => {
  const doc = await query.populate(VOLUNTEER_POPULATE).lean();
  return withComputedStatus(doc);
};


// =====================================================
// Helpers: sanitizers, fechas, author
// =====================================================
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

const parseDateOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const parseDateOrNow = (v) => parseDateOrNull(v) || new Date();

const resolveAuthorId = (req) => {
  const id = req.user?._id || null;
  return id && isValidId(id) ? new mongoose.Types.ObjectId(id) : null;
};

// =====================================================
// statusEvents => active (computed) + lastStatus (computed)
// - NO existe campo "active" en el modelo.
// - devolvemos "active" calculado para que el front migre sin dolor.
// =====================================================
const getLastStatusEvent = (doc) => {
  const evs = Array.isArray(doc?.statusEvents) ? doc.statusEvents : [];
  return evs.length ? evs[evs.length - 1] : null;
};

// =====================================================
// CREATE (upsert por documentId)
// - En insert: crea statusEvents inicial (enable)
// - En update: NO toca statusEvents (no pisa histórico)
// =====================================================
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
    gender,
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

  if (!isValidId(province)) throw new ClientError("province inválido", 400);

  if (gender === undefined || gender === null || String(gender).trim() === "") {
    throw new ClientError("Falta género", 400);
  }
  const g = String(gender).trim();
  if (!GENDER.includes(g)) throw new ClientError("Género inválido", 400);

  const occArr = occupation || [];
  if (!Array.isArray(occArr) || !occArr.length) {
    throw new ClientError("occupation debe tener al menos una opción", 400);
  }

  const studiesArr = sanitizeIdsArray(studies || []);
  const programsArr = sanitizeIdsArray(programInterest || []);
  const areasArr = (areaInterest || []).map(String).filter((x) => PROGRAM_AREA_ENUM.includes(x));

  if (!programsArr.length && !areasArr.length) {
    throw new ClientError("Debes indicar programInterest o areaInterest", 400);
  }

  const payload = {
    firstName,
    lastName,
    birthDate,
    documentId,
    phone,
    email,
    province: new mongoose.Types.ObjectId(province),
    localidad,
    occupation: occArr,
    occupationOtherText: occupationOtherText || "",
    studies: studiesArr,
    studiesOtherText: studiesOtherText || "",
    availability,
    programInterest: programsArr,
    areaInterest: areasArr,
    referralSource,
    userNote: userNote || "",
    gender: g,
  };

  if (form) payload.form = form;

  const authorId = resolveAuthorId(req);
  const now = new Date();

  const doc = await populateVolunteer(
    VolunteerApplication.findOneAndUpdate(
      { documentId },
      {
        $set: payload,
        $setOnInsert: {
          statusEvents: [{ type: "enable", at: now, reason: "initial_enable", userId: authorId }],
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
  );

  return response(res, 200, doc);
};

// =====================================================
// READ (by id)
// =====================================================
const getVolunteerApplicationById = async (req, res) => {
  const { volunteerApplicationId } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);

  const doc = await populateVolunteer(VolunteerApplication.findById(id));
  if (!doc) throw new ClientError("Solicitud no encontrada", 404);

  return response(res, 200, doc);
};

// =====================================================
// LIST (aggregate)
// body: { active, province, programId, area, q, page, limit }
// - active: filtra por computed active (último statusEvents)
// - no populate aquí (tu tabla no lo necesita)
// =====================================================
const listVolunteerApplications = async (req, res) => {
  const { active, province, programId, area, q, page = 1, limit = 25, state } = req.body || {};

  const baseMatch = {};

  if (province !== undefined) {
    if (province && !isValidId(province)) throw new ClientError("province inválido", 400);
    if (province) baseMatch.province = new mongoose.Types.ObjectId(province);
  }

  if (programId !== undefined) {
    if (programId && !isValidId(programId)) throw new ClientError("programId inválido", 400);
    if (programId) {
      const pid = new mongoose.Types.ObjectId(programId);
      // programInterest es array -> buscamos que contenga ese id
      baseMatch.programInterest = { $in: [pid] };
    }
  }

  if (area !== undefined) {
    if (area && !PROGRAM_AREA_ENUM.includes(area)) throw new ClientError("area inválida", 400);
    if (area) {
      // areaInterest es array -> buscamos que contenga ese string
      baseMatch.areaInterest = { $in: [area] };
    }
  }

  // ✅ state filter (con "todos" = sin filtro)
  if (state !== undefined) {
    const s = String(state || "").trim().toLowerCase();

    if (s && s !== "todos") {
      // OJO: tus estados tienen espacios y minúsculas, así que comparamos con el original
      // Para no liarla, validamos contra STATE_ENUM tal cual.
      const isValidState = STATE_ENUM.includes(String(state).trim());
      if (!isValidState) throw new ClientError("state inválido", 400);

      baseMatch.state = String(state).trim();
    }
    // si es "" / null / "todos" -> no añadimos filtro
  }

  if (q) {
  const raw = String(q).trim();
  const tokens = raw.split(/\s+/).filter(Boolean);

  const rxFull = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  // Helper: regex por token escapado
  const tokenRx = (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  // Caso: parece email
  const looksLikeEmail = raw.includes("@");

  if (looksLikeEmail) {
    baseMatch.$or = [
      { email: rxFull },
      { firstName: rxFull },
      { lastName: rxFull },
      { documentId: rxFull },
      { phone: rxFull },
    ];
  } else if (tokens.length >= 2) {
    const rxs = tokens.map(tokenRx);

    // AND de todos los tokens en un mismo campo
    const andFirst = { $and: rxs.map((rx) => ({ firstName: rx })) };
    const andLast = { $and: rxs.map((rx) => ({ lastName: rx })) };

    // Nombre/Apellido en cualquier orden usando dos primeros tokens
    const a = rxs[0];
    const b = rxs[1];
    const nameSurnameAnyOrder = {
      $or: [
        { $and: [{ firstName: a }, { lastName: b }] },
        { $and: [{ firstName: b }, { lastName: a }] },
      ],
    };

    baseMatch.$or = [
      nameSurnameAnyOrder,
      andFirst,
      andLast,

      // fallback: campos “mono”
      { email: rxFull },
      { documentId: rxFull },
      { localidad: rxFull },
      { phone: rxFull },
    ];
  } else {
    // 1 token
    baseMatch.$or = [
      { firstName: rxFull },
      { lastName: rxFull },
      { email: rxFull },
      { documentId: rxFull },
      { localidad: rxFull },
      { phone: rxFull },
    ];
  }
}

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (p - 1) * l;

  const pipeline = [
    { $match: baseMatch },
    { $addFields: { _lastStatusEvent: { $arrayElemAt: ["$statusEvents", -1] } } },
    {
      $addFields: {
        active: { $cond: [{ $eq: ["$_lastStatusEvent.type", "disable"] }, false, true] },
        lastStatus: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$statusEvents", []] } }, 0] },
            {
              type: "$_lastStatusEvent.type",
              at: "$_lastStatusEvent.at",
              reason: "$_lastStatusEvent.reason",
              userId: "$_lastStatusEvent.userId",
            },
            null,
          ],
        },
      },
    },
    ...(active === undefined ? [] : [{ $match: { active: !!active } }]),
    {
      $facet: {
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: l },
          {
            $project: {
              firstName: 1,
              lastName: 1,
              province: 1,
              areaInterest: 1,
              createdAt: 1,
              state: 1,
              active: 1,
              lastStatus: 1,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
    { $addFields: { total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] } } },
    { $project: { items: 1, total: 1 } },
  ];

  const agg = await VolunteerApplication.aggregate(pipeline);
  const out = agg?.[0] || { items: [], total: 0 };
  const total = out.total || 0;

  response(res, 200, {
    items: out.items || [],
    page: p,
    limit: l,
    total,
    pages: Math.ceil(total / l),
  });
};


// =====================================================
// UPDATE (NO enable/disable aquí)
// =====================================================
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
    userNote,
    state,
    gender,
    active, // bloqueado
  } = req.body;

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (active !== undefined) {
    throw new ClientError("Para activar/desactivar usa volunteerenable / volunteerdisable", 400);
  }

  const id = toId(volunteerApplicationId);

  const current = await VolunteerApplication.findById(id).select("programInterest areaInterest").lean();
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
    update.province = new mongoose.Types.ObjectId(province);
  }

  if (gender !== undefined) {
    const g = String(gender || "").trim();
    if (!GENDER.includes(g)) throw new ClientError("Género inválido", 400);
    update.gender = g;
  }

  if (localidad !== undefined) update.localidad = localidad;

  if (occupation !== undefined) {
    const occArr = occupation || [];
    update.occupation = occArr;
    if (!occArr.includes("otro")) update.occupationOtherText = "";
  }
  if (occupationOtherText !== undefined) update.occupationOtherText = occupationOtherText;

  if (studies !== undefined) update.studies = sanitizeIdsArray(studies || []);
  if (studiesOtherText !== undefined) update.studiesOtherText = studiesOtherText;

  if (availability !== undefined) update.availability = availability;

  if (programInterest !== undefined) update.programInterest = sanitizeIdsArray(programInterest || []);

  if (areaInterest !== undefined) {
    update.areaInterest = (areaInterest || [])
      .map((x) => String(x))
      .filter((x) => PROGRAM_AREA_ENUM.includes(x));
  }

  if (referralSource !== undefined) update.referralSource = referralSource;
  if (userNote !== undefined) update.userNote = userNote;

  if (state !== undefined) {
    const s = String(state || "").trim();
    if (!STATE_ENUM.includes(s)) throw new ClientError("state inválido", 400);
    update.state = s;
  }

  const nextPrograms =
    update.programInterest !== undefined ? update.programInterest : current.programInterest || [];
  const nextAreas =
    update.areaInterest !== undefined ? update.areaInterest : current.areaInterest || [];

  if ((!nextPrograms || !nextPrograms.length) && (!nextAreas || !nextAreas.length)) {
    throw new ClientError("Debes indicar programInterest o areaInterest", 400);
  }

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(id, { $set: update }, { new: true })
  );

  response(res, 200, updated);
};

// =====================================================
// DELETE (hard)
// =====================================================
const deleteVolunteerApplication = async (req, res) => {
  const { volunteerApplicationId } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);

  const exists = await VolunteerApplication.exists({ _id: id });
  if (!exists) throw new ClientError("Solicitud no encontrada", 404);

  await VolunteerApplication.deleteOne({ _id: id });
  response(res, 200, { ok: true, volunteerApplicationId: String(id) });
};

// =====================================================
// INTERNAL NOTES (ADD)
// =====================================================
const addInternalNote = async (req, res) => {
  const { volunteerApplicationId, note, userId } = req.body;

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (!note) throw new ClientError("Falta note", 400);

  const id = toId(volunteerApplicationId);
  const authorId = userId || req.user?._id;

  if (!authorId) throw new ClientError("Falta userId (autor de la nota)", 400);
  if (!isValidId(authorId)) throw new ClientError("userId inválido", 400);

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
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
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);

  response(res, 200, updated);
};

// =====================================================
// INTERNAL NOTES (DELETE ONE)
// =====================================================
const deleteInternalNote = async (req, res) => {
  const { volunteerApplicationId, noteId } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  if (!noteId) throw new ClientError("Falta noteId", 400);
  if (!isValidId(noteId)) throw new ClientError("noteId inválido", 400);

  const id = toId(volunteerApplicationId);

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
      id,
      { $pull: { internalNotes: { _id: new mongoose.Types.ObjectId(noteId) } } },
      { new: true }
    )
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);

  return response(res, 200, updated);
};

// =====================================================
// ENABLE / DISABLE (solo statusEvents)
// - dateDisable/dateEnable se admiten; si inválida => now
// =====================================================
const disableVolunteerApplication = async (req, res) => {
  const { volunteerApplicationId, disabledReason = "manual_disable", dateDisable } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);
  const at = parseDateOrNow(dateDisable);
  const authorId = resolveAuthorId(req);

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
      id,
      {
        $push: {
          statusEvents: {
            type: "disable",
            at,
            reason: String(disabledReason || ""),
            userId: authorId,
          },
        },
      },
      { new: true }
    )
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);
  response(res, 200, updated);
};

const enableVolunteerApplication = async (req, res) => {
  const { volunteerApplicationId, enabledReason = "manual_enable", dateEnable } = req.body;
  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const id = toId(volunteerApplicationId);
  const at = parseDateOrNow(dateEnable);
  const authorId = resolveAuthorId(req);

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
      id,
      {
        $push: {
          statusEvents: {
            type: "enable",
            at,
            reason: String(enabledReason || ""),
            userId: authorId,
          },
        },
      },
      { new: true }
    )
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);
  response(res, 200, updated);
};

// =====================================================
// CHRONOLOGY (ADD/UPDATE/DELETE) - NO toca state automático
// =====================================================
const volunteerAddChronology = async (req, res) => {
  const {
    volunteerApplicationId,
    startAt,
    endAt,
    hours,
    notes = "",
    dispositives,
    areas,
    provinces,
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

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
      id,
      {
        $push: {
          chronology: {
            startAt: s,
            endAt: e,
            dispositives: dispositivesArr,
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
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);
  response(res, 200, updated);
};

const volunteerChronologyUpdate = async (req, res) => {
  const {
    volunteerApplicationId,
    chronologyId,
    chronologyItemId,
    startAt,
    endAt,
    dispositives,
    provinces,
    areas,
    hours,
    notes,
  } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const chronoId = chronologyId || chronologyItemId;
  if (!chronoId) throw new ClientError("Falta chronologyId", 400);
  if (!isValidId(chronoId)) throw new ClientError("chronologyId inválido", 400);

  const id = toId(volunteerApplicationId);

  const $set = {};

  if (startAt !== undefined) {
    const s = parseDateOrNull(startAt);
    if (!s) throw new ClientError("startAt inválido", 400);
    $set["chronology.$.startAt"] = s;
  }

  if (endAt !== undefined) {
    const e = parseDateOrNull(endAt); // null permitido
    if (endAt !== null && endAt !== "" && endAt !== undefined && !e) {
      throw new ClientError("endAt inválido", 400);
    }
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

  if (!Object.keys($set).length) throw new ClientError("No hay cambios que guardar", 400);

  // coherencia fechas si se tocaron (1 lectura pequeña adicional SOLO para validar)
  const touchesDates = startAt !== undefined || endAt !== undefined;
  if (touchesDates) {
    const doc = await VolunteerApplication.findOne(
      { _id: id, "chronology._id": new mongoose.Types.ObjectId(chronoId) },
      { "chronology.$": 1 }
    ).lean();

    const current = doc?.chronology?.[0];
    if (!current) throw new ClientError("Entrada de cronología no encontrada", 404);

    const s = startAt !== undefined ? parseDateOrNull(startAt) : current?.startAt;
    const e = endAt !== undefined ? parseDateOrNull(endAt) : current?.endAt;

    if (!s) throw new ClientError("startAt inválido", 400);
    if (e && e < s) throw new ClientError("endAt no puede ser anterior a startAt", 400);
  }

  const updated = await populateVolunteer(
    VolunteerApplication.findOneAndUpdate(
      { _id: id, "chronology._id": new mongoose.Types.ObjectId(chronoId) },
      { $set },
      { new: true }
    )
  );

  if (!updated) throw new ClientError("Solicitud/cronología no encontrada", 404);
  response(res, 200, updated);
};

const volunteerChronologyDelete = async (req, res) => {
  const { volunteerApplicationId, chronologyId, chronologyItemId } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);

  const chronoId = chronologyId || chronologyItemId;
  if (!chronoId) throw new ClientError("Falta chronologyId", 400);
  if (!isValidId(chronoId)) throw new ClientError("chronologyId inválido", 400);

  const id = toId(volunteerApplicationId);

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(
      id,
      { $pull: { chronology: { _id: new mongoose.Types.ObjectId(chronoId) } } },
      { new: true }
    )
  );

  if (!updated) throw new ClientError("Solicitud no encontrada", 404);
  response(res, 200, updated);
};

// =====================================================
// INTERVIEW (SET/ADD/REMOVE/CLEAR) - NO toca state automático
// =====================================================
const parseDateISO = (v) => {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const setVolunteerInterview = async (req, res) => {
  const { volunteerApplicationId, interviewId, interview, action } = req.body || {};

  if (!volunteerApplicationId) throw new ClientError("Falta volunteerApplicationId", 400);
  const id = toId(volunteerApplicationId);

  if (action === "clear_all") {
    const updated = await populateVolunteer(
      VolunteerApplication.findByIdAndUpdate(id, { $set: { interview: [] } }, { new: true })
    );
    if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
    response(res, 200, updated);
  }

  if (action === "remove_one") {
    if (!interviewId) throw new ClientError("Falta interviewId", 400);
    if (!isValidId(interviewId)) throw new ClientError("interviewId inválido", 400);

    const updated = await populateVolunteer(
      VolunteerApplication.findByIdAndUpdate(
        id,
        { $pull: { interview: { _id: new mongoose.Types.ObjectId(interviewId) } } },
        { new: true }
      )
    );
    if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
    response(res, 200, updated);
  }

  if (!interview || typeof interview !== "object") throw new ClientError("Falta interview (objeto)", 400);

  const { userId, date, status, notes } = interview;

  const d = parseDateISO(date);
  if (date !== undefined && date !== null && date !== "" && !d) {
    throw new ClientError("interview.date inválida", 400);
  }

  if (status !== undefined && !INTERVIEW_STATUS_ENUM.includes(String(status))) {
    throw new ClientError("interview.status inválido", 400);
  }

  const n = notes !== undefined ? String(notes || "").trim() : undefined;
  if (n !== undefined && n.length > 2000) throw new ClientError("interview.notes demasiado largo", 400);

  let userObjId = undefined;
  if (userId !== undefined) {
    if (userId === null || userId === "") userObjId = null;
    else {
      if (!isValidId(userId)) throw new ClientError("interview.userId inválido", 400);
      userObjId = new mongoose.Types.ObjectId(userId);
    }
  }

  // UPDATE ONE
  if (interviewId) {
    if (!isValidId(interviewId)) throw new ClientError("interviewId inválido", 400);

    const $set = {};
    if (userObjId !== undefined) $set["interview.$.userId"] = userObjId;
    if (date !== undefined) $set["interview.$.date"] = d;
    if (status !== undefined) $set["interview.$.status"] = String(status);
    if (n !== undefined) $set["interview.$.notes"] = n;

    if (!Object.keys($set).length) throw new ClientError("No hay cambios que guardar", 400);

    const updated = await populateVolunteer(
      VolunteerApplication.findOneAndUpdate(
        { _id: id, "interview._id": new mongoose.Types.ObjectId(interviewId) },
        { $set },
        { new: true }
      )
    );

    if (!updated) throw new ClientError("VolunteerApplication/Entrevista no encontrada", 404);
    response(res, 200, updated);
  }

  // ADD NEW
  const newInterview = {
    userId: userObjId === undefined ? null : userObjId,
    date: date === undefined ? null : d,
    status: status === undefined ? "pendiente" : String(status),
    notes: n === undefined ? "" : n,
    createdAt: new Date(),
  };

  const updated = await populateVolunteer(
    VolunteerApplication.findByIdAndUpdate(id, { $push: { interview: newInterview } }, { new: true })
  );

  if (!updated) throw new ClientError("VolunteerApplication no encontrado", 404);
  response(res, 200,updated);
};


// controllers/volunteerApplicationController.js
const volunteerGetNotLimit = async (req, res) => {
  const { programId, active, year } = req.body || {};

  const baseMatch = {};

  const isAll = (v) => {
    if (v === undefined) return false;
    if (v === null) return true;
    const s = String(v).trim().toLowerCase();
    return s === "" || s === "todos" || s === "__all__" || s === "all";
  };

  // ✅ year: si no viene o viene "todos"/"" => sin filtro
  if (year !== undefined && !isAll(year)) {
    const y = Number(year);
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(y) || y < 2024 || y > currentYear) {
      throw new ClientError("year inválido", 400);
    }

    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));

    baseMatch.createdAt = { $gte: start, $lt: end };
  }

  // ✅ programId: si no viene o viene "todos"/"" => sin filtro
  if (programId !== undefined && !isAll(programId)) {
    if (programId && !isValidId(programId)) throw new ClientError("programId inválido", 400);
    if (programId) {
      const pid = new mongoose.Types.ObjectId(programId);
      baseMatch.programInterest = { $in: [pid] };
    }
  }

  const docDelitosId = new mongoose.Types.ObjectId("69674ce0ff183fd90b1f1874");

  const pipeline = [
    { $match: baseMatch },

    // 1) stateEnable/stateDisable desde statusEvents
    {
      $addFields: {
        _enableDates: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$statusEvents", []] },
                as: "e",
                cond: { $eq: ["$$e.type", "enable"] },
              },
            },
            as: "e",
            in: "$$e.at",
          },
        },
        _disableDates: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$statusEvents", []] },
                as: "e",
                cond: { $eq: ["$$e.type", "disable"] },
              },
            },
            as: "e",
            in: "$$e.at",
          },
        },
      },
    },
    {
      $addFields: {
        stateEnable: { $max: { $ifNull: ["$_enableDates", []] } },
        _lastDisable: { $max: { $ifNull: ["$_disableDates", []] } },
      },
    },
    {
      $addFields: {
        // si baja <= alta => null (está activo en un nuevo periodo)
        // si no hay alta => devolvemos baja si existe
        stateDisable: {
          $cond: [
            { $and: [{ $ne: ["$stateEnable", null] }, { $ne: ["$_lastDisable", null] }] },
            { $cond: [{ $gt: ["$_lastDisable", "$stateEnable"] }, "$_lastDisable", null] },
            "$_lastDisable",
          ],
        },
      },
    },

    // 2) active computado desde último statusEvent
    { $addFields: { _lastStatusEvent: { $arrayElemAt: ["$statusEvents", -1] } } },
    {
      $addFields: {
        active: { $cond: [{ $eq: ["$_lastStatusEvent.type", "disable"] }, false, true] },
      },
    },

    ...(active === undefined ? [] : [{ $match: { active: !!active } }]),

    // 3) fecha última de Delitos sexuales desde Filedrive.originDocumentation
    {
      $lookup: {
        from: "filedrives",
        let: { fileIds: { $ifNull: ["$files", []] } },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ["$_id", "$$fileIds"] },
                  { $eq: ["$originDocumentation", docDelitosId] },
                ],
              },
            },
          },
          { $project: { date: 1, createdAt: 1 } },
        ],
        as: "_delitosFiles",
      },
    },
    {
      $addFields: {
        delitosSexualesDate: {
          $max: {
            $map: {
              input: { $ifNull: ["$_delitosFiles", []] },
              as: "f",
              in: { $ifNull: ["$$f.date", "$$f.createdAt"] },
            },
          },
        },
      },
    },

    // 4) project final
    {
  $project: {
    // (opcional) _id: 1,

    firstName: 1,
    lastName: 1,
    birthDate: 1,
    documentId: 1,
    phone: 1,
    email: 1,
    gender: 1,

    province: 1,
    localidad: 1,

    occupation: 1,
    occupationOtherText: 1,

    studies: 1,
    studiesOtherText: 1,

    availability: 1,

    programInterest: 1,
    areaInterest: 1,

    referralSource: 1,
    userNote: 1,

    chronology: 1,

    state: 1,

    createdAt: 1,
    updatedAt: 1,

    active: 1,
    stateEnable: 1,
    stateDisable: 1,
    delitosSexualesDate: 1,
  },
},


    { $sort: { createdAt: -1 } },
  ];

  const items = await VolunteerApplication.aggregate(pipeline);
  return response(res, 200, { items, total: items.length });
};






// =====================================================
module.exports = {
  createVolunteerApplication: catchAsync(createVolunteerApplication),
  getVolunteerApplicationById: catchAsync(getVolunteerApplicationById),
  listVolunteerApplications: catchAsync(listVolunteerApplications),
  updateVolunteerApplication: catchAsync(updateVolunteerApplication),
  deleteVolunteerApplication: catchAsync(deleteVolunteerApplication),

  disableVolunteerApplication: catchAsync(disableVolunteerApplication),
  enableVolunteerApplication: catchAsync(enableVolunteerApplication),

  addInternalNote: catchAsync(addInternalNote),
  deleteInternalNote: catchAsync(deleteInternalNote),

  volunteerAddChronology: catchAsync(volunteerAddChronology),
  volunteerChronologyUpdate: catchAsync(volunteerChronologyUpdate),
  volunteerChronologyDelete: catchAsync(volunteerChronologyDelete),

  setVolunteerInterview: catchAsync(setVolunteerInterview),
  volunteerGetNotLimit:catchAsync(volunteerGetNotLimit)


};
