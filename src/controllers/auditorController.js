// auditorController.js
const { User, Program } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/**
 * Busca todos los usuarios que
 * - NO tengan definido alguno de los campos indicados (exists: false)
 * - o lo tengan null
 * - o lo tengan cadena vacía ''
 * - o, si es un array, con tamaño 0
 *
 * Espera en req.body.fields = ['cv','socialSecurityNumber','bankAccountNumber', …]
 */
const auditMissingFieldsInfoUser = async (req, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío en body.fields', 400);
  }

  // Lista de campos booleanos en tu schema
  const booleanFields = ['apafa', 'fostered', 'consetmentDataProtection'];

  // Lista de campos que son realmente arrays
  const arrayFields = [
    'studies',
    // si tuvieras más arrays, añádelos aquí
  ];

  // Construir la cláusula $or adecuada para cada campo
  const orConditions = [];
  for (const field of fields) {
    // siempre chequear existencia y null
    orConditions.push({ [field]: { $exists: false } });
    orConditions.push({ [field]: null });

    if (booleanFields.includes(field)) {
      // sólo eso para booleanos
      continue;
    }

    if (arrayFields.includes(field)) {
      // array vacío
      orConditions.push({ [field]: { $size: 0 } });
    } else {
      // el resto: asume string u objeto → chequea cadena vacía
      orConditions.push({ [field]: '' });
    }
  }

  const users = await User.find({ $or: orConditions })
  response(res, 200, users);
};

const auditMissingFieldsProgram = async (req, res) => {
  /* -------------------------------------------------------------- */
  /* 1. Validación de entrada                                       */
  /* -------------------------------------------------------------- */
  const { programFields = [], deviceFields = [] } = req.body;

  if (
    (!Array.isArray(programFields) || programFields.length === 0) &&
    (!Array.isArray(deviceFields)  || deviceFields.length  === 0)
  ) {
    throw new ClientError('Debes enviar al menos un campo en programFields o deviceFields', 400);
  }

  /* -------------------------------------------------------------- */
  /* 2. Listados de “tipos especiales”                              */
  /* -------------------------------------------------------------- */
  const booleanProgramFields = ['isActive', 'public'];   // ej.
  const arrayProgramFields   = ['responsible', 'finantial'];

  const booleanDeviceFields  = [];                       // ej. ninguno
  const arrayDeviceFields    = ['coordinators'];         // ej.

  /* -------------------------------------------------------------- */
  /* 3. Función auxiliar para generar $or                           */
  /* -------------------------------------------------------------- */
  const buildOrConditions = (fields, booleanList, arrayList) => {
    const ors = [];

    for (const f of fields) {
      // siempre: inexistente o null
      ors.push({ [f]: { $exists: false } });
      ors.push({ [f]: null });

      if (booleanList.includes(f)) continue;

      if (arrayList.includes(f)) {
        // array vacío
        ors.push({ [f]: { $size: 0 } });
      } else {
        // string/objeto vacío
        ors.push({ [f]: '' });
      }
    }
    return ors;
  };

  /* -------------------------------------------------------------- */
  /* 4. Construir condiciones para Programa                         */
  /* -------------------------------------------------------------- */
  const programOr = buildOrConditions(
    programFields,
    booleanProgramFields,
    arrayProgramFields
  );

  /* -------------------------------------------------------------- */
  /* 5. Construir condiciones para Dispositivo                      */
  /*    (mismo algoritmo pero dentro de un $elemMatch)              */
  /* -------------------------------------------------------------- */
  const rawDeviceOr = buildOrConditions(
    deviceFields,
    booleanDeviceFields,
    arrayDeviceFields
  );

  // adaptamos las keys → "devices.campo"
  const deviceOr = rawDeviceOr.map((cond) => {
    const k = Object.keys(cond)[0];
    return { [`devices.${k}`]: cond[k] };
  });

  /* -------------------------------------------------------------- */
  /* 6. Query final                                                 */
  /* -------------------------------------------------------------- */
  const query = { $or: [] };

  if (programOr.length) {
    query.$or.push(...programOr);
  }

  if (deviceOr.length) {
    query.$or.push({
      devices: { $elemMatch: { $or: deviceOr } },
    });
  }

  /* -------------------------------------------------------------- */
  /* 7. Ejecutar y devolver                                         */
  /* -------------------------------------------------------------- */
  const programs = await Program.find(query).populate('devices');

  response(res, 200, programs);
};

module.exports = {
  // …tus otros controladores…
  auditMissingFieldsInfoUser:catchAsync(auditMissingFieldsInfoUser),
  auditMissingFieldsProgram:catchAsync(auditMissingFieldsProgram)
};