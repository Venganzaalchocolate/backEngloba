// controllers/users.js
const { User, Program, Periods, Leaves, Preferents, Dispositive } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { validateRequiredFields, createAccentInsensitiveRegex } = require('../utils/utils');
const { uploadFileToDrive, getFileById, deleteFileById, gestionAutomaticaNominas, obtenerCarpetaContenedora } = require('./googleController');
const { createUserWS, deleteUserByEmailWS, addUserToGroup, deleteMemeberAllGroups } = require('./workspaceController');
const { actualizacionHiringyLeave } = require('./periodoTransicionController');

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);

async function hasOpenHiring(userId) {
  const count = await Periods.countDocuments({
    idUser: userId,
    active: true,
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  });
  return count > 0;
}

const parseField = (field, fieldName) => {
  if (Array.isArray(field)) return field;
  try {
    const parsedField = JSON.parse(field);
    if (Array.isArray(parsedField)) return parsedField;
    throw new Error(`${fieldName} debe ser un array.`);
  } catch {
    throw new ClientError(`Error al procesar ${fieldName}`, 400);
  }
};

// helpers
const toTitleCase = (str) =>
  str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const toObjectId = (id, fieldName) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ClientError(`"${fieldName}" no es un ObjectId válido`, 400);
  }
  return new mongoose.Types.ObjectId(id);
};
const normalizeDni = (dni) => String(dni).replace(/\s+/g, '').trim().toUpperCase();
const debug = (...args) => console.log('[postCreateUser]', ...args);

// =========================
// CREATE USER (migrado a Dispositive)
// =========================
const postCreateUser = async (req, res) => {
  const requiredFields = [
    'dni',
    'firstName',
    'lastName',
    'email',
    'phone',
    'role',
    'gender',
    'birthday',
    'hiringPeriods'
  ];
  validateRequiredFields(req.body, requiredFields);

  const {
    dni,
    firstName,
    lastName,
    email,
    phone,
    role,
    gender,
    birthday,
    employmentStatus = 'en proceso de contratación',
    notes,
    disability,
    fostered,
    apafa,
    studies,
    phoneJobNumber,
    phoneJobExtension,
    hiringPeriods
  } = req.body;

  // 1) User payload
  const userData = {
    dni: normalizeDni(dni),
    role,
    firstName: toTitleCase(firstName),
    lastName: toTitleCase(lastName || ''),
    email_personal: String(email).toLowerCase(),
    phone,
    employmentStatus,
    notes,
    gender,
  };

  const bday = new Date(birthday);
  if (Number.isNaN(bday.getTime())) {
    throw new ClientError('Fecha de nacimiento no válida', 400);
  }
  userData.birthday = bday;

  if (disability) userData.disability = disability;
  if (fostered === 'si') userData.fostered = true;
  else if (fostered === 'no') userData.fostered = false;

  if (apafa === 'si') userData.apafa = true;
  else if (apafa === 'no') userData.apafa = false;

  if (Array.isArray(studies) && studies.length) {
    userData.studies = studies.map((s) => toObjectId(s, 'studies[]'));
  }

  if (phoneJobNumber || phoneJobExtension) {
    userData.phoneJob = {};
    if (phoneJobNumber) userData.phoneJob.number = phoneJobNumber;
    if (phoneJobExtension) userData.phoneJob.extension = phoneJobExtension;
  }

  // 2) Hiring input
  if (!Array.isArray(hiringPeriods) || hiringPeriods.length === 0) {
    throw new ClientError('Debes enviar el primer periodo de contratación ', 400);
  }

  const inputHiring = hiringPeriods[0];
  // AHORA requerimos 'dispositive' (no 'device')
  const requiredHiringFields = ['startDate', 'dispositiveId', 'position', 'workShift'];
  validateRequiredFields(inputHiring, requiredHiringFields);
  if (!inputHiring.workShift?.type) {
    throw new ClientError('El hiring debe incluir "workShift.type"', 400);
  }

  // 3) Crear usuario
  let newUser;
  let replacementUser;

  if (inputHiring.dnireplacement) {
    const dniRep = normalizeDni(inputHiring.dnireplacement);
    replacementUser = await User.findOne(
      { dni: { $regex: `^${dniRep}$`, $options: 'i' } },
      { _id: 1 }
    ).lean();
    if (!replacementUser) {
      throw new ClientError('El trabajador al que sustituye no existe', 400);
    }
  }

  try {
    newUser = await User.create(userData);
  } catch (error) {
    if (error.code === 11000) {
      const [[, dupValue]] = Object.entries(error.keyValue);
      throw new ClientError(`'${dupValue}' está duplicado, no se pudo crear el usuario, ya que debe ser único`, 400);
    }
    throw new ClientError('Error al crear el usuario', 500);
  }

  // 4) Hiring doc (usa dispositiveID)
  const dispositiveId = toObjectId(inputHiring.dispositiveId, 'dispositiveId');
  const hiringDoc = {
    idUser: newUser._id,
    startDate: new Date(inputHiring.startDate),
    endDate: inputHiring.endDate ? new Date(inputHiring.endDate) : null,
    dispositiveID: dispositiveId, // <-- migrado
    position: toObjectId(inputHiring.position, 'position'),
    workShift: { type: inputHiring.workShift.type },
    active: inputHiring.active !== false,
  };

  if (inputHiring.selectionProcess) {
    hiringDoc.selectionProcess = toObjectId(inputHiring.selectionProcess, 'selectionProcess');
  }

  // 4.1) Replacement por DNI
  if (inputHiring.dnireplacement) {
    hiringDoc.replacement = { user: replacementUser._id };
    try {
      const openLeave = await Leaves.findOne({
        idUser: replacementUser._id,
        actualEndLeaveDate: null,
      })
        .sort({ startLeaveDate: -1 })
        .select({ _id: 1 })
        .lean();

      if (openLeave?._id) {
        hiringDoc.replacement.leave = openLeave._id;
      } else {
        const lastLeave = await Leaves.findOne({ idUser: replacementUser._id })
          .sort({ startLeaveDate: -1 })
          .select({ _id: 1 })
          .lean();
        if (lastLeave?._id) hiringDoc.replacement.leave = lastLeave._id;
      }
    } catch (err) {
      console.log('[postCreateUser] Leaves lookup ERROR:', err?.message || err);
    }
  }

  let createdHiring;
  try {
    createdHiring = await Periods.create(hiringDoc);
  } catch {
    await User.deleteOne({ _id: newUser._id });
    throw new ClientError('No se pudo crear el periodo de contratación inicial', 400);
  }

  // 6) Workspace / group + Preferents cleanup (vía Dispositive)
  try {
    const dsp = await Dispositive.findById(dispositiveId)
      .select('groupWorkspace province program')
      .lean();

    const groupWorkspaceId = dsp?.groupWorkspace;
    if (groupWorkspaceId) {
      await addUserToGroup(newUser._id, groupWorkspaceId);
    } else {
      debug('No groupWorkspaceId for dispositive; skipping addUserToGroup');
    }

    // Preferents: cerrar coincidentes por puesto + provincia del dispositive
    if (dsp?.province) {
      await Preferents.updateMany(
        {
          user: newUser._id,
          active: true,
          jobs: hiringDoc.position,
          provinces: dsp.province
        },
        { $set: { active: false, moveDone: true } }
      );
    }
  } catch (e) {
    debug('Workspace/Preferents (non-blocking):', e?.name, e?.message);
  }

  return response(res, 200, newUser);
};

// =========================
// ESTADO ACTUAL (sin cambios relevantes a device)
// =========================
async function getUsersCurrentStatus(req, res) {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ClientError('userIds es requerido (array)', 400);
  }

  const ids = userIds.filter(Boolean).map(toId);
  const now = new Date();

  const periods = await Periods.find(
    {
      idUser: { $in: ids },
      active: { $ne: false },
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gt: now } },
      ],
    },
    {
      _id: 1,
      idUser: 1,
      replacement: 1,
      startDate: 1,
    }
  ).lean();

  const pByUser = new Map();
  for (const p of periods) {
    const k = String(p.idUser);
    if (!pByUser.has(k)) pByUser.set(k, []);
    pByUser.get(k).push(p);
  }

  const periodIds = periods.map(p => p._id);
  let openLeavesByPeriod = new Set();
  if (periodIds.length) {
    const openLeaves = await Leaves.find(
      {
        idPeriod: { $in: periodIds },
        active: { $ne: false },
        $or: [{ actualEndLeaveDate: { $exists: false } }, { actualEndLeaveDate: null }],
      },
      { _id: 1, idPeriod: 1 }
    ).lean();
    openLeavesByPeriod = new Set(openLeaves.map(l => String(l.idPeriod)));
  }

  const replacementLeaveIds = [];
  const replacementUserIds = [];
  for (const p of periods) {
    if (p?.replacement?.leave) replacementLeaveIds.push(toId(p.replacement.leave));
    if (p?.replacement?.user) replacementUserIds.push(toId(p.replacement.user));
  }

  const leaveInfoMap = new Map();
  if (replacementLeaveIds.length) {
    const repLeaves = await Leaves.find(
      { _id: { $in: replacementLeaveIds } },
      {
        _id: 1, idUser: 1, leaveType: 1,
        startLeaveDate: 1, expectedEndLeaveDate: 1, actualEndLeaveDate: 1, active: 1
      }
    ).populate('leaveType', 'name').lean();

    for (const l of repLeaves) {
      leaveInfoMap.set(String(l._id), {
        idUser: String(l.idUser),
        typeName: l.leaveType?.name || null,
        startLeaveDate: l.startLeaveDate || null,
        expectedEndLeaveDate: l.expectedEndLeaveDate || null,
        finished: !!l.actualEndLeaveDate,
      });
      if (l.idUser) replacementUserIds.push(toId(l.idUser));
    }
  }

  const usersMap = new Map();
  if (replacementUserIds.length) {
    const udocs = await User.find(
      { _id: { $in: replacementUserIds } },
      { _id: 1, firstName: 1, lastName: 1, dni: 1 }
    ).lean();
    for (const u of udocs) {
      usersMap.set(String(u._id), {
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        dni: (u.dni || '').replace(/\s+/g, '').toUpperCase(),
      });
    }
  }

  const items = ids.map((uid) => {
    const key = String(uid);
    const ps = (pByUser.get(key) || []).sort(
      (a, b) => new Date(b.startDate) - new Date(a.startDate)
    );

    const isSubstituting = ps.some(p => !!p?.replacement?.user);
    const isOnLeave = ps.some(p => openLeavesByPeriod.has(String(p._id)));

    const chosen = ps.find(p => p?.replacement?.leave) || ps.find(p => p?.replacement?.user);

    let replacement = null;
    if (chosen?.replacement?.user) {
      const personId = String(chosen.replacement.user);
      const person = usersMap.get(personId) || { name: null, dni: null };

      if (chosen.replacement.leave) {
        const lid = String(chosen.replacement.leave);
        const info = leaveInfoMap.get(lid) || null;
        replacement = {
          personName: person.name,
          personDni: person.dni,
          leave: info
            ? {
                typeName: info.typeName,
                startLeaveDate: info.startLeaveDate,
                expectedEndLeaveDate: info.expectedEndLeaveDate,
                finished: info.finished,
              }
            : null,
        };
      } else {
        replacement = {
          personName: person.name,
          personDni: person.dni,
        };
      }
    }

    return { userId: uid, isSubstituting, isOnLeave, replacement };
  });

  return response(res, 200, { items });
};

// =========================
// LIST USERS (migrado a Dispositive / dispositiveID)
// =========================
const getUsers = async (req, res) => {
  if (!req.body.page || !req.body.limit) {
    throw new ClientError("Faltan datos no son correctos", 400);
  }

  const page  = parseInt(req.body.page, 10)  || 1;
  const limit = parseInt(req.body.limit, 10) || 10;

  const filters = {};

  // ---------------- Búsquedas por texto y flags de User ----------------
  if (req.body.firstName) {
    const rx = createAccentInsensitiveRegex(req.body.firstName);
    filters.firstName = { $regex: rx };
  }
  if (req.body.lastName) {
    const rx = createAccentInsensitiveRegex(req.body.lastName);
    filters.lastName = { $regex: rx };
  }

  if (req.body.email) filters.email = { $regex: req.body.email, $options: 'i' };
  if (req.body.phone) filters.phone = { $regex: req.body.phone, $options: 'i' };
  if (req.body.dni)   filters.dni   = { $regex: req.body.dni,   $options: 'i' };
  if (req.body.gender) filters.gender = req.body.gender;

  if (req.body.fostered === "si") filters.fostered = true;
  if (req.body.fostered === "no") filters.fostered = false;
  if (req.body.apafa === "si") filters.apafa = true;
  if (req.body.apafa === "no") filters.apafa = false;

  if (req.body.disability !== undefined) {
    if (req.body.disability === "si") filters["disability.percentage"] = { $gt: 0 };
    if (req.body.disability === "no") filters["disability.percentage"] = 0;
  }

  // Estado laboral
  if (req.body.status) {
    if (req.body.status === 'total') {
      filters.employmentStatus = { $in: ['activo', 'en proceso de contratación'] };
    } else {
      filters.employmentStatus = req.body.status;
    }
  }

  // ---------------- Resolución por provincia / programa / dispositive via Dispositive ----------------
  const intersectArrays = (a, b) => {
    if (!a || !b) return [];
    const s = new Set(a);
    return b.filter(x => s.has(x));
  };

  let dispositiveIdsFromProvinces = null;
  let dispositiveIdsFromProgram   = null;

  // provinces -> lista de dispositiveIDs de esa provincia
  if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
    const byProv = await Dispositive.find({ province: toId(req.body.provinces) })
      .select('_id').lean();
    dispositiveIdsFromProvinces = byProv.map(d => String(d._id));
  }

  // programId -> lista de dispositiveIDs del programa
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const byProg = await Dispositive.find({ program: toId(req.body.programId) })
      .select('_id').lean();
    dispositiveIdsFromProgram = byProg.map(d => String(d._id));
  }

  let finalDispositiveIds = null;
  if (dispositiveIdsFromProvinces && dispositiveIdsFromProgram) {
    finalDispositiveIds = intersectArrays(dispositiveIdsFromProvinces, dispositiveIdsFromProgram);
  } else if (dispositiveIdsFromProvinces) {
    finalDispositiveIds = dispositiveIdsFromProvinces;
  } else if (dispositiveIdsFromProgram) {
    finalDispositiveIds = dispositiveIdsFromProgram;
  }

  // position
  let positionId = null;
  if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
    positionId = String(req.body.position);
  }

  // dispositive concreto
  let singleDispositiveId = null;
  if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
    singleDispositiveId = String(req.body.dispositive);
  }

  // ¿Necesitamos filtrar por periodos abiertos?
  const mustFilterByOpenPeriods =
    !!finalDispositiveIds || !!positionId || !!singleDispositiveId;

  if (mustFilterByOpenPeriods) {
    // Combinar dispositivo concreto con la lista (intersección)
    let allowedDispositiveIds = finalDispositiveIds;
    if (singleDispositiveId) {
      allowedDispositiveIds = allowedDispositiveIds
        ? intersectArrays(allowedDispositiveIds, [singleDispositiveId])
        : [singleDispositiveId];
    }

    const periodFilter = {
      active: { $ne: false },
      $or: [{ endDate: null }, { endDate: { $exists: false } }],
    };

    if (allowedDispositiveIds && allowedDispositiveIds.length) {
      periodFilter.dispositiveID = { $in: allowedDispositiveIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
    if (positionId) {
      periodFilter.position = new mongoose.Types.ObjectId(positionId);
    }

    const userIdsFromPeriods = await Periods
      .find(periodFilter)
      .distinct('idUser');

    if (!userIdsFromPeriods.length) {
      return response(res, 200, { users: [], totalPages: 0 });
    }

    filters._id = { $in: userIdsFromPeriods };
  }

  // ---------------- Paginación sobre Users ya filtrados ----------------
  const totalDocs  = await User.countDocuments(filters);
  const totalPages = Math.ceil(totalDocs / limit);

  const users = await User.find(filters)
    .populate({
      path: 'files.filesId',
      model: 'Filedrive',
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return response(res, 200, { users, totalPages });
};

// =========================
// getAllUsersWithOpenPeriods (migrado a Dispositive / dispositiveID)
// =========================
const getAllUsersWithOpenPeriods = async (req, res) => {
  const filters = {};

  if (req.body.firstName) {
    const rx = createAccentInsensitiveRegex(req.body.firstName);
    filters.firstName = { $regex: rx };
  }
  if (req.body.lastName) {
    const rx = createAccentInsensitiveRegex(req.body.lastName);
    filters.lastName = { $regex: rx };
  }
  if (req.body.email) filters.email = { $regex: req.body.email, $options: 'i' };
  if (req.body.phone) filters.phone = { $regex: req.body.phone, $options: 'i' };
  if (req.body.dni)   filters.dni   = { $regex: req.body.dni,   $options: 'i' };
  if (req.body.gender) filters.gender = req.body.gender;

  if (req.body.fostered === "si") filters.fostered = true;
  if (req.body.fostered === "no") filters.fostered = false;
  if (req.body.apafa === "si") filters.apafa = true;
  if (req.body.apafa === "no") filters.apafa = false;

  if (req.body.disability !== undefined) {
    if (req.body.disability === "si") filters["disability.percentage"] = { $gt: 0 };
    if (req.body.disability === "no") filters["disability.percentage"] = 0;
  }

  if (req.body.status) {
    filters.employmentStatus = req.body.status === 'total'
      ? { $in: ['activo', 'en proceso de contratación'] }
      : req.body.status;
  }

  // Filtros de Periods abiertos
  const hiringQuery = {
    active: { $ne: false },
    $or: [{ endDate: { $exists: false } }, { endDate: null }],
  };

  let dispositiveIds = null;

  // provinces -> dispositiveIDs
  if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
    const byProv = await Dispositive.find({ province: toId(req.body.provinces) })
      .select('_id').lean();
    dispositiveIds = (dispositiveIds || []).concat(byProv.map(d => String(d._id)));
  }

  // programId -> dispositiveIDs
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const byProg = await Dispositive.find({ program: toId(req.body.programId) })
      .select('_id').lean();
    const idsFromProgram = byProg.map(d => String(d._id));
    dispositiveIds = dispositiveIds
      ? dispositiveIds.filter(id => idsFromProgram.includes(id))
      : idsFromProgram;
  }

  if (dispositiveIds?.length) {
    hiringQuery.dispositiveID = { $in: dispositiveIds.map(id => new mongoose.Types.ObjectId(id)) };
  }

  if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
    hiringQuery.dispositiveID = new mongoose.Types.ObjectId(req.body.dispositive);
  }

  if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
    hiringQuery.position = new mongoose.Types.ObjectId(req.body.position);
  }

  const openHirings = await Periods
    .find(hiringQuery)
    .select('idUser dispositiveID position workShift startDate endDate')
    .lean();

  const userIds = [...new Set(openHirings.map(h => String(h.idUser)))];

  if (userIds.length === 0) {
    return response(res, 200, { users: [] });
  }

  filters._id = { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) };

  const users = await User.find(filters).lean();

  const byUser = openHirings.reduce((acc, h) => {
    const k = String(h.idUser);
    (acc[k] ||= []).push(h);
    return acc;
  }, {});

  const processed = users.map(u => ({
    ...u,
    openHirings: byUser[String(u._id)] || []
  }));

  response(res, 200, { users: processed });
};

// =========================
// getUsersFilter (igual)
// =========================
const getUsersFilter = async (req, res) => {
  const filter = { name: { $regex: `.*${req.body.name}.*` } }
  const usuarios = await User.find(filter);
  response(res, 200, usuarios);
};

// =========================
// getUserID (igual)
// =========================
const getUserID = async (req, res) => {
  const { id, dni } = req.body || {};
  let usuario = null;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    usuario = await User.findById(id).populate({
      path: 'files.filesId',
      model: 'Filedrive',
    });
  } else if (dni) {
    const dniNorm = String(dni).replace(/\s+/g, '').toUpperCase();
    usuario = await User.findOne({
      dni: { $regex: `^${dniNorm}$`, $options: 'i' },
    }).populate({
      path: 'files.filesId',
      model: 'Filedrive',
    });
  } else {
    throw new ClientError('Debes enviar "id" válido o "dni".', 400);
  }

  if (!usuario) {
    throw new ClientError('Usuario no encontrado', 404);
  }

  response(res, 200, usuario);
};

// =========================
// getUserName (igual)
// =========================
const getUserName = async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ClientError('Debes proporcionar una lista de IDs válida', 400);
  }

  const uniqueIds = Array.from(new Set(ids));

  const users = await User.find(
    { _id: { $in: uniqueIds } },
    { firstName: 1, lastName: 1 }
  );

  response(res, 200, users);
};

// =========================
// getFileUser (igual)
// =========================
const getFileUser = async (req, res) => {
  const userId = req.body.id;
  const fileId = req.body.idFile;

  const user = await User.findOne({
    _id: userId,
    'files.fileName': fileId,
  });

  if (!user) {
    throw new ClientError('Usuario no encontrado', 404);
  }

  const { file, stream } = await getFileById(fileId);

  if (!stream) {
    throw new ClientError('Archivo no encontrado en Google Drive', 404);
  }

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.name}"`
  );
  res.setHeader('Content-Type', file.mimeType);
  stream.pipe(res);
};

// =========================
// UserDeleteId (igual)
// =========================
const UserDeleteId = async (req, res) => {
  const id = req.body.id;
  if (!id) {
    throw new ClientError('Falta id de usuario', 400);
  }
  const LeaveModel   = Leaves;
  const PeriodsModel = Periods;

  const userToDelete = await User.findById(id);
  if (!userToDelete) {throw new ClientError('Falta usuario no encontrado', 400);}

  const driveFileIds = [];
  if (Array.isArray(userToDelete.files)) {
    for (const f of userToDelete.files) {
      if (f?.fileName) driveFileIds.push(f.fileName);
    }
  }
  if (Array.isArray(userToDelete.payrolls)) {
    for (const p of userToDelete.payrolls) {
      if (p?.pdf)  driveFileIds.push(p.pdf);
      if (p?.sign) driveFileIds.push(p.sign);
    }
  }
  for (const fileId of driveFileIds) {
    const del = await deleteFileById(fileId);
    if(!del.success) throw new ClientError('Error al borrar archivos en drive', 400);
  }

  await LeaveModel.deleteMany({ idUser: id });
  await PeriodsModel.deleteMany({ idUser: id });

  if (userToDelete.email) {
    try { await deleteUserByEmailWS(userToDelete.email); } catch (e) {
      console.log('[UserDeleteId] Fallo al borrar en Workspace:', e?.message || e);
    }
  }

  const userDeleteResult = await User.deleteOne({ _id: id });
  return response(res, 200, userDeleteResult);
};

// =========================
// userPut (igual salvo lógica previa intacta)
// =========================
const userPut = async (req, res) => {
  const files = req.files;

  if (!req.body._id) {
    throw new ClientError('El ID de usuario es requerido', 400);
  }
  let updateFields = {};

  if (req.body.employmentStatus){
    const userAux = await User
      .findById(req.body._id)
      .select({ firstName: 1, lastName: 1, email: 1 });

    if (req.body.employmentStatus === 'ya no trabaja con nosotros') {
      const open = await hasOpenHiring(req.body._id);
      if (open) {
        throw new ClientError(
          `Para cambiar el estado laboral a "Ya no trabaja con nosotros" se deben cerrar todos los periodos de contratación`,
          400
        );
      }
      if (userAux.email) await deleteUserByEmailWS(userAux.email);
      updateFields.email = '';
      updateFields.employmentStatus = 'ya no trabaja con nosotros';
    } else {
      updateFields.employmentStatus = req.body.employmentStatus;
      if (!userAux.email){
        const created = await createUserWS(userAux._id);
        updateFields.email = created.email;
      }
    }
  }

  if (req.body.vacationDays) {
    updateFields.vacationDays = parseField(req.body.vacationDays, 'vacationDays').map((date) => {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) throw new ClientError(`Fecha no válida en vacationDays: ${date}`, 400);
      return parsedDate;
    });
  }

  if (req.body.personalDays) {
    updateFields.personalDays = parseField(req.body.personalDays, 'personalDays').map((date) => {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) throw new ClientError(`Fecha no válida en personalDays: ${date}`, 400);
      return parsedDate;
    });
  }

  updateFields = { ...updateFields };

  if (req.body.firstName) updateFields.firstName = toTitleCase(req.body.firstName);
  if (req.body.lastName) updateFields.lastName = toTitleCase(req.body.lastName);
  if (req.body.email_personal) updateFields.email_personal = req.body.email_personal.toLowerCase();
  if (req.body.role) updateFields.role = req.body.role;
  if (req.body.phone) updateFields.phone = req.body.phone;
  if (req.body.dni) updateFields.dni = req.body.dni.replace(/\s+/g, "").trim().toUpperCase();
  if (req.body.employmentStatus) updateFields.employmentStatus = req.body.employmentStatus;
  if (req.body.socialSecurityNumber) updateFields.socialSecurityNumber = req.body.socialSecurityNumber;
  if (req.body.bankAccountNumber) updateFields.bankAccountNumber = req.body.bankAccountNumber;

  if (req.body.disPercentage) updateFields.disability = { percentage: req.body.disPercentage };

  if (req.body.birthday) {
    const parsedDate = new Date(req.body.birthday);
    if (isNaN(parsedDate)) {
      throw new ClientError(`Fecha de nacimiento no válida`, 400);
    } else {
      updateFields.birthday = parsedDate;
    }
  }

  if (req.body.disNotes) updateFields.disability = { ...(updateFields.disability || {}), notes: req.body.disNotes };
  if (req.body.gender) updateFields.gender = req.body.gender;
  if (req.body.fostered === "si") updateFields.fostered = true;
  else if (req.body.fostered === "no") updateFields.fostered = false;
  if (req.body.apafa === "si") updateFields.apafa = true;
  else if (req.body.apafa === "no") updateFields.apafa = false;
  if (req.body.consetmentDataProtection === "si") updateFields.consetmentDataProtection = true;
  else if (req.body.consetmentDataProtection === "no") updateFields.consetmentDataProtection = false;

  if (req.body.studies) {
    updateFields.studies = parseField(req.body.studies, 'studies').map((s) => new mongoose.Types.ObjectId(s));
  }

  if (req.body.phoneJobNumber || req.body.phoneJobExtension) {
    updateFields.phoneJob = {};
    if (req.body.phoneJobNumber) updateFields.phoneJob.number = req.body.phoneJobNumber;
    if (req.body.phoneJobExtension) updateFields.phoneJob.extension = req.body.phoneJobExtension;
  }

  if (files && files.length > 0) {
    const folderId = process.env.GOOGLE_DRIVE_APPFILE;
    const user = await User.findById(req.body._id).select('files');
    const existingFiles = user.files || [];
    const newFiles = [];

    for (const file of files) {
      const uniqueFileName = `${req.body._id}-${file.fieldname}.pdf`;
      const fileTag = file.fieldname;
      const description = `Archivo subido para ${fileTag}`;
      const nameDateFile = file.fieldname + '-date';
      let date = null;

      if (req.body[nameDateFile]) {
        const timestamp = Date.parse(req.body[nameDateFile]);
        if (!isNaN(timestamp)) date = new Date(req.body[nameDateFile]);
      }

      try {
        const fileDriveData = await uploadFileToDrive(file, folderId, uniqueFileName);
        newFiles.push({
          fileName: fileDriveData.id,
          fileTag,
          description,
          date,
        });
      } catch {
        throw new ClientError(`Error al procesar el archivo ${file.fieldname}`, 500);
      }
    }

    const combinedFiles = [
      ...existingFiles.filter((file) => !newFiles.some((n) => n.fileTag === file.fileTag)),
      ...newFiles,
    ];

    updateFields.files = combinedFiles;
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.body._id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate({
      path: 'files.filesId',
      model: 'Filedrive',
    });

    response(res, 200, updatedUser);
  } catch (error) {
    if (error.code === 11000) {
      const [[, dupValue]] = Object.entries(error.keyValue);
      throw new ClientError(
        `'${dupValue}' ya existe. No se pudo actualizar el usuario ya que debe ser único.`,
        400
      );
    }
    throw new ClientError('Error al actualizar el usuario', 500);
  }
};

// =========================
// Payroll (igual)
// =========================
const deletePayroll = async (userId, payrollId) => {
  try {
    const user = await User.findOne(
      { _id: userId, 'payrolls._id': payrollId },
      { 'payrolls.$': 1 }
    );

    if (!user) return false;

    if (user.payrolls[0].sign) {
      await deleteFileById(user.payrolls[0].sign);
    }
    const deleteResponse = await deleteFileById(user.payrolls[0].pdf)
    if (deleteResponse.success) {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { payrolls: { _id: payrollId } } },
        { new: true }
      ).populate({
        path: 'files.filesId',
        model: 'Filedrive',
      });

      return result;
    } else {
      return false
    }
  } catch {
    return false;
  }
};

const createPayroll = async (idUser, file, payrollYear, payrollMonth) => {
  try {
    const userAux = await User.findById(idUser);
    if (!userAux) throw new Error('Usuario no encontrado');

    const fileNameAux = `${userAux.dni}_${payrollMonth}_${payrollYear}.pdf`;
    const folderId = process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS;
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

    if (fileAux) {
      const gestionado = await gestionAutomaticaNominas();
      if (gestionado) {
        return await User.findById(idUser).populate({
          path: 'files.filesId',
          model: 'Filedrive',
        });
      }
    } else {
      throw new Error('Error al subir el archivo a Google Drive');
    }
  } catch {
    return null;
  }
};

const signPayroll = async (idUser, file, payrollYear, payrollMonth, idPayroll) => {
  try {
    const userAux = await User.findOne(
      { _id: idUser, 'payrolls._id': idPayroll },
      { dni: 1, 'payrolls.$': 1 }
    );

    if (!userAux || !userAux.payrolls || userAux.payrolls.length === 0) {
      return null;
    }

    const result = {
      dni: userAux.dni,
      pdf: userAux.payrolls[0].pdf
    };

    const fileNameAux = `${result.dni}_${payrollMonth}_${payrollYear}_signed.pdf`;
    const folderId = await obtenerCarpetaContenedora(result.pdf);
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

    if (fileAux) {
      return await User.findOneAndUpdate(
        { _id: idUser, 'payrolls._id': idPayroll },
        { $set: { 'payrolls.$.sign': fileAux.id } },
        { new: true }
      ).populate({
        path: 'files.filesId',
        model: 'Filedrive',
      });
    } else {
      throw new Error('Error al subir el archivo a Google Drive');
    }
  } catch {
    return null;
  }
};

const payroll = async (req, res) => {
  if (!req.body.userId) throw new ClientError('El campo userId es requerido', 400);
  if (!req.body.type) throw new ClientError('La acción es requerida', 400);

  const id = req.body.userId;
  const file = req.file;

  if (req.body.type === 'create') {
    if (!file) throw new ClientError('El archivo es requerido para la creación de nóminas', 400);
    const requiredFields = ['payrollYear', 'payrollMonth'];
    validateRequiredFields(req.body, requiredFields);
    const createResult = await createPayroll(id, file, req.body.payrollYear, req.body.payrollMonth);
    if (!createResult) throw new ClientError('No se ha podido subir la nómina', 400);
    return response(res, 200, createResult);

  } else if (req.body.type === 'delete') {
    if (!req.body.idPayroll) throw new ClientError('El campo idPayroll es requerido', 400);
    const newUser = await deletePayroll(id, req.body.idPayroll);
    if (!!newUser) return response(res, 200, newUser);
    throw new ClientError('No se ha podido borrar la nómina', 404);

  } else if (req.body.type === 'get') {
    if (!req.body.pdf) throw new ClientError('El campo pdf es requerido', 400);
    const { file, stream } = await getFileById(req.body.pdf);
    if (!stream) throw new ClientError('Archivo no encontrado en Google Drive', 404);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.mimeType);
    stream.pipe(res);

  } else if (req.body.type === 'sign') {
    const requiredFields = ['payrollYear', 'payrollMonth', 'idPayroll'];
    validateRequiredFields(req.body, requiredFields);
    if (!file) throw new ClientError('El archivo es requerido para la firma de la nómina', 400);
    const signResult = await signPayroll(id, file, req.body.payrollYear, req.body.payrollMonth, req.body.idPayroll);
    if (!signResult) throw new ClientError('No se ha podido subir la nómina', 400);
    return response(res, 200, signResult);
  }
};

// =========================
// Rehire (migrado a Dispositive / dispositiveID)
// =========================
const rehireUser = async (req, res) => {
  validateRequiredFields(req.body, ['dni', 'hiring']);

  const rawDni = req.body.dni;
  const hiringInput = req.body.hiring;
  if (typeof rawDni !== 'string') {
    throw new ClientError('El DNI debe ser un string', 400);
  }

  const dni = normalizeDni(rawDni);

  const userDoc = await User.findOne({
    dni: { $regex: `^${dni}$`, $options: 'i' }
  });
  if (!userDoc) {
    throw new ClientError('Usuario no encontrado', 404);
  }

  if (!hiringInput?.workShift?.type) {
    throw new ClientError('El hiring debe incluir "workShift.type"', 400);
  }
  const workShiftType = hiringInput.workShift.type;

  const openPeriods = await Periods.find({
    idUser: userDoc._id,
    active: { $ne: false },
    $or: [{ endDate: null }, { endDate: { $exists: false } }]
  }).select({ workShift: 1 }).lean();

  const openFullTime = openPeriods.filter(p => p.workShift?.type === 'completa').length;
  const openPartTime = openPeriods.filter(p => p.workShift?.type === 'parcial').length;

  const hasEndDate = !!hiringInput.endDate;
  if (!hasEndDate) {
    if (workShiftType === 'completa') {
      if (openFullTime > 0 || openPartTime > 0) {
        throw new ClientError('Ya existe un periodo abierto; no se puede crear otro a jornada completa', 400);
      }
    } else if (workShiftType === 'parcial') {
      if (openFullTime > 0) {
        throw new ClientError('Hay un periodo abierto a jornada completa; no se puede crear uno parcial', 400);
      }
      if (openPartTime >= 2) {
        throw new ClientError('No se permiten más de 2 periodos abiertos a media jornada', 400);
      }
    } else {
      throw new ClientError('Tipo de jornada inválido', 400);
    }
  }

  // Documento del nuevo Period (usa dispositiveID)
  const hiringDoc = {
    idUser: userDoc._id,
    startDate: new Date(hiringInput.startDate),
    endDate: hiringInput.endDate ? new Date(hiringInput.endDate) : null,
    dispositiveID: toObjectId(hiringInput.dispositiveId, 'dispositiveId'),
    position: toObjectId(hiringInput.position, 'position'),
    workShift: { type: workShiftType },
    active: hiringInput.active !== false,
  };

  if (hiringInput.selectionProcess) {
    hiringDoc.selectionProcess = toObjectId(hiringInput.selectionProcess, 'selectionProcess');
  }

  // Replacement por DNI
  const dniReplacement = hiringInput.dnireplacement || hiringInput?.reason?.dni || null;
  if (dniReplacement) {
    const dniRep = normalizeDni(dniReplacement);
    const replacementUser = await User.findOne(
      { dni: { $regex: `^${dniRep}$`, $options: 'i' } },
      { _id: 1 }
    );
    if (!replacementUser) {
      throw new ClientError('El trabajador al que sustituye no existe', 400);
    }

    hiringDoc.replacement = { user: replacementUser._id };

    const openLeave = await Leaves.findOne({
      idUser: replacementUser._id,
      active: { $ne: false },
      actualEndLeaveDate: null
    }).sort({ startLeaveDate: -1 }).select({ _id: 1 });

    if (openLeave) {
      hiringDoc.replacement.leave = openLeave._id;
    } else {
      const lastLeave = await Leaves.findOne({ idUser: replacementUser._id })
        .sort({ startLeaveDate: -1 })
        .select({ _id: 1 });
      if (lastLeave) hiringDoc.replacement.leave = lastLeave._id;
    }
  }

  let createdPeriod;
  try {
    createdPeriod = await Periods.create(hiringDoc);
  } catch {
    throw new ClientError('No se pudo crear el nuevo periodo de contratación', 400);
  }

  // Asegurar email corporativo y grupo + Preferents por provincia del dispositive
  try {
    if (!userDoc.email) {
      const ws = await createUserWS(userDoc._id);
      if (ws?.email) {
        await User.updateOne(
          { _id: userDoc._id },
          { $set: { email: ws.email, employmentStatus: 'en proceso de contratación' } }
        );
        userDoc.email = ws.email;
      } else {
        await User.updateOne(
          { _id: userDoc._id },
          { $set: { employmentStatus: 'en proceso de contratación' } }
        );
      }
    } else {
      await User.updateOne(
        { _id: userDoc._id },
        { $set: { employmentStatus: 'en proceso de contratación' } }
      );
    }

    const dsp = await Dispositive.findById(hiringDoc.dispositiveID)
      .select('groupWorkspace province')
      .lean();

    const groupWorkspaceId = dsp?.groupWorkspace;
    if (groupWorkspaceId) {
      await addUserToGroup(userDoc._id, groupWorkspaceId);
    }

    if (dsp?.province) {
      await Preferents.updateMany(
        {
          user: userDoc._id,
          active: true,
          jobs: hiringDoc.position,
          provinces: dsp.province
        },
        { $set: { active: false, moveDone: true } }
      );
    }
  } catch {
    // non-blocking
  }

  const updatedUser = await User.findById(userDoc._id);
  return response(res, 200, { user: updatedUser, period: createdPeriod });
};



module.exports = {
  postCreateUser: catchAsync(postCreateUser),
  getUsers: catchAsync(getUsers),
  getUserID: catchAsync(getUserID),
  UserDeleteId: catchAsync(UserDeleteId),
  userPut: catchAsync(userPut),
  getUsersFilter: catchAsync(getUsersFilter),
  payroll: catchAsync(payroll),
  rehireUser: catchAsync(rehireUser),
  getFileUser: catchAsync(getFileUser),
  getUserName: catchAsync(getUserName),
  getAllUsersWithOpenPeriods: catchAsync(getAllUsersWithOpenPeriods),
  getUsersCurrentStatus: catchAsync(getUsersCurrentStatus)
};
