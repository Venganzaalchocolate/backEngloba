const { Periods } = require("../models/indexModels");
const { ClientError } = require("./clientError");
const mongoose = require("mongoose");

const dateAndHour = () => {
    const currentDate = new Date();
    const formattedDate = currentDate.getDate() + '-' +
        (currentDate.getMonth() + 1) + '-' +
        currentDate.getFullYear() + '_' +
        currentDate.getHours() + '-' +
        currentDate.getMinutes() + '-' +
        currentDate.getSeconds();
    return formattedDate
}

const getSpainCurrentDate = () => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    
    // Horario de verano empieza el último domingo de marzo
    const startDST = new Date(year, 2, 31 - (new Date(year, 2, 31).getDay()));
    // Horario de verano termina el último domingo de octubre
    const endDST = new Date(year, 9, 31 - (new Date(year, 9, 31).getDay()));

    let spainOffset = 1; // UTC+1 para horario de invierno

    // Si estamos en horario de verano, UTC+2
    if (currentDate >= startDST && currentDate < endDST) {
        spainOffset = 2;
    }

    const spainDate = new Date(currentDate.getTime() + spainOffset * 60 * 60 * 1000);
    
    // Obtener día, mes y año
    const day = spainDate.getDate();
    const month = spainDate.getMonth() + 1; // Los meses son de 0 a 11, por eso sumamos 1
    const yearFormatted = spainDate.getFullYear();
    
    // Obtener horas, minutos y segundos
    const hours = spainDate.getHours();
    const minutes = spainDate.getMinutes();
    const seconds = spainDate.getSeconds();
    
    // Formatear en día_mes_año_hh:minuto:segundo
    const formattedDate = `${day}_${month}_${yearFormatted} ${hours}:${minutes}:${seconds}`;
    
    return formattedDate;
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
    createAccentInsensitiveRegex,
    parseAndValidateDates,
    validateRequiredFields,
    toId,
    getCurrentPeriod,
    getCurrentPeriods,
    getAllPeriods
};