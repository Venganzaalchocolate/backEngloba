// controllers/offerController.js
const { Types } = require('mongoose');
const { Offer } = require('../models/indexModels');
// IMPORTAMOS DESDE TUS UTILS
const { catchAsync, response, ClientError, validateRequiredFields, toId } = require('../utils/indexUtils');

// -------------------- Helpers --------------------




// -------------------- LIST --------------------
const toIdStrict = (v, field) => {
  if (v == null || v === '') throw new ClientError(`"${field}" está vacío`, 400);
  const s = String(v);
  if (!Types.ObjectId.isValid(s)) throw new ClientError(`"${field}" no es un ObjectId válido`, 400);
  return new Types.ObjectId(s);
};

const parseBoolLoose = (v) => {
  if (v === true || v === 'true' || v === 1 || v === '1' || v === 'si' || v === 'sí') return true;
  if (v === false || v === 'false' || v === 0 || v === '0' || v === 'no') return false;
  return undefined;
};

const offerList = async (req, res) => {
  const input = req.body;

  const {
    q, active, type, sepe, jobId, studiesId, programId,
    newDispositiveId,            // ⬅️ nuevo (nombre claro)
    dateFrom, dateTo, sort = '-createdAt',
    page, limit, all,
  } = input;

  const filters = {};

  // --- búsqueda por texto / job name (sin cambios) ---
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim(), 'i');
    const jobDocs = await Job.find({ name: rx }, { _id: 1 }).lean();
    filters.$or = [
      { location: rx },
      { job_title: rx },
      ...(jobDocs.length ? [{ jobId: { $in: jobDocs.map(j => j._id) } }] : []),
    ];
  }

  // --- booleanos (sin cambios) ---
  const parsedActive = parseBoolLoose(active);
  if (parsedActive !== undefined) filters.active = parsedActive;

  if (type) {
    if (!['internal', 'external'].includes(type)) throw new ClientError('type inválido', 400);
    filters.type = type;
  }

  const parsedSepe = parseBoolLoose(sepe);
  if (parsedSepe !== undefined) filters.sepe = parsedSepe;

  // --- IDs (ampliado) ---
  if (jobId) filters.jobId = toIdStrict(jobId, 'jobId');

  if (studiesId) {
    filters.studiesId = Array.isArray(studiesId)
      ? { $in: studiesId.map((v, i) => toIdStrict(v, `studiesId[${i}]`)) }
      : toIdStrict(studiesId, 'studiesId');
  }

  if (programId) {
    filters['dispositive.programId'] = toIdStrict(programId, 'programId');
  }

  // ✅ NUEVO: filtro por dispositivo
  const deviceId = newDispositiveId; // acepta ambos nombres
  if (deviceId) {
    filters['dispositive.newDispositiveId'] = toIdStrict(deviceId, 'newDispositiveId');
  }

  // --- rango fechas (sin cambios) ---
  if (dateFrom || dateTo) {
    const createdAt = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (Number.isNaN(d.getTime())) throw new ClientError('dateFrom inválida', 400);
      createdAt.$gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (Number.isNaN(d.getTime())) throw new ClientError('dateTo inválida', 400);
      createdAt.$lte = d;
    }
    filters.createdAt = createdAt;
  }

  // --- orden seguro (sin cambios) ---
  const allowedSort = new Set(['createdAt','-createdAt','datecreate','-datecreate','job_title','-job_title']);
  const sortSafe = allowedSort.has(String(sort)) ? String(sort) : '-createdAt';

  // --- paginación (sin cambios) ---
  const forceAll = parseBoolLoose(all) === true;
  const hasPage  = page !== undefined && page !== null && String(page) !== '';
  const hasLimit = limit !== undefined && limit !== null && String(limit) !== '';
  const doPaginate = !forceAll && (hasPage || hasLimit);

  let pageNum = 1;
  let limitNum = 20;
  if (doPaginate) {
    pageNum  = Math.max(1, Number(page) || 1);
    limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  }

  let total, docs;
  if (doPaginate) {
    total = await Offer.countDocuments(filters);
    docs = await Offer.find(filters)
      .sort(sortSafe)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
  } else {
    docs = await Offer.find(filters).sort(sortSafe).lean();
    total = docs.length;
  }

  const out = docs.map(d => ({
    ...d,
    userCvCount: Array.isArray(d.userCv) ? d.userCv.length : 0,
  }));

  const totalPages = doPaginate ? Math.max(1, Math.ceil(total / limitNum)) : 1;
  response(res, 200, {
    total,
    page: pageNum,
    limit: doPaginate ? limitNum : total,
    totalPages,
    docs: out,
  });
};




// -------------------- CREATE --------------------
async function offerCreate(req, res) {
  const b = req.body || {};
  // Reutilizamos tus utils para requeridos (sin dot paths)
  validateRequiredFields(b, ['work_schedule', 'location', 'expected_incorporation_date', 'jobId','programId', 'newDispositiveId']);

  if (b.type && !['internal', 'external'].includes(b.type)) {
    throw new ClientError('type debe ser "internal" o "external"', 400);
  }
 let payload = {
    work_schedule: b.work_schedule,
    essentials_requirements: b.essentials_requirements || undefined,
    optionals_requirements: b.optionals_requirements || undefined,
    conditions: b.conditions || undefined,
    location: b.location,
    create: b.create ? toId(b.create) : undefined,
    expected_incorporation_date: b.expected_incorporation_date,
    active: b.active === false ? false : true,
    dispositive: {
      programId: toId(b.programId),
      newDispositiveId: toId(b.newDispositiveId),
    },
    sepe: b.sepe === true,
    rejectCv: Array.isArray(b.rejectCv) ? b.rejectCv.map(toId) : [],
    favoritesCv: Array.isArray(b.favoritesCv) ? b.favoritesCv.map(toId) : [],
    viewCv: Array.isArray(b.viewCv) ? b.viewCv.map(toId) : [],
    userCv: Array.isArray(b.userCv) ? b.userCv.map(toId) : [],
    type: b.type || 'external',
    datecreate: b.datecreate ? new Date(b.datecreate) : new Date(),
    studiesId: Array.isArray(b.studiesId) ? b.studiesId.map((s)=>toId(s)) : undefined,
    jobId: toId(b.jobId),
    disability:b.disability===true?true:false
  };

  const created = await Offer.create(payload)
  const doc = await Offer.findById(created._id);
  response(res, 201, doc);
}

// -------------------- UPDATE --------------------
async function offerUpdate(req, res) {
  const b = req.body;
  const { offerId } = b;
  if (!offerId || !Types.ObjectId.isValid(String(offerId))) {
    throw new ClientError('offerId inválido', 400);
  }

  const current = await Offer.findById(offerId).lean();
  if (!current) throw new ClientError('Oferta no encontrada', 404);

  const patch = {};

  // ------- campos simples
  const simple = [
    'work_schedule', 'essentials_requirements', 'optionals_requirements',
    'conditions', 'location', 'expected_incorporation_date', 'type',
  ];
  for (const f of simple) {
    if (b[f] !== undefined) patch[f] = b[f] || undefined;
  }
  if (patch.type && !['internal', 'external'].includes(patch.type)) {
    throw new ClientError('type debe ser "internal" o "external"', 400);
  }

  // ------- fechas / booleanos
  if (b.date !== undefined)       patch.date = b.date ? new Date(b.date) : undefined;
  if (b.datecreate !== undefined) patch.datecreate = b.datecreate ? new Date(b.datecreate) : undefined;
  if (b.active !== undefined)     patch.active = !!b.active;
  if (b.sepe !== undefined)       patch.sepe = !!b.sepe;

  // ------- arrays de refs
  if (b.rejectCv !== undefined)   patch.rejectCv    = Array.isArray(b.rejectCv)    ? b.rejectCv.map(toId)    : [];
  if (b.favoritesCv !== undefined)patch.favoritesCv = Array.isArray(b.favoritesCv) ? b.favoritesCv.map(toId) : [];
  if (b.viewCv !== undefined)     patch.viewCv      = Array.isArray(b.viewCv)      ? b.viewCv.map(toId)      : [];
  if (b.userCv !== undefined)     patch.userCv      = Array.isArray(b.userCv)      ? b.userCv.map(toId)      : [];
  if (b.studiesId !== undefined)  patch.studiesId   = Array.isArray(b.studiesId)   ? b.studiesId.map(toId)   : [];

  // ------- IDs directos (opcionales en UPDATE)
  if (b.jobId !== undefined)      patch.jobId      = b.jobId ? toId(b.jobId) : undefined;
  if (b.provinceId !== undefined) patch.provinceId = b.provinceId ? toId(b.provinceId) : undefined;
  if (b.disability!==undefined) patch.disability= b.disability===true?true:false
 
  // ------- dispositive (acepta varias formas de enviar)
  const hasDispositiveObj = b.newDispositiveId !== undefined;
  const hasDispositiveLoose = b.programId !== undefined || b.newDispositiveId !== undefined;

  if (hasDispositiveObj || hasDispositiveLoose) {
    const inObj = b.dispositive || {};
    const programId     = inObj.programId     ?? b.programId;
    const dispositiveId = inObj.newDispositiveId ?? b.newDispositiveId;

    if (!programId || !dispositiveId) {
      throw new ClientError('Faltan programId y/o dispositiveId para actualizar el dispositivo', 400);
    }
    patch.dispositive = {
      programId: toId(programId),
      newDispositiveId: toId(dispositiveId),
    };
  }


  // Si no hay nada que actualizar, devolver la actual
  if (Object.keys(patch).length === 0) {
    const doc = await Offer.findById(offerId);
    return response(res, 200, doc);
  }

  await Offer.updateOne({ _id: offerId }, { $set: patch }, { runValidators: true });
  const doc = await Offer.findById(offerId);
  return response(res, 200, doc);
}


// -------------------- HARD DELETE --------------------
async function offerHardDelete(req, res) {
  const { offerId } = req.body;
  if (!offerId || !Types.ObjectId.isValid(offerId)) {
    throw new ClientError('offerId inválido', 400);
  }

  const doc = await Offer.findById(offerId).lean();
  if (!doc) throw new ClientError('Oferta no encontrada', 404);

  await Offer.deleteOne({ _id: doc._id });
  return response(res, 200, { deleted: true });
}

// -------------------- GET ONE --------------------

async function offerId(req, res) {
  const { offerId, public: isPublic } = req.body; // renombramos para evitar confusiones
  if (!offerId || !Types.ObjectId.isValid(offerId)) {
    throw new ClientError('offerId inválido', 400);
  }

  // normaliza "public" por si llega como string: "true"/"1"
  const isPub = typeof isPublic === 'string'
    ? /^(true|1)$/i.test(isPublic)
    : !!isPublic;

  // construimos el filtro
  const filter = { _id: offerId };
  if (isPub) {
    filter.type = 'external';
    filter.active = true;
  }

  // un único findOne
  const doc = await Offer.findOne(filter)
    // .populate('jobId')
    // .populate('provinceId')
    .lean();

  if (!doc) {
    throw new ClientError('Oferta no disponible', 404);
  }

  response(res, 200, doc);
}

//migracionOfertasStudies();
// migrateSolicitants({ apply: true });
module.exports = {
  offerList: catchAsync(offerList),
  offerCreate: catchAsync(offerCreate),
  offerUpdate: catchAsync(offerUpdate),
  offerHardDelete: catchAsync(offerHardDelete),
  offerId: catchAsync(offerId),
};
