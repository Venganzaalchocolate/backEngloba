const { default: mongoose } = require('mongoose');
const { UserCv, User } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { createAccentInsensitiveRegex } = require('../utils/utils');
const { deleteFile } = require('./ovhController');

// ---------- Helpers ----------
const normalize = (s) =>
  (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const commentsPopulate = [
  { path: 'commentsPhone.userCv', model: 'User', select: 'firstName lastName' },
  { path: 'commentsVideo.userCv', model: 'User', select: 'firstName lastName' },
  { path: 'commentsInperson.userCv', model: 'User', select: 'firstName lastName' },
  { path: 'notes.userCv', model: 'User', select: 'firstName lastName' },
];

const normDNI = (d) => (d ?? '').toString().trim().toUpperCase();

const buildEnglobaMap = async (dnisRaw = []) => {
  const dnis = [...new Set(dnisRaw.filter(Boolean).map(normDNI))];
  if (!dnis.length) return new Map();

  const usersInEngloba = await User.find(
    { dni: { $in: dnis } },
    { _id: 1, dni: 1, employmentStatus: 1 }
  );

  const map = new Map();
  for (const u of usersInEngloba) {
    const st = normalize(u.employmentStatus);
    const active =
      st === 'activo' ||
      st === 'en proceso de contratacion' ||
      st === 'en proceso de contratación';
    map.set(normDNI(u.dni), { status: true, active, idUser: u._id });
  }
  return map;
};

const attachWorkedInEngloba = async (docs) => {
  const arr = Array.isArray(docs) ? docs : [docs];
  const dnis = arr.map((d) => d?.dni).filter(Boolean);
  const englobaMap = await buildEnglobaMap(dnis);

  const attachOne = (doc) => {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : doc;
    const key = normDNI(doc.dni);
    obj.workedInEngloba =
      englobaMap.get(key) ?? { status: false, active: null, idUser: null };
    return obj;
  };

  const out = arr.map(attachOne);
  return Array.isArray(docs) ? out : out[0];
};

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
// --------------------------------------------
// crear usuario (SOLO nuevos campos *_Id)
const postCreateUserCv = async (req, res) => {
  const required = ['email', 'phone', 'jobsId', 'studiesId', 'provincesId', 'work_schedule', 'firstName', 'lastName'];
  for (const k of required) {
    if (req.body[k] === undefined || req.body[k] === null) {
      throw new ClientError(`Falta el campo requerido: ${k}`, 400);
    }
  }

  const dataUser = {
    date: new Date(),
    name: `${(req.body.firstName || '').toLowerCase()} ${(req.body.lastName || '').toLowerCase()}`.trim(),
    email: (req.body.email || '').toLowerCase(),
    phone: req.body.phone,
    // SOLO nuevos campos:
    jobsId: Array.isArray(req.body.jobsId) ? req.body.jobsId : [],
    studiesId: Array.isArray(req.body.studiesId) ? req.body.studiesId : [],
    provincesId: Array.isArray(req.body.provincesId) ? req.body.provincesId : [],
    work_schedule: req.body.work_schedule, // mantiene formato anterior (array de strings)
    firstName: (req.body.firstName || '').toLowerCase(),
    lastName: (req.body.lastName || '').toLowerCase(),
    gender: req.body.gender,
  };

  if (req.body.dni) dataUser.dni = req.body.dni.trim().toUpperCase();
  if (req.body.about) dataUser.about = req.body.about;
  if (req.body.offer) dataUser.offer = req.body.offer;
  if (req.body.job_exchange !== undefined) dataUser.job_exchange = !!req.body.job_exchange;
  if (req.body.disability !== undefined) dataUser.disability = +req.body.disability || 0;
  if (req.body.fostered !== undefined) dataUser.fostered = req.body.fostered === 'si' || req.body.fostered === true;
  const newUserCv = new UserCv(dataUser);
  const savedUserCv = await newUserCv.save();
  response(res, 200, savedUserCv);
};


const asObjectIdArray = (input) => {
  if (input == null) return [];

  const arr = Array.isArray(input) ? input.map((x)=>toId(x)) : [toId(input)];
  return arr;
};
const asArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));

// recoge todos los usuarios (paginado) usando *_Id
const getUserCvs = async (req, res) => {
  if (!req.body.page || !req.body.limit) {
    throw new ClientError("Faltan datos no son correctos", 400);
  }
  const page  = parseInt(req.body.page)  || 1;
  const limit = parseInt(req.body.limit) || 10;

  const filters = {};

  if (req.body.name) {
    const nameRegex = createAccentInsensitiveRegex(req.body.name);
    filters.name = { $regex: nameRegex };
  }
  if (req.body.email) filters.email = { $regex: req.body.email, $options: 'i' };
  if (req.body.phone) filters.phone = { $regex: req.body.phone, $options: 'i' };

  // NUEVOS filtros por IDs (acepta string o array)
  const jobsIds      = asObjectIdArray(req.body.jobsId);
  const studiesIds   = asObjectIdArray(req.body.studiesId);
  const provincesIds = asObjectIdArray(req.body.provincesId);

  if (jobsIds.length)      filters.jobsId      = { $in: jobsIds };
  if (studiesIds.length)   filters.studiesId   = { $in: studiesIds };
  if (provincesIds.length) filters.provincesId = { $in: provincesIds };

  // work_schedule: acepta string o array
  const workSched = asArray(req.body.work_schedule);
  if (workSched.length) filters.work_schedule = { $in: workSched };

  if (req.body.fostered === 'si') filters.fostered = true;
  else if (req.body.fostered === 'no') filters.fostered = false;

  if (req.body.offer) filters.offer = req.body.offer; // (ajusta a ObjectId si cambiaste el schema)

  const ids = asObjectIdArray(req.body.users);
  if (ids.length) filters._id = { $in: ids };

  if (req.body.view !== undefined) {
    filters.view = req.body.view == '0' ? null : { $ne: null };
  }
  if (req.body.favorite !== undefined) {
    filters.favorite = req.body.favorite == '0' ? null : { $ne: null };
  }
  if (req.body.reject !== undefined) {
    filters.reject = req.body.reject == '0' ? null : { $ne: null };
  }
  if (Number(req.body.disability) > 0) {
    filters.disability = { $gt: 0 };
  }

  const totalDocs  = await UserCv.countDocuments(filters);
  const totalPages = Math.ceil(totalDocs / limit);

  const users = await UserCv.find(filters)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate(commentsPopulate);

  const usersWithEnglobaInfo = await attachWorkedInEngloba(users);
  response(res, 200, { users: usersWithEnglobaInfo, totalPages });
};

// filtrar por dni/phone/id (sin cambios, devuelve nuevos campos igualmente)
const getUserCvsFilter = async (req, res) => {

  let filter = {};
  if (req.body.dni) filter = { dni: req.body.dni };
  else if (req.body.phone) filter = { phone: req.body.phone };
  else if (req.body.id) filter = { _id: req.body.id };

  const usuarios = await UserCv.find(filter).populate(commentsPopulate);
  const enriched = await attachWorkedInEngloba(usuarios);
  response(res, 200, enriched);
};

// busca un usuario por ID (single)
const getUserCvID = async (req, res) => {
  const { id } = req.body;
  if (!id) throw new ClientError("Falta id", 400);
  const user = await UserCv.findById(id).populate(commentsPopulate);
  if (!user) throw new ClientError("No existe el usuario", 404);
  const enriched = await attachWorkedInEngloba(user);
  response(res, 200, enriched);
};

// borrar un usuario
const UserCvDeleteId = async (req, res) => {
  const filter = { _id: req.body._id };
  const deleteFileAux = await deleteFile(req.body._id);
  if (!deleteFileAux) throw new ClientError('No se ha podido borrar el cv', 400);
  await UserCv.deleteOne(filter);
  response(res, 200, { userDelete: true });
};

// modificar el usuario (SOLO nuevos campos *_Id)
const UserCvPut = async (req, res) => {
  const filter = { _id: req.body._id };
  const updateText = {};

  if (req.body.name)       updateText.name = req.body.name;
  if (req.body.email)      updateText.email = req.body.email;
  if (req.body.dni)        updateText.dni = req.body.dni.trim().toUpperCase();
  if (req.body.phone)      updateText.phone = req.body.phone;

  // NUEVOS campos por IDs
  if (req.body.jobsId)       updateText.jobsId = Array.isArray(req.body.jobsId) ? req.body.jobsId : [];
  if (req.body.studiesId)    updateText.studiesId = Array.isArray(req.body.studiesId) ? req.body.studiesId : [];
  if (req.body.provincesId)  updateText.provincesId = Array.isArray(req.body.provincesId) ? req.body.provincesId : [];

  if (req.body.about)         updateText.about = req.body.about;
  if (req.body.offer)         updateText.offer = req.body.offer;
  if (req.body.work_schedule) updateText.work_schedule = req.body.work_schedule;
  if (req.body.job_exchange !== undefined) updateText.job_exchange = !!req.body.job_exchange;
  if (req.body.numberCV !== undefined)     updateText.numberCV = +req.body.numberCV || 1;
  if (req.body.gender)        updateText.gender = req.body.gender;

  const dateNow = new Date();

  if (req.body.fostered !== undefined) {
    updateText.fostered = (req.body.fostered === 'si') || (req.body.fostered === true);
  }

  // $push acumulado para comentarios
  const pushOps = {};
  if (req.body.commentsPhone) {
    pushOps.commentsPhone = {
      userCv: req.body.id,
      nameUser: req.body.nameUserComment,
      date: dateNow,
      message: req.body.commentsPhone
    };
    updateText.view = req.body.id;
  }
  if (req.body.commentsVideo) {
    pushOps.commentsVideo = {
      userCv: req.body.id,
      nameUser: req.body.nameUserComment,
      date: dateNow,
      message: req.body.commentsVideo
    };
    updateText.view = req.body.id;
  }
  if (req.body.commentsInperson) {
    pushOps.commentsInperson = {
      userCv: req.body.id,
      nameUser: req.body.nameUserComment,
      date: dateNow,
      message: req.body.commentsInperson
    };
    updateText.view = req.body.id;
  }
  if (req.body.notes) {
    pushOps.notes = {
      userCv: req.body.id,
      nameUser: req.body.nameUserComment,
      date: dateNow,
      message: req.body.notes
    };
    updateText.view = req.body.id;
  }
  if (Object.keys(pushOps).length) {
    updateText.$push = {};
    for (const k of Object.keys(pushOps)) updateText.$push[k] = pushOps[k];
  }

  if (req.body.view !== undefined)     updateText.view = req.body.view;
  if (req.body.favorite !== undefined) updateText.favorite = req.body.favorite;
  if (req.body.reject !== undefined)   updateText.reject = req.body.reject;

  const doc = await UserCv.findOneAndUpdate(filter, updateText, { new: true }).populate(commentsPopulate);
  if (!doc) throw new ClientError("No existe el usuario", 400);

  const enriched = await attachWorkedInEngloba(doc);
  response(res, 200, enriched);
};

const getUsersCvsIDs = async (req, res) => {
  const userIds = req.body.ids || [];
  const usuarios = await UserCv.find({ _id: { $in: userIds } }).populate(commentsPopulate);
  const enriched = await attachWorkedInEngloba(usuarios);
  response(res, 200, enriched);
};

module.exports = {
  postCreateUserCv: catchAsync(postCreateUserCv),
  getUserCvs: catchAsync(getUserCvs),
  getUserCvID: catchAsync(getUserCvID),
  UserCvDeleteId: catchAsync(UserCvDeleteId),
  UserCvPut: catchAsync(UserCvPut),
  getUserCvsFilter: catchAsync(getUserCvsFilter),
  getUsersCvsIDs: catchAsync(getUsersCvsIDs)
};
