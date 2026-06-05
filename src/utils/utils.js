const { Periods } = require("../models/indexModels");
const { ClientError } = require("./clientError");
const mongoose = require("mongoose");

const TIME_ZONE_SPAIN = "Europe/Madrid";

const formatDateSpain = (date = new Date()) =>
  new Date(date).toLocaleDateString("es-ES", {
    timeZone: TIME_ZONE_SPAIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatTimeSpain = (date = new Date()) =>
  new Date(date).toLocaleTimeString("es-ES", {
    timeZone: TIME_ZONE_SPAIN,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatDateTimeSpain = (date = new Date()) =>
  `${formatDateSpain(date)} ${formatTimeSpain(date)}`;

// Para nombres de archivo: 05-06-2026_09-42-13
const dateAndHour = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE_SPAIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  return `${get("day")}-${get("month")}-${get("year")}_${get("hour")}-${get("minute")}-${get("second")}`;
};

// Mantengo el nombre antiguo para no romper llamadas existentes
const getSpainCurrentDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE_SPAIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  return `${get("day")}_${get("month")}_${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
};


function createAccentInsensitiveRegex(str) {
    const accentMap = {
      'a': '[aáàâäãå]',
      'e': '[eéèêë]',
      'i': '[iíìîï]',
      'o': '[oóòôöõ]',
      'u': '[uúùûü]',
      'n': '[nñ]',
      'c': '[cç]'
    };
  
    let regexStr = '';
  
    for (const ch of str) {
      if (ch === ' ') {
        // En vez de un espacio literal, usamos ".*"
        // para que coincida con cualquier secuencia de caracteres
        regexStr += '.*';
      } else {
        // Para cada carácter, aplicamos la lógica de acentos
        const lowerCh = ch.toLowerCase();
        regexStr += accentMap[lowerCh] || ch;
      }
    }
  
    // Devolvemos el Regex en modo case-insensitive
    return new RegExp(regexStr, 'i');
  }
  

// Función genérica para transformar y validar arrays de fechas
const parseAndValidateDates = (dates, fieldName) => {
    try {
        const parsedDates = JSON.parse(dates);
        if (!Array.isArray(parsedDates)) {
            throw new Error(`${fieldName} debe ser un array.`);
        }
        return parsedDates.map((date) => {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate)) {
                throw new Error(`Fecha no válida en ${fieldName}: ${date}`);
            }
            return parsedDate;
        });
    } catch (error) {
        throw new ClientError(`Error al procesar ${fieldName}: ${error.message}`, 400);
    }
};

// Función para validar campos requeridos
const validateRequiredFields = (body, fields) => {
    for (const field of fields) {
        if (!body[field]) {
            throw new ClientError(`El campo ${field} es requerido`, 400);
        }
    }
};

const toId = (v) => (v ? new mongoose.Types.ObjectId(v) : v);


// Obtiene el último periodo ACTIVO de un usuario
// Obtiene el periodo ACTIVO en una fecha concreta (por defecto hoy)
async function getCurrentPeriod(userId, refDate = new Date()) {
  return Periods.findOne({
    idUser: userId,
    startDate: { $lte: refDate },
    $or: [
      { endDate: null },
      { endDate: { $gte: refDate } }
    ]
  })
    .sort({ startDate: -1 })
    .lean();
}

const getCurrentPeriods = async (userId, refDate = new Date()) => {
  const periods = await Periods.find({
    idUser: userId,
    startDate: { $lte: refDate },
    $or: [
      { endDate: null },
      { endDate: { $gte: refDate } }
    ]
  })
    .sort({ startDate: -1 })
    .populate({
      path: 'dispositiveId',
      select: 'name program responsible coordinators',
      populate: {
        path: 'program',
        select: 'name acronym responsible'
      }
    })
    .lean();

  if (!periods.length) return null;

  return periods; // puede haber 1 o 2
};


async function getAllPeriods(userId) {
  return Periods.find({ idUser: userId })
    .sort({ startDate: 1 })
    .lean();
}
module.exports = {
  dateAndHour,
  getSpainCurrentDate,
  formatDateSpain,
  formatTimeSpain,
  formatDateTimeSpain,
  createAccentInsensitiveRegex,
  parseAndValidateDates,
  validateRequiredFields,
  toId,
  getCurrentPeriod,
  getCurrentPeriods,
  getAllPeriods
};