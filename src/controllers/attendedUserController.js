const mongoose = require("mongoose");
const { AttendedUser, Dispositive } = require("../models/indexModels");
const { catchAsync, response, ClientError, NATIONALITIES, normalizeText, normalizeNationality, getNationalityLabel, } = require("../utils/indexUtils");
const { validateRequiredFields, createAccentInsensitiveRegex } = require("../utils/utils");

const ExcelJS = require("exceljs");

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toTitleCase = (str = "") =>
  str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const parseDateOrNull = (value, fieldName) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ClientError(`"${fieldName}" no es una fecha válida`, 400);
  }

  return date;
};


const getDispositiveContext = async (dispositiveId) => {
  if (!isValidId(dispositiveId)) {
    throw new ClientError("El dispositivo no es válido", 400);
  }

  const dispositive = await Dispositive.findById(dispositiveId)
    .select("_id program province")
    .lean();

  if (!dispositive) {
    throw new ClientError("Dispositivo no encontrado", 404);
  }

  return {
    dispositive: dispositive._id,
    program: dispositive.program || null,
    province: dispositive.province || null,
  };
};

const createAttendedUser = async (req, res) => {
  validateRequiredFields(req.body, [
    "firstName",
    "lastName",
    "documentId",
    "birthday",
    "nationality",
    "gender",
  ]);

  const {
    firstName,
    lastName,
    birthday,
    nationality,
    gender,
    notes,
    dispositive,
    startDate,
    documentId,
  } = req.body;

  const nationalityCode = normalizeNationality(nationality);

  if (!nationalityCode) {
    throw new ClientError("La nacionalidad es obligatoria o no es válida", 400);
  }

  if (!gender) {
    throw new ClientError("El género es obligatorio", 400);
  }

  const payload = {
    documentId: normalizeDocumentId(documentId),
    firstName: toTitleCase(firstName),
    lastName: toTitleCase(lastName || ""),
    birthday: parseDateOrNull(birthday, "birthday"),
    nationality: nationalityCode,
    gender,
    notes: notes || "",
    createdBy: req.user?._id || null,
    updatedBy: req.user?._id || null,
  };

  if (!payload.documentId) {
    throw new ClientError("El documento no puede estar vacío", 400);
  }

  if (dispositive || startDate) {
    validateRequiredFields(req.body, ["dispositive", "startDate"]);

    const context = await getDispositiveContext(dispositive);

    payload.stays = [{
      ...context,
      startDate: parseDateOrNull(startDate, "startDate"),
      endDate: null,
      active: true,
      notes: "",
    }];
  }

  const exists = await AttendedUser.findOne({
    documentId: payload.documentId,
  }).select("_id").lean();

  if (exists) {
    throw new ClientError("Ya existe un usuario atendido con ese documento", 400);
  }

  const created = await AttendedUser.create(payload);

  response(res, 200, created);
};

const listAttendedUsers = async (req, res) => {
const {
  page = 1,
  limit = 50,
  documentId,
  firstName,
  lastName,
  q,
  gender,
  nationality,
  active,
  dispositive,
  program,
  province,
  allowedDispositiveIds,
  onlyActiveStays,
  onlyActiveChronology,
} = req.body || {};

  const filters = {};

  if (firstName) {
    const rx = createAccentInsensitiveRegex(firstName);
    filters.firstName = { $regex: rx };
  }

  if (lastName) {
    const rx = createAccentInsensitiveRegex(lastName);
    filters.lastName = { $regex: rx };
  }

  if (q) {
  const rx = createAccentInsensitiveRegex(q);
  const docRx = new RegExp(escapeRegex(normalizeDocumentId(q)), "i");

  filters.$or = [
    { documentId: { $regex: docRx } },
    { firstName: { $regex: rx } },
    { lastName: { $regex: rx } },
    { nationality: { $regex: rx } },
    { "aliases.firstName": { $regex: rx } },
    { "aliases.lastName": { $regex: rx } },
  ];
}

  if (documentId) {
  filters.documentId = {
    $regex: escapeRegex(normalizeDocumentId(documentId)),
    $options: "i",
  };

}

  if (gender) filters.gender = gender;
  if (nationality) {
      const nationalityCode = normalizeNationality(nationality);
      if (nationalityCode) filters.nationality = nationalityCode;
    }

  if (active === true || active === "true") filters.active = true;
  if (active === false || active === "false") filters.active = false;

const stayMatch = {};

if (dispositive && isValidId(dispositive)) {
  stayMatch.dispositive = toId(dispositive);
} else if (Array.isArray(allowedDispositiveIds) && allowedDispositiveIds.length) {
  const validIds = allowedDispositiveIds
    .filter((id) => isValidId(id))
    .map((id) => toId(id));

  if (!validIds.length) {
    return response(res, 200, { users: [], totalPages: 0 });
  }

  stayMatch.dispositive = { $in: validIds };
}

if (program && isValidId(program)) {
  stayMatch.program = toId(program);
}

if (province && isValidId(province)) {
  stayMatch.province = toId(province);
}

if (
  onlyActiveStays === true ||
  onlyActiveStays === "true" ||
  onlyActiveChronology === true ||
  onlyActiveChronology === "true"
) {
  stayMatch.active = true;
}

if (Object.keys(stayMatch).length) {
  filters.stays = { $elemMatch: stayMatch };
}

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;

  const totalDocs = await AttendedUser.countDocuments(filters);
  const totalPages = Math.ceil(totalDocs / limitNum);

  const users = await AttendedUser.find(filters)
    .sort({ updatedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate("stays.dispositive", "name")
    .populate("stays.program", "name acronym")
    .populate("stays.province", "name")
    .lean();

  response(res, 200, { users, totalPages });
};

const getAttendedUserById = async (req, res) => {
  const { id } = req.body;

  if (!id || !isValidId(id)) {
    throw new ClientError("El id no es válido", 400);
  }

  const user = await AttendedUser.findById(id)
    .populate("stays.dispositive", "name")
    .populate("stays.program", "name acronym")
    .populate("stays.province", "name")
    .populate("createdBy", "firstName lastName email")
    .populate("updatedBy", "firstName lastName email");

  if (!user) {
    throw new ClientError("Usuario atendido no encontrado", 404);
  }

  response(res, 200, user);
};

const updateAttendedUser = async (req, res) => {
  const { _id } = req.body;

  if (!_id || !isValidId(_id)) {
    throw new ClientError("El id no es válido", 400);
  }

  const current = await AttendedUser.findById(_id);
  if (!current) {
    throw new ClientError("Usuario atendido no encontrado", 404);
  }

  const updateFields = {
    updatedBy: req.user?._id || null,
  };

  if (req.body.documentId !== undefined) {
  const nextDocumentId = normalizeDocumentId(req.body.documentId);

  if (!nextDocumentId) {
    throw new ClientError("El documento no puede estar vacío", 400);
  }

  const exists = await AttendedUser.findOne({
    _id: { $ne: current._id },
    documentId: nextDocumentId,
  }).select("_id").lean();

  if (exists) {
    throw new ClientError("Ya existe otro usuario atendido con ese documento", 400);
  }

  updateFields.documentId = nextDocumentId;
}

  const nextFirstName = req.body.firstName !== undefined
    ? toTitleCase(req.body.firstName)
    : current.firstName;

  const nextLastName = req.body.lastName !== undefined
    ? toTitleCase(req.body.lastName || "")
    : current.lastName;

  const nameChanged =
    nextFirstName !== current.firstName ||
    nextLastName !== current.lastName;

  if (nameChanged) {
    current.aliases.push({
      firstName: current.firstName,
      lastName: current.lastName,
      changedBy: req.user?._id || null,
      reason: req.body.aliasReason || "Cambio de nombre o apellidos",
    });

    updateFields.firstName = nextFirstName;
    updateFields.lastName = nextLastName;
  }

    if (req.body.nationality !== undefined) {
  const nationalityCode = normalizeNationality(req.body.nationality);

  if (!nationalityCode) {
    throw new ClientError("La nacionalidad es obligatoria o no es válida", 400);
  }

  updateFields.nationality = nationalityCode;
}

  if (req.body.birthday !== undefined) {
  const birthday = parseDateOrNull(req.body.birthday, "birthday");

  if (!birthday) {
    throw new ClientError("La fecha de nacimiento es obligatoria", 400);
  }

  updateFields.birthday = birthday;
}

if (req.body.gender !== undefined) {
  if (!req.body.gender) {
    throw new ClientError("El género es obligatorio", 400);
  }

  updateFields.gender = req.body.gender;
}

  if (req.body.notes !== undefined) {
    updateFields.notes = req.body.notes || "";
  }

  if (req.body.active !== undefined) {
    updateFields.active = req.body.active;
  }

  Object.assign(current, updateFields);

  await current.save();

  response(res, 200, current);
};

const openChronologyAttendedUser = async (req, res) => {
  validateRequiredFields(req.body, ["id", "dispositive", "startDate"]);
  
  const { id, dispositive, startDate, notes } = req.body;

  if (!isValidId(id)) {
    throw new ClientError("El id no es válido", 400);
  }

  const user = await AttendedUser.findById(id);
  if (!user) {
    throw new ClientError("Usuario atendido no encontrado", 404);
  }

  const context = await getDispositiveContext(dispositive);
    const hasActiveStay = user.stays.some((stay) => stay.active);

    if (hasActiveStay) {
      throw new ClientError("Este usuario ya tiene una estancia activa", 400);
    }
  user.stays.push({
    ...context,
    startDate: parseDateOrNull(startDate, "startDate"),
    endDate: null,
    active: true,
    notes: notes || "",
  });

  user.active = true;
  user.updatedBy = req.user?._id || null;

  await user.save();

  response(res, 200, user);
};

const closeChronologyAttendedUser = async (req, res) => {
  const stayId = req.body.stayId || req.body.staysId || req.body.chronologyId;

  validateRequiredFields(
    {
      ...req.body,
      stayId,
    },
    ["id", "stayId", "endDate"]
  );

  const { id, endDate } = req.body;

  if (!isValidId(id)) {
    throw new ClientError("El id no es válido", 400);
  }

  const user = await AttendedUser.findById(id);
  if (!user) {
    throw new ClientError("Usuario atendido no encontrado", 404);
  }

  const item = user.stays.id(stayId);
  if (!item) {
    throw new ClientError("Estancia no encontrada", 404);
  }

  item.endDate = parseDateOrNull(endDate, "endDate");
  item.active = false;

  user.active = user.stays.some((x) => x.active);
  user.updatedBy = req.user?._id || null;

  await user.save();

  response(res, 200, user);
};

const deleteAttendedUser = async (req, res) => {
  const { id } = req.body;

  if (!id || !isValidId(id)) {
    throw new ClientError("El id no es válido", 400);
  }

  const deleted = await AttendedUser.findByIdAndDelete(id);

  if (!deleted) {
    throw new ClientError("Usuario atendido no encontrado", 404);
  }

  response(res, 200, deleted);
};




const normalizeCellText = (value = "") => {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) return value;

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((x) => x.text || "").join("").trim();
    }

    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return String(value.result).trim();

    return "";
  }

  return String(value).trim();
};

const normalizeDocumentId = (value = "") => {
  const text = normalizeCellText(value);

  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
};

const normalizeGender = (value = "") => {
  const raw = String(normalizeCellText(value)).trim().toLowerCase();

  const map = {
    hombre: "male",
    masculino: "male",
    male: "male",

    mujer: "female",
    femenino: "female",
    female: "female",

    otros: "others",
    otro: "others",
    other: "others",
    others: "others",

    "no binario": "nonBinary",
    "no-binario": "nonBinary",
    nobinario: "nonBinary",
    nonbinary: "nonBinary",
    "non binary": "nonBinary",
  };

  return map[raw] || "";
};

const parseExcelDate = (value, fieldName, rowNumber) => {
  if (!value) {
    throw new ClientError(`Fila ${rowNumber}: falta ${fieldName}`, 400);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const text = normalizeCellText(value);

  if (!text) {
    throw new ClientError(`Fila ${rowNumber}: falta ${fieldName}`, 400);
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    const [, dd, mm, yyyy] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));

    const valid =
      date.getFullYear() === Number(yyyy) &&
      date.getMonth() === Number(mm) - 1 &&
      date.getDate() === Number(dd);

    if (valid) return date;
  }

  const iso = new Date(text);

  if (!Number.isNaN(iso.getTime())) {
    return iso;
  }

  throw new ClientError(
    `Fila ${rowNumber}: ${fieldName} no válida. Usa formato dd/mm/aaaa`,
    400
  );
};

const importAttendedUsersExcel = async (req, res) => {
  validateRequiredFields(req.body, ["dispositive"]);

  if (!req.file?.buffer) {
    throw new ClientError("Debes subir un archivo Excel", 400);
  }

  const { dispositive } = req.body;
  const context = await getDispositiveContext(dispositive);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);

  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    throw new ClientError("El Excel no contiene ninguna hoja válida", 400);
  }

  const expectedHeaders = [
    "Documento",
    "Nombre",
    "Apellidos",
    "Fecha nacimiento",
    "Nacionalidad",
    "Género",
    "Fecha alta",
    "Notas",
  ];

  const headerRow = worksheet.getRow(1);
  const headers = expectedHeaders.map((_, index) =>
    normalizeCellText(headerRow.getCell(index + 1).value)
  );

  const invalidHeader = expectedHeaders.some((header, index) => headers[index] !== header);

  if (invalidHeader) {
    throw new ClientError(
      `La plantilla no es válida. La primera fila debe ser: ${expectedHeaders.join(", ")}`,
      400
    );
  }

  const rows = [];
  const errors = [];
  const documentIdsInExcel = new Set();
  const ignoredDuplicatedRows = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    const documentId = normalizeDocumentId(row.getCell(1).value);

    if (!documentId) continue;

    const firstName = normalizeCellText(row.getCell(2).value);
    const lastName = normalizeCellText(row.getCell(3).value);
    const birthdayRaw = row.getCell(4).value;
    const nationalityRaw = normalizeCellText(row.getCell(5).value);
    const genderRaw = normalizeCellText(row.getCell(6).value);
    const startDateRaw = row.getCell(7).value;
    const notes = normalizeCellText(row.getCell(8).value);

    try {
      if (documentIdsInExcel.has(documentId)) {
        ignoredDuplicatedRows.push({
          row: rowNumber,
          documentId,
        });
        continue;
      }

      if (!firstName) {
        throw new ClientError(`Fila ${rowNumber}: falta Nombre`, 400);
      }

      if (!lastName) {
        throw new ClientError(`Fila ${rowNumber}: falta Apellidos`, 400);
      }

      const birthday = parseExcelDate(birthdayRaw, "Fecha nacimiento", rowNumber);

      const nationality = normalizeNationality(nationalityRaw);
      if (!nationality) {
        throw new ClientError(
          `Fila ${rowNumber}: nacionalidad no válida o vacía. Debe seleccionarse desde el desplegable`,
          400
        );
      }

      const gender = normalizeGender(genderRaw);
      if (!gender) {
        throw new ClientError(
          `Fila ${rowNumber}: género no válido. Usa Hombre, Mujer, Otros o No binario`,
          400
        );
      }

      const startDate = parseExcelDate(startDateRaw, "Fecha alta", rowNumber);

      documentIdsInExcel.add(documentId);

      rows.push({
        rowNumber,
        documentId,
        firstName: toTitleCase(firstName),
        lastName: toTitleCase(lastName),
        birthday,
        nationality,
        gender,
        startDate,
        notes,
      });
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err.message || "Error en la fila",
      });
    }
  }

  if (!rows.length && !errors.length) {
    throw new ClientError("El Excel no contiene filas para importar", 400);
  }

  if (errors.length) {
    return response(res, 200, {
      created: 0,
      imported: false,
      ignoredDuplicates: ignoredDuplicatedRows,
      errors,
    });
  }

  const documentIds = rows.map((r) => r.documentId);

  const existingUsers = await AttendedUser.find({
    documentId: { $in: documentIds },
  })
    .select("documentId")
    .lean();

  if (existingUsers.length) {
    const existingSet = new Set(existingUsers.map((u) => u.documentId));

    return response(res, 200, {
      created: 0,
      imported: false,
      ignoredDuplicates: ignoredDuplicatedRows,
      errors: rows
        .filter((r) => existingSet.has(r.documentId))
        .map((r) => ({
          row: r.rowNumber,
          message: `Ya existe un usuario atendido con el documento ${r.documentId}`,
        })),
    });
  }

  const docsToCreate = rows.map((r) => ({
    active: true,
    documentId: r.documentId,
    firstName: r.firstName,
    lastName: r.lastName,
    birthday: r.birthday,
    nationality: r.nationality,
    gender: r.gender,
    notes: r.notes || "",
    createdBy: req.user?._id || null,
    updatedBy: req.user?._id || null,
    stays: [
      {
        ...context,
        startDate: r.startDate,
        endDate: null,
        active: true,
        notes: "",
      },
    ],
  }));

  const created = await AttendedUser.insertMany(docsToCreate, { ordered: true });

  response(res, 200, {
    created: created.length,
    imported: true,
    ignoredDuplicates: ignoredDuplicatedRows,
    errors: [],
  });
};

module.exports = {
  createAttendedUser: catchAsync(createAttendedUser),
  listAttendedUsers: catchAsync(listAttendedUsers),
  getAttendedUserById: catchAsync(getAttendedUserById),
  updateAttendedUser: catchAsync(updateAttendedUser),
  openChronologyAttendedUser: catchAsync(openChronologyAttendedUser),
  closeChronologyAttendedUser: catchAsync(closeChronologyAttendedUser),
  deleteAttendedUser: catchAsync(deleteAttendedUser),
  importAttendedUsersExcel:catchAsync(importAttendedUsersExcel)
};