// auditorController.js
const { default: mongoose } = require('mongoose');
const { User, Program, Filedrive, Documentation } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const { exists } = require('../models/programs');

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
  const { programFields = [] } = req.body;

  if (!Array.isArray(programFields) || programFields.length === 0) {
    throw new ClientError('Debes enviar al menos un campo en programFields', 400);
  }

  /* -------------------------------------------------------------- */
  /* 2. Listados de “tipos especiales”                              */
  /* -------------------------------------------------------------- */
  const booleanProgramFields = ['isActive', 'public'];   // ej.
  const arrayProgramFields = ['responsible', 'finantial'];

  /* -------------------------------------------------------------- */
  /* 3. Función auxiliar para generar $or                           */
  /* -------------------------------------------------------------- */
  const buildOrConditions = (fields, booleanList, arrayList) => {
    return fields.flatMap(f => {
      const ors = [
        // no existe...
        { [f]: { $exists: false } },
        // ...o es null
        { [f]: null }
      ];

      if (arrayList.includes(f)) {
        // ...o es un array vacío
        ors.push({ [f]: { $size: 0 } });
      } else if (!booleanList.includes(f)) {
        // si no es booleano, también chequeamos cadena vacía
        ors.push({ [f]: '' });
      }

      return ors;
    });
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
  /* 5. Query final para Programa                                    */
  /* -------------------------------------------------------------- */
  const query = { $or: programOr };

  /* -------------------------------------------------------------- */
  /* 6. Ejecutar y devolver                                         */
  /* -------------------------------------------------------------- */
  const programs = await Program.find(query);
  response(res, 200, programs);
};

const auditMissingFieldsDevice = async (req, res) => {
  /* -------------------------------------------------------------- */
  /* 1. Validación de entrada                                       */
  /* -------------------------------------------------------------- */
  const { deviceFields = [] } = req.body;
  if (!Array.isArray(deviceFields) || deviceFields.length === 0) {
    throw new ClientError('Debes enviar al menos un campo en deviceFields', 400);
  }

  /* -------------------------------------------------------------- */
  /* 2. Listados de “tipos especiales”                              */
  /* -------------------------------------------------------------- */
  const booleanDeviceFields = [];
  // ahora incluimos también 'responsible'
  const arrayDeviceFields = ['responsible', 'coordinators'];

  /* -------------------------------------------------------------- */
  /* 3. Auxiliar para generar condiciones $or                       */
  /* -------------------------------------------------------------- */
  const buildOrConditions = (fields, booleanList, arrayList) => {
    const ors = [];
    for (const f of fields) {
      ors.push({ [f]: { $exists: false } });
      ors.push({ [f]: null });
      if (booleanList.includes(f)) continue;
      if (arrayList.includes(f)) {
        ors.push({ [f]: { $size: 0 } });
      } else {
        ors.push({ [f]: '' });
      }
    }
    return ors;
  };

  /* -------------------------------------------------------------- */
  /* 4. Construir $or adaptado a devices                             */
  /* -------------------------------------------------------------- */
  const rawDeviceOr = buildOrConditions(deviceFields, booleanDeviceFields, arrayDeviceFields);
  const deviceOr = rawDeviceOr.map(cond => {
    const key = Object.keys(cond)[0];
    return { [`devices.${key}`]: cond[key] };
  });

  /* -------------------------------------------------------------- */
  /* 5. Traer programas con al menos un dispositivo incompleto      */
  /* -------------------------------------------------------------- */
  const programs = await Program.find({
    $or: [{ devices: { $elemMatch: { $or: deviceOr } } }]
  });

  /* -------------------------------------------------------------- */
  /* 6. Filtrar dentro de cada programa solo los devices incompletos */
  /* -------------------------------------------------------------- */
  const filtered = programs.map(prog => {
    const p = prog.toObject();
    p.devices = (p.devices || []).filter(dev =>
      deviceFields.some(f => {
        const v = dev[f];
        // inexistente o null
        if (v === undefined || v === null) return true;
        // arrays vacíos
        if (arrayDeviceFields.includes(f) && Array.isArray(v) && v.length === 0) return true;
        // strings vacíos
        if (!booleanDeviceFields.includes(f) && typeof v === 'string' && v === '') return true;
        return false;
      })
    );
    return p;
  });

  /* -------------------------------------------------------------- */
  /* 7. Devolver resultado                                          */
  /* -------------------------------------------------------------- */
  response(res, 200, filtered);
};

const auditMissingFieldsDocumentationUser = async (req, res) => {
  const { docIds } = req.body;
  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  // 1) Validar y convertir a ObjectId
  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  // 2) Agrupar todos los userId que tienen al menos uno de esos docs
  const haveSomeDocs = await Filedrive.aggregate([
    { $match: { originModel: 'User', originDocumentation: { $in: docs } } },
    { $group: { _id: '$idModel' } }
  ]);
  const usersWithSomeIds = haveSomeDocs.map(g => g._id);

  // 3) Usuarios que NO tienen ninguno de esos docs
  const usersWithoutAny = await User.find({
    _id: { $nin: usersWithSomeIds }
  })
    .select(' firstName lastName dni email phone dispositiveNow')
    .lean();

  // 4) Usuarios que tienen algunos pero les faltan otros
  const haveSomeMissing = await Filedrive.aggregate([
    { $match: { originModel: 'User', originDocumentation: { $in: docs } } },
    { $group: { _id: '$idModel', present: { $addToSet: '$originDocumentation' } } },
    { $project: { present: 1, missing: { $setDifference: [docs, '$present'] } } },
    { $match: { 'missing.0': { $exists: true } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: '$user._id',
        firstName: '$user.firstName',
        lastName: '$user.lastName',
        dni: '$user.dni',
        email: '$user.email',
        phone: '$user.phone',
        dispositiveNow: '$user.dispositiveNow',
        missingDocs: '$missing'
      }
    }
  ]);

  // 5) A los que no tienen ninguno, marcarles todos como faltantes
  const noneAtAll = usersWithoutAny.map(u => ({
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    dni: u.dni,
    dispositiveNow: u.dispositiveNow,
    email: u.email,
    phone: u.phone,
    missingDocs: docs
  }));

  // 6) Unir ambos grupos y devolver
  const result = [...haveSomeMissing, ...noneAtAll];
  response(res, 200, result);
};
const auditMissingFieldsDocumentationProgram = async (req, res) => {
  const { docIds } = req.body;

  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  // 1. Buscar programas con al menos uno de los documentos esenciales
  const programs = await Program.find({
    essentialDocumentationProgram: { $in: docs }
  }).populate('files');

  // 2. Buscar documentos que tienen duración (para caducidad)
  const documentationWithTime = await Documentation.find({
    _id: { $in: docs },
    duration: { $exists: true }
  });

  const results = [];

  for (const program of programs) {
    const comunes = program.essentialDocumentationProgram
      .map(id => id.toString())
      .filter(id => docIds.includes(id));

    const missingDocs = comunes.filter(docId =>
      !program.files.some(file => file.originDocumentation?.toString() === docId)
    );

    const expiredDocs = [];

    for (const doc of documentationWithTime) {
      if (!comunes.includes(doc._id.toString())) continue;

      const relevantFiles = program.files.filter(
        file => file.originDocumentation?.toString() === doc._id.toString()
      );

      const latestFile = relevantFiles.reduce((latest, file) =>
        !latest || new Date(file.createdAt) > new Date(latest.createdAt)
          ? file
          : latest,
        null
      );

      if (!latestFile) continue;

      const expirationDate = new Date(latestFile.createdAt);
      expirationDate.setDate(expirationDate.getDate() + doc.duration);

      if (expirationDate < new Date()) {
        expiredDocs.push(doc._id.toString());
      }
    }

    if (missingDocs.length > 0 || expiredDocs.length > 0) {
      results.push({
        _id: program._id,
        name: program.name,
        acronym: program.acronym,
        responsible: program.responsible,
        missingDocs,
        expiredDocs
      });
    }
  }

  response(res, 200, results);
};

const auditMissingFieldsDocumentationDevice = async (req, res) => {
  const { docIds } = req.body;

  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new ClientError('Debes proporcionar un array no vacío de docIds en body.docIds', 400);
  }

  const docs = docIds.map(id => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ClientError(`ID de documentación inválido: ${id}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
  });

  // 1. Buscar programas con dispositivos (y documentos esenciales definidos)
  const programs = await Program.find({
    essentialDocumentationDevice: { $in: docs }
  }).populate('devices.files');

  // 2. Buscar documentos con duración (para ver si están caducados)
  const documentationWithTime = await Documentation.find({
    _id: { $in: docs },
    duration: { $exists: true }
  });

  const results = [];

  for (const program of programs) {
    const comunes = (program.essentialDocumentationDevice || [])
      .map(id => id.toString())
      .filter(id => docIds.includes(id)); // limitar solo a los seleccionados

    for (const device of program.devices || []) {
      // Documentos faltantes (no están en ningún archivo del dispositivo)
      const missingDocs = comunes.filter(docId =>
        !device.files.some(file => file.originDocumentation?.toString() === docId)
      );

      // Documentos caducados
      const expiredDocs = [];

      for (const doc of documentationWithTime) {
        if (!comunes.includes(doc._id.toString())) continue;

        const relevantFiles = device.files.filter(
          file => file.originDocumentation?.toString() === doc._id.toString()
        );

        const latestFile = relevantFiles.reduce((latest, file) =>
          !latest || new Date(file.createdAt) > new Date(latest.createdAt)
            ? file
            : latest,
          null
        );

        if (!latestFile) continue;

        const expirationDate = new Date(latestFile.createdAt);
        expirationDate.setDate(expirationDate.getDate() + doc.duration);

        if (expirationDate < new Date()) {
          expiredDocs.push(doc._id.toString());
        }
      }

      if (missingDocs.length > 0 || expiredDocs.length > 0) {
        results.push({
          _id: device._id,
          name: device.name,
          responsible: device.responsible,
          coordinators: device.coordinators,
          programId: program._id,
          programName: program.name,
          missingDocs,
          expiredDocs
        });
      }
    }
  }

  response(res, 200, results);
};



module.exports = {
  // …tus otros controladores…
  auditMissingFieldsInfoUser: catchAsync(auditMissingFieldsInfoUser),
  auditMissingFieldsProgram: catchAsync(auditMissingFieldsProgram),
  auditMissingFieldsDevice: catchAsync(auditMissingFieldsDevice),
  auditMissingFieldsDocumentationUser: catchAsync(auditMissingFieldsDocumentationUser),
  auditMissingFieldsDocumentationProgram: catchAsync(auditMissingFieldsDocumentationProgram),
  auditMissingFieldsDocumentationDevice:catchAsync(auditMissingFieldsDocumentationDevice)
};