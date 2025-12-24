// controllers/users.js
const { User, Program, Periods, Leaves, Preferents, Dispositive, UserChangeRequest } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { validateRequiredFields, createAccentInsensitiveRegex } = require('../utils/utils');
const { uploadFileToDrive, getFileById, deleteFileById, gestionAutomaticaNominas, obtenerCarpetaContenedora } = require('./googleController');
const { createUserWS, deleteUserByEmailWS, addUserToGroup, deleteMemeberAllGroups } = require('./workspaceController');
const { actualizacionHiringyLeave } = require('./periodoTransicionController');
const { sendWelcomeEmail } = require('./emailControllerGoogle');

const WEEKLY_HOURS = 38.5;
// Día equivalente “redondeado”
const DAILY_EQUIV_HOURS = 7.5;

const ANNUAL_VACATION_DAYS = 23;
const ANNUAL_PERSONAL_DAYS = 2;

const ANNUAL_VACATION_HOURS = ANNUAL_VACATION_DAYS * DAILY_EQUIV_HOURS; // 172.5
const ANNUAL_PERSONAL_HOURS = ANNUAL_PERSONAL_DAYS * DAILY_EQUIV_HOURS; // 22.5




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

const normalizeVacationEntries = (arr) => {
  if (!Array.isArray(arr)) return [];

  return arr
    .map((entry) => {
      if (!entry) return null;

      // Formato esperado: { date, hours }
      const d = new Date(entry.date || entry.dateString || entry.d || entry);
      if (isNaN(d)) return null;

      const hoursRaw = entry.hours;
      const hours =
        typeof hoursRaw === "number" && hoursRaw >= 0
          ? hoursRaw
          : DAILY_EQUIV_HOURS; // fallback si viene sin horas

      return { date: d, hours };
    })
    .filter(Boolean);
};

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
    hiringPeriods,
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

  // 4) Hiring doc (usa dispositiveId)
  const dispositiveId = toObjectId(inputHiring.dispositiveId, 'dispositiveId');
  const hiringDoc = {
    idUser: newUser._id,
    startDate: new Date(inputHiring.startDate),
    endDate: inputHiring.endDate ? new Date(inputHiring.endDate) : null,
    dispositiveId: dispositiveId, // <-- migrado
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


  try {
  const ws = await createUserWS(newUser._id);
  if (ws?.email) {
    const email_cor=String(ws.email).toLowerCase();
    newUser.email = email_cor
    await newUser.save();         // mantiene la variable y el doc sincronizados
    await sendWelcomeEmail(newUser, email_cor)
 
  }
} catch (e) {
  console.log('no se ha podido crear el email corporativo'+ e);
}

  response(res, 200, newUser);
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
// LIST USERS (migrado a Dispositive / dispositiveId)
// =========================
// const getUsers = async (req, res) => {
//   if (!req.body.page || !req.body.limit) {
//     throw new ClientError("Faltan datos no son correctos", 400);
//   }

//   const page  = parseInt(req.body.page, 10)  || 1;
//   const limit = parseInt(req.body.limit, 10) || 10;

//   const filters = {};

//   // ---------------- Búsquedas por texto y flags de User ----------------
//   if (req.body.firstName) {
//     const rx = createAccentInsensitiveRegex(req.body.firstName);
//     filters.firstName = { $regex: rx };
//   }
//   if (req.body.lastName) {
//     const rx = createAccentInsensitiveRegex(req.body.lastName);
//     filters.lastName = { $regex: rx };
//   }

//   if (req.body.email) filters.email = { $regex: req.body.email, $options: 'i' };
//   if (req.body.phone) filters.phone = { $regex: req.body.phone, $options: 'i' };
//   if (req.body.dni)   filters.dni   = { $regex: req.body.dni,   $options: 'i' };
//   if (req.body.gender) filters.gender = req.body.gender;

//   if (req.body.fostered === "si") filters.fostered = true;
//   if (req.body.fostered === "no") filters.fostered = false;
//   if (req.body.apafa === "si") filters.apafa = true;
//   if (req.body.apafa === "no") filters.apafa = false;

//   if (req.body.disability !== undefined) {
//     if (req.body.disability === "si") filters["disability.percentage"] = { $gt: 0 };
//     if (req.body.disability === "no") filters["disability.percentage"] = 0;
//   }

//   // Estado laboral
//   if (req.body.status) {
//     if (req.body.status === 'total') {
//       filters.employmentStatus = { $in: ['activo', 'en proceso de contratación'] };
//     } else {
//       filters.employmentStatus = req.body.status;
//     }
//   }

//   // ---------------- Resolución por provincia / programa / dispositive via Dispositive ----------------
//   const intersectArrays = (a, b) => {
//     if (!a || !b) return [];
//     const s = new Set(a);
//     return b.filter(x => s.has(x));
//   };

//   let dispositiveIdsFromProvinces = null;
//   let dispositiveIdsFromProgram   = null;

//   // provinces -> lista de dispositiveIds de esa provincia
//   if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
//     const byProv = await Dispositive.find({ province: toId(req.body.provinces) })
//       .select('_id').lean();
//     dispositiveIdsFromProvinces = byProv.map(d => String(d._id));
//   }

//   // programId -> lista de dispositiveIds del programa
//   if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
//     const byProg = await Dispositive.find({ program: toId(req.body.programId) })
//       .select('_id').lean();
//     dispositiveIdsFromProgram = byProg.map(d => String(d._id));
//   }

//   let finalDispositiveIds = null;
//   if (dispositiveIdsFromProvinces && dispositiveIdsFromProgram) {
//     finalDispositiveIds = intersectArrays(dispositiveIdsFromProvinces, dispositiveIdsFromProgram);
//   } else if (dispositiveIdsFromProvinces) {
//     finalDispositiveIds = dispositiveIdsFromProvinces;
//   } else if (dispositiveIdsFromProgram) {
//     finalDispositiveIds = dispositiveIdsFromProgram;
//   }

//   // position
//   let positionId = null;
//   if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
//     positionId = String(req.body.position);
//   }

//   // dispositive concreto
//   let singleDispositiveId = null;
//   if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
//     singleDispositiveId = String(req.body.dispositive);
//   }

//   // ¿Necesitamos filtrar por periodos abiertos?
//   const mustFilterByOpenPeriods =
//     !!finalDispositiveIds || !!positionId || !!singleDispositiveId;

//   if (mustFilterByOpenPeriods) {
//     // Combinar dispositivo concreto con la lista (intersección)
//     let allowedDispositiveIds = finalDispositiveIds;
//     if (singleDispositiveId) {
//       allowedDispositiveIds = allowedDispositiveIds
//         ? intersectArrays(allowedDispositiveIds, [singleDispositiveId])
//         : [singleDispositiveId];
//     }

//     const periodFilter = {
//       $or: [{ endDate: null }, { endDate: { $exists: false } }],
//     };

//     if (allowedDispositiveIds && allowedDispositiveIds.length) {
//       periodFilter.dispositiveId = { $in: allowedDispositiveIds.map(id => new mongoose.Types.ObjectId(id)) };
//     }
//     if (positionId) {
//       periodFilter.position = new mongoose.Types.ObjectId(positionId);
//     }

//     const userIdsFromPeriods = await Periods
//       .find(periodFilter)
//       .distinct('idUser');

//     if (!userIdsFromPeriods.length) {
//       return response(res, 200, { users: [], totalPages: 0 });
//     }

//     filters._id = { $in: userIdsFromPeriods };
//   }

//   // ---------------- Paginación sobre Users ya filtrados ----------------
//   const totalDocs  = await User.countDocuments(filters);
//   const totalPages = Math.ceil(totalDocs / limit);

//   const users = await User.find(filters)
//     .populate({
//       path: 'files.filesId',
//       model: 'Filedrive',
//     })
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * limit)
//     .limit(limit);

//   return response(res, 200, { users, totalPages });
// };

// =========================
// getAllUsersWithOpenPeriods (migrado a Dispositive / dispositiveId)
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

  // provinces -> dispositiveIds
  if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
    const byProv = await Dispositive.find({ province: toId(req.body.provinces) })
      .select('_id').lean();
    dispositiveIds = (dispositiveIds || []).concat(byProv.map(d => String(d._id)));
  }

  // programId -> dispositiveIds
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const byProg = await Dispositive.find({ program: toId(req.body.programId) })
      .select('_id').lean();
    const idsFromProgram = byProg.map(d => String(d._id));
    dispositiveIds = dispositiveIds
      ? dispositiveIds.filter(id => idsFromProgram.includes(id))
      : idsFromProgram;
  }

  if (dispositiveIds?.length) {
    hiringQuery.dispositiveId = { $in: dispositiveIds.map(id => new mongoose.Types.ObjectId(id)) };
  }

  if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
    hiringQuery.dispositiveId = new mongoose.Types.ObjectId(req.body.dispositive);
  }

  if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
    hiringQuery.position = new mongoose.Types.ObjectId(req.body.position);
  }

  const openHirings = await Periods
    .find(hiringQuery)
    .select('idUser dispositiveId position workShift startDate endDate')
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
    { firstName: 1, lastName: 1, email:1, phoneJob:1 }
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
  if (!req.body._id) {
    throw new ClientError("El ID de usuario es requerido", 400);
  }

  const updateFields = {};
  const userId = toId(req.body._id);

  // =============== EMPLOYMENT STATUS (requiere lógica especial) ===============
  if (req.body.employmentStatus) {
    const userAux = await User.findById(userId).select("email");

    if (req.body.employmentStatus === "ya no trabaja con nosotros") {
      const open = await hasOpenHiring(userId);
      if (open) {
        throw new ClientError(
          `Para cambiar el estado laboral a "Ya no trabaja con nosotros" debes cerrar todos los periodos abiertos`,
          400
        );
      }
      if (userAux.email) await deleteUserByEmailWS(userAux.email);

      updateFields.employmentStatus = "ya no trabaja con nosotros";
      updateFields.email = "";

      // 3) Eliminar responsabilidades y coordinaciones en DISPOSITIVOS y PROGRAMAS
      //    - Dispositive.responsible[]
      //    - Dispositive.coordinators[]
      //    - Program.responsible[]
      
      await Dispositive.updateMany(
        {
          $or: [
            { responsible: userId },
            { coordinators: userId },
          ],
        },
        {
          $pull: {
            responsible: userId,
            coordinators: userId,
          },
        }
      );

      await Program.updateMany(
        { responsible: userId },
        { $pull: { responsible: userId } }
      );
    } else {
      updateFields.employmentStatus = req.body.employmentStatus;

      if (!userAux.email) {
        const ws = await createUserWS(userId);
        updateFields.email = ws.email;
      }
    }
  }

  // =============== CAMPOS BÁSICOS ===============
  if (req.body.firstName) updateFields.firstName = toTitleCase(req.body.firstName);
  if (req.body.lastName) updateFields.lastName = toTitleCase(req.body.lastName);
  if (req.body.email_personal)
    updateFields.email_personal = req.body.email_personal.toLowerCase();
  if (req.body.role) updateFields.role = req.body.role;
  if (req.body.phone) updateFields.phone = req.body.phone;
  if (req.body.dni)
    updateFields.dni = req.body.dni.replace(/\s+/g, "").trim().toUpperCase();
  if (req.body.socialSecurityNumber)
    updateFields.socialSecurityNumber = req.body.socialSecurityNumber;
  if (req.body.bankAccountNumber)
    updateFields.bankAccountNumber = req.body.bankAccountNumber;

  // =============== BIRTHDAY ===============
  if (req.body.birthday) {
    const parsed = new Date(req.body.birthday);
    if (isNaN(parsed)) throw new ClientError("Fecha de nacimiento no válida", 400);
    updateFields.birthday = parsed;
  }

  // =============== DISCAPACIDAD ===============
  if (req.body.disPercentage || req.body.disNotes) {
    updateFields.disability = {};
    if (req.body.disPercentage)
      updateFields.disability.percentage = req.body.disPercentage;
    if (req.body.disNotes) updateFields.disability.notes = req.body.disNotes;
  }

  // =============== FOSTERED / APAFA / PDP / TRACKING ===============
  if (req.body.fostered === "si") updateFields.fostered = true;
  if (req.body.fostered === "no") updateFields.fostered = false;

  if (req.body.apafa === "si") updateFields.apafa = true;
  if (req.body.apafa === "no") updateFields.apafa = false;

  if (req.body.consetmentDataProtection === "si")
    updateFields.consetmentDataProtection = true;
  if (req.body.consetmentDataProtection === "no")
    updateFields.consetmentDataProtection = false;

  if (req.body.tracking === "si") updateFields.tracking = true;
  if (req.body.tracking === "no") updateFields.tracking = false;

  // =============== STUDIES ===============
  if (req.body.studies) {
    const studiesParsed = parseField(req.body.studies, "studies");
    updateFields.studies = studiesParsed.map((s) => new mongoose.Types.ObjectId(s));
  }

  // =============== PHONEJOB ===============
  if (req.body.phoneJobNumber || req.body.phoneJobExtension) {
    updateFields.phoneJob = {};
    if (req.body.phoneJobNumber)
      updateFields.phoneJob.number = req.body.phoneJobNumber;
    if (req.body.phoneJobExtension)
      updateFields.phoneJob.extension = req.body.phoneJobExtension;
  }

  // =============== VACACIONES / ASUNTOS PROPIOS POR HORAS (campos nuevos) ===============
if (Array.isArray(req.body.vacationHours)) {
  updateFields.vacationHours = normalizeVacationEntries(req.body.vacationHours);
}

if (Array.isArray(req.body.personalHours)) {
  updateFields.personalHours = normalizeVacationEntries(req.body.personalHours);
}
  // =============== ACTUALIZACIÓN FINAL ===============
  try {
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      { $set: updateFields },
      { new: true, runValidators: true }
    )
    if (req.body.personalHours || req.body.vacationHours) {
      const payload = {
        _id: updatedUser._id,
        vacationHours: updatedUser.vacationHours || [],
        vacationDays: updatedUser.vacationDays || [],
        personalHours: updatedUser.personalHours || [],
        personalDays: updatedUser.personalDays || [],
      };
      return response(res, 200, payload);
    }
    return response(res, 200, updatedUser);
  } catch (error) {
    
    if (error.code === 11000) {
      const [[, dupValue]] = Object.entries(error.keyValue);
      throw new ClientError(
        `'${dupValue}' ya existe. No se pudo actualizar el usuario porque debe ser único`,
        400
      );
    }
    throw new ClientError("Error al actualizar el usuario", 500);
  }
};


// =========================
// Payroll (igual)
// =========================
// --- helpers nóminas "slim" ---

// Devuelve sólo el array de nóminas de un usuario (o null si no existe)
const getUserPayrollsSlim = async (userId) => {
  const user = await User.findById(userId, 'payrolls').lean();
  if (!user) return null;
  return user.payrolls || [];
};

const deletePayroll = async (userId, payrollId) => {
  try {
    // 1) Traemos SOLO la nómina a borrar (para conocer pdf y sign)
    const user = await User.findOne(
      { _id: userId, 'payrolls._id': payrollId },
      { 'payrolls.$': 1 } // sólo ese subdocumento
    ).lean();

    if (!user || !user.payrolls || user.payrolls.length === 0) return null;

    const payroll = user.payrolls[0];

    // 2) Borramos firma (si existe)
    if (payroll.sign) {
      await deleteFileById(payroll.sign).catch(() => {});
    }

    // 3) Borramos PDF principal; si falla, abortamos
    const deleteResponse = await deleteFileById(payroll.pdf);
    if (!deleteResponse || !deleteResponse.success) {
      return null;
    }

    // 4) Quitamos la nómina del usuario, devolviendo SOLO payrolls
    const updated = await User.findByIdAndUpdate(
      userId,
      { $pull: { payrolls: { _id: payrollId } } },
      {
        new: true,
        select: 'payrolls', // no queremos más campos
      }
    ).lean();

    if (!updated) return null;
    return updated.payrolls || [];
  } catch {
    return null;
  }
};

const createPayroll = async (idUser, file, payrollYear, payrollMonth) => {
  try {
    // 1) Traemos sólo el DNI para nombrar el archivo
    const userAux = await User.findById(idUser, 'dni').lean();
    if (!userAux) throw new Error('Usuario no encontrado');

    const fileNameAux = `${userAux.dni}_${payrollMonth}_${payrollYear}.pdf`;
    const folderId = process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS;
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);
    
    if (!fileAux) {
      throw new Error('Error al subir el archivo a Google Drive');
    }

    // Esta función ya se encarga de crear/actualizar las nóminas en User
    const gestionado = await gestionAutomaticaNominas();
    if (!gestionado) {
      throw new Error('No se pudo procesar la nómina automáticamente');
    }

    // 2) Leemos solo payrolls del usuario actualizado
    const payrolls = await getUserPayrollsSlim(idUser);
    return payrolls;
  } catch {
    return null;
  }
};

const signPayroll = async (idUser, file, payrollYear, payrollMonth, idPayroll) => {
  try {
    // 1) Sólo DNI + nómina objetivo
    const userAux = await User.findOne(
      { _id: idUser, 'payrolls._id': idPayroll },
      { dni: 1, 'payrolls.$': 1 }
    ).lean();

    if (!userAux || !userAux.payrolls || userAux.payrolls.length === 0) {
      return null;
    }

    const payroll = userAux.payrolls[0];

    // Podemos tomar año/mes del propio subdoc para evitar incoherencias
    const year = payroll.payrollYear ?? payrollYear;
    const month = payroll.payrollMonth ?? payrollMonth;

    const monthPadded = String(month).padStart(2, '0');
    const fileNameAux = `${userAux.dni}_${monthPadded}_${year}_signed.pdf`;

    // 2) Buscamos la carpeta donde está la nómina base y subimos la firmada
    const folderId = await obtenerCarpetaContenedora(payroll.pdf);
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

    if (!fileAux) {
      throw new Error('Error al subir el archivo a Google Drive');
    }

    // 3) Actualizamos SOLO el campo sign de esa nómina
    const updated = await User.findOneAndUpdate(
      { _id: idUser, 'payrolls._id': idPayroll },
      { $set: { 'payrolls.$.sign': fileAux.id } },
      {
        new: true,
        select: 'payrolls',
      }
    ).lean();

    if (!updated) return null;
    return updated.payrolls || [];
  } catch {
    return null;
  }
};


const payroll = async (req, res) => {

  const { userId, type } = req.body || {};

    if (!userId) throw new ClientError('El campo userId es requerido', 400);
  if (!type) throw new ClientError('La acción es requerida', 400);
  
  const id = userId;

  const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);

  // 1) LISTAR nóminas del usuario (para que el front sea independiente del padre)
  if (type === 'list') {
    const payrolls = await getUserPayrollsSlim(id);
    if (!payrolls) throw new ClientError('Usuario no encontrado', 404);
    return response(res, 200, { payrolls });
  }

  // 2) CREAR nómina
  if (type === 'create') {
    if (!file) throw new ClientError('El archivo es requerido para la creación de nóminas', 400);

    const requiredFields = ['payrollYear', 'payrollMonth'];
    validateRequiredFields(req.body, requiredFields);

    const createResult = await createPayroll(id, file, req.body.payrollYear, req.body.payrollMonth);
    if (!createResult) {
      throw new ClientError('No se ha podido subir la nómina', 400);
    }

    // Sólo devolvemos las nóminas
    return response(res, 200, { payrolls: createResult });
  }

  // 3) BORRAR nómina
  if (type === 'delete') {
    if (!req.body.idPayroll) throw new ClientError('El campo idPayroll es requerido', 400);

    const payrolls = await deletePayroll(id, req.body.idPayroll);
    if (!payrolls) {
      throw new ClientError('No se ha podido borrar la nómina', 404);
    }

    return response(res, 200, { payrolls });
  }

  // 4) DESCARGAR PDF (stream directo)
  if (type === 'get') {
    if (!req.body.pdf) throw new ClientError('El campo pdf es requerido', 400);

    const { file: driveFile, stream } = await getFileById(req.body.pdf);
    if (!stream) throw new ClientError('Archivo no encontrado en Google Drive', 404);

    res.setHeader('Content-Disposition', `attachment; filename="${driveFile.name}"`);
    res.setHeader('Content-Type', driveFile.mimeType);
    return stream.pipe(res);
  }

  // 5) FIRMAR nómina (subir PDF firmado + actualizar campo sign)
  if (type === 'sign') {
    const requiredFields = ['payrollYear', 'payrollMonth', 'idPayroll'];
    validateRequiredFields(req.body, requiredFields);

    if (!file) throw new ClientError('El archivo es requerido para la firma de la nómina', 400);

    const signResult = await signPayroll(
      id,
      file,
      req.body.payrollYear,
      req.body.payrollMonth,
      req.body.idPayroll
    );

    if (!signResult) {
      throw new ClientError('No se ha podido subir la nómina firmada', 400);
    }

    return response(res, 200, { payrolls: signResult });
  }

  // Si llega aquí, type no es ninguno de los soportados
  throw new ClientError('Acción de nómina no soportada', 400);


};


// =========================
// Rehire (migrado a Dispositive / dispositiveId)
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

  // Documento del nuevo Period (usa dispositiveId)
  const hiringDoc = {
    idUser: userDoc._id,
    startDate: new Date(hiringInput.startDate),
    endDate: hiringInput.endDate ? new Date(hiringInput.endDate) : null,
    dispositiveId: toObjectId(hiringInput.dispositiveId, 'dispositiveId'),
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

    const dsp = await Dispositive.findById(hiringDoc.dispositiveId)
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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Convierte un término en un patrón que ignore acentos y ñ
const accentToClass = (s) =>
  s
    // normaliza espacios múltiples (por si acaso)
    .replace(/\s+/g, " ")
    // para cada letra, sustituye por su clase acentual
    .replace(/a/gi, (m) => (m === m.toUpperCase() ? "[AÁÀÄÂ]" : "[aáàäâ]"))
    .replace(/e/gi, (m) => (m === m.toUpperCase() ? "[EÉÈËÊ]" : "[eéèëê]"))
    .replace(/i/gi, (m) => (m === m.toUpperCase() ? "[IÍÌÏÎ]" : "[iíìïî]"))
    .replace(/o/gi, (m) => (m === m.toUpperCase() ? "[OÓÒÖÔ]" : "[oóòöô]"))
    .replace(/u/gi, (m) => (m === m.toUpperCase() ? "[UÚÙÜÛ]" : "[uúùüû]"))
    .replace(/n/gi, (m) => (m === m.toUpperCase() ? "[NÑ]" : "[nñ]"));

const toAccentInsensitiveRegex = (term) => {
  const escaped = escapeRegex(term);
  const withClasses = accentToClass(escaped);
  // "i" para case-insensitive, aunque ya cubrimos mayúsculas en clases
  return new RegExp(withClasses, "i");
};

const getBasicUserSearch = async (req, res) => {
    const q = (req.body.query || "").trim();
    if (q.length < 2) return response(res, 200, { users: [] });

    // Normaliza espacios y quita acentos SOLO para dividir términos;
    // el matching real lo hará el regex acentual.
    const normalized = q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const terms = normalized.split(" ");

    // construimos un regex por término
    const regexTerms = terms.map(toAccentInsensitiveRegex);

    // cada término debe aparecer en alguno de los campos
    const filters = {
    $and: [
      ...regexTerms.map((rx) => ({
        $or: [
          { firstName: { $regex: rx } },
          { lastName: { $regex: rx } },
          { email: { $regex: rx } },
        ],
      })),
      { employmentStatus: { $ne: "ya no trabaja con nosotros" } }, // 👈 añadido aquí
    ],
  };

    const users = await User.find(filters)
      .limit(100)
      .select("_id firstName lastName email")
      .lean();

    return response(res, 200, { users });
};


async function getUserIdsWithOpenPeriodsForFilters(body) {
  const periodQuery = {
    active: { $ne: false },
    $or: [{ endDate: null }, { endDate: { $exists: false } }],
  };

  // 1) Filtro por dispositiveId directo
  const dispositiveId = toId(body.dispositive);
  if (dispositiveId) {
    periodQuery.dispositiveId = dispositiveId;
  } else if (body.programId || body.provinces) {
    // 2) Filtro por programa y/o provincia => Dispositive -> _id
    const dspQuery = {};
    const programId = toId(body.programId);
    const provinceId = toId(body.provinces);

    if (programId) dspQuery.program = programId;
    if (provinceId) dspQuery.province = provinceId;

    // Si solo has filtrado por provincias/programa, resolvemos
    // primero cuáles son los dispositivos válidos
    const dispositiveIds = await Dispositive.distinct("_id", dspQuery);
    if (!dispositiveIds.length) {
      return []; // no hay dispositivos = no hay periodos abiertos
    }

    periodQuery.dispositiveId = { $in: dispositiveIds };
  }

  // 3) Filtro por posición (opcional)
  const positionId = toId(body.position);
  if (positionId) {
    periodQuery.position = positionId;
  }

  // 4) Distinct sobre Periods (idUser) con los filtros anteriores
  const userIds = await Periods.distinct("idUser", periodQuery);
  return userIds;
}


const getUsers = async (req, res) => {
  const { page, limit } = req.body || {};

  if (!page || !limit) {
    throw new ClientError("Faltan datos no son correctos", 400);
  }

  const pageNum  = parseInt(page, 10)  || 1;
  const limitNum = parseInt(limit, 10) || 10;

  const body = req.body || {};
  const filters = {};

  // ---------------- Búsquedas por texto y flags de User ----------------
  if (body.firstName) {
    const rx = createAccentInsensitiveRegex(body.firstName);
    filters.firstName = { $regex: rx };
  }
  if (body.lastName) {
    const rx = createAccentInsensitiveRegex(body.lastName);
    filters.lastName = { $regex: rx };
  }

  if (body.email) {
    filters.email = { $regex: body.email, $options: "i" };
  }
  if (body.phone) {
    filters.phone = { $regex: body.phone, $options: "i" };
  }
  if (body.dni) {
    filters.dni = { $regex: body.dni, $options: "i" };
  }
  if (body.gender) {
    filters.gender = body.gender;
  }

  if (body.fostered === "si") filters.fostered = true;
  if (body.fostered === "no") filters.fostered = false;

  if (body.apafa === "si") filters.apafa = true;
  if (body.apafa === "no") filters.apafa = false;

  if (body.disability !== undefined) {
    if (body.disability === "si") {
      filters["disability.percentage"] = { $gt: 0 };
    }
    if (body.disability === "no") {
      filters["disability.percentage"] = 0;
    }
  }

  // Estado laboral
  if (body.status) {
    if (body.status === "total") {
      filters.employmentStatus = {
        $in: ["activo", "en proceso de contratación"],
      };
    } else {
      filters.employmentStatus = body.status;
    }
  }

  // ---------------- Filtros por Periods abiertos (programa/dispositivo/provincia/posición) ----------------
  const mustFilterByPeriods =
    body.dispositive || body.programId || body.provinces || body.position;

  if (mustFilterByPeriods) {
    const userIdsFromPeriods = await getUserIdsWithOpenPeriodsForFilters(body);

    if (!userIdsFromPeriods.length) {
      // No hay ningún usuario con periodo abierto que cumpla esos filtros
      return response(res, 200, { users: [], totalPages: 0 });
    }

    filters._id = { $in: userIdsFromPeriods };
  }

  // ---------------- Proyección LIGERA para lista / panel ----------------
  const projection = {
    firstName: 1,
    lastName: 1,
    employmentStatus: 1,
    apafa: 1,
    fostered: 1,
    gender: 1,
    dni: 1,
    email: 1,
    email_personal: 1,
    phone: 1,
    birthday: 1,
    tracking: 1,
    role: 1,
    studies:1,
    _id: 1,
    socialSecurityNumber:1,
    phoneJob:1
  };

  // ---------------- Paginación sobre Users ya filtrados ----------------
  const totalDocs  = await User.countDocuments(filters);
  const totalPages = Math.ceil(totalDocs / limitNum);

  const users = await User.find(filters, projection)
    .sort({ createdAt: -1})
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  if (!users.length) {
    return response(res, 200, { users: [], totalPages });
  }

  const userIds = users.map((u) => u._id);

  // =========================
  // 1) hasPendingRequests (UserChangeRequest)
  // =========================
  const [pendingIds, leaveIds] = await Promise.all([
    UserChangeRequest.distinct("userId", {
      userId: { $in: userIds },
      status: "pending",
    }),
    // =========================
    // 2) isOnLeave (Leaves)
    // =========================
    Leaves.distinct("idUser", {
      idUser: { $in: userIds },
      active: { $ne: false },
      $or: [
        { actualEndLeaveDate: null },
        { actualEndLeaveDate: { $exists: false } },
      ],
    }),
  ]);

  const pendingSet = new Set(pendingIds.map((id) => String(id)));
  const leaveSet   = new Set(leaveIds.map((id) => String(id)));

  const usersWithFlags = users.map((u) => ({
    ...u,
    hasPendingRequests: pendingSet.has(String(u._id)),
    isOnLeave:          leaveSet.has(String(u._id)),
  }));
  response(res, 200, { users: usersWithFlags, totalPages });
};

/*
.populate({
      path: "files.filesId",
      model: "Filedrive",
    });
*/

const getUserListDays = async (req, res) => {
  const { idUser } = req.body || {};

  if (!idUser) {
    throw new ClientError('El campo idUser es requerido', 400);
  }

  const userDays = await User.findById(idUser)
    .select('vacationHours vacationDays personalHours personalDays')
    .lean();

  if (!userDays) {
    throw new ClientError('Usuario no encontrado', 404);
  }

  response(res, 200, {
    vacationHours: userDays.vacationHours || [],
    vacationDays: userDays.vacationDays || [],
    personalHours: userDays.personalHours || [],
    personalDays: userDays.personalDays || [],
  });
};

// Rehacer correo corporativo por DNI, eliminando primero el usuario WS existente
async function recreateCorporateEmailByDni(dniRaw = '', {
  deleteFirst = true,
  delayAfterDeleteMs = 0,
  sendWelcome = false,          // normalmente false
  logger = console,
} = {}) {
  const dni = String(dniRaw).replace(/\s+/g, '').trim().toUpperCase();

  const user = await User.findOne({ dni: { $regex: `^${dni}$`, $options: 'i' } });
  if (!user) return { ok: false, reason: 'USER_NOT_FOUND', dni };

  const oldEmail = (user.email || '').trim().toLowerCase();

  try {
    // 1) eliminar el usuario WS del correo corporativo actual (si existe)
    if (deleteFirst && oldEmail) {
      const del = await deleteUserByEmailWS(oldEmail);
      logger.log(`[recreateCorporateEmailByDni] deleteUserByEmailWS:`, del);
    }

    // 2) limpiar email en Mongo
    user.email = '';
    await user.save();

    if (delayAfterDeleteMs) {
      await new Promise(r => setTimeout(r, delayAfterDeleteMs));
    }

    // 3) crear de nuevo en WS (con fallback contador si hay duplicados)
    const ws = await createUserWS(user._id);

    if (!ws?.email) return { ok: false, reason: 'NO_EMAIL_RETURNED', dni, userId: String(user._id) };

    // 4) guardar y (opcional) welcome
    const email_cor = String(ws.email).toLowerCase().trim();
    user.email = email_cor;
    await user.save();

    if (sendWelcome) await sendWelcomeEmail(user, email_cor);

    return { ok: true, dni, userId: String(user._id), oldEmail: oldEmail || null, email: email_cor };
  } catch (e) {
    const { code, reason, message } = parseGoogleError(e);
    logger.error(`[recreateCorporateEmailByDni] ERROR ${dni}:`, { code, reason, message });
    return { ok: false, dni, userId: String(user._id), error: message, code, reason };
  }
}



// recreateCorporateEmailByDni('4890989802G');

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
  getUsersCurrentStatus: catchAsync(getUsersCurrentStatus),
  getBasicUserSearch:catchAsync(getBasicUserSearch),
  getUserListDays:catchAsync(getUserListDays)
};
