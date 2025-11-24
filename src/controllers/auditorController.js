// controllers/auditInfo.controller.js
const mongoose = require('mongoose');
const {
  User,
  Program,
  Dispositive,
  Periods,
  Leaves,
  Filedrive,
  Documentation
} = require('../models/indexModels');

const { catchAsync, response, ClientError, toId } = require('../utils/indexUtils');
const { deleteFileById } = require('./googleController');

/* =========================================================
   HELPERS
========================================================= */

function buildEmploymentFilter(status) {
  if (!status || status === 'todos') return {};

  if (status === 'activos') {
    return { employmentStatus: { $in: ['activo', 'en proceso de contratación'] } };
  }

  if (status === 'inactivos') {
    return { employmentStatus: 'ya no trabaja con nosotros' };
  }

  return {};
}

/* =========================================================
   HELPER: buildOrMissing(schemaPaths, fields)
   Devuelve condiciones $or para detectar campos vacíos
========================================================= */
function buildOrMissing(schemaPaths, fieldsRaw) {
  const fields = Array.isArray(fieldsRaw) ? fieldsRaw : [];
  const orMissing = [];

  for (const f of fields) {
    const schemaType = schemaPaths[f];

    if (!schemaType) continue;

    if (f.startsWith("about.")) {
      orMissing.push({ [f]: { $exists: false } });
      orMissing.push({ [f]: null });
      orMissing.push({ [f]: "" });
      continue;
    }

    // Array de ObjectId
    if (schemaType.instance === "Array" && schemaType.caster?.instance === "ObjectId") {
      orMissing.push({ [f]: { $exists: false } });
      orMissing.push({ [f]: { $size: 0 } });
      continue;
    }

    // Campos simples
    orMissing.push({ [f]: { $exists: false } });
    orMissing.push({ [f]: null });
    orMissing.push({ [f]: "" });

    if (schemaType.instance === "Array") {
      orMissing.push({ [f]: { $size: 0 } });
    }
  }

  return orMissing.length > 0 ? orMissing : [{ _id: null }]; // evita $or vacío
}



/* =========================================================
   1. AUDITORÍA DE USUARIOS — INFORMACIÓN
   (OPTIMIZADO CON AGGREGATE + LOOKUP A PERIODS/DISPOSITIVE/PROGRAM)
========================================================= */

const auditInfoUsers = async (req, res) => {
  const {
    fields = [],
    apafa = null,
    employmentStatus = 'activos',
    page = 1,
    limit = 20
  } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ClientError('Debes enviar un array no vacío en body.fields', 400);
  }

  const userSchemaPaths = User.schema.paths;
  const orMissing = [];

  for (const f of fields) {
    orMissing.push({ [f]: { $exists: false } });
    orMissing.push({ [f]: null });
    orMissing.push({ [f]: '' });

    const schemaType = userSchemaPaths[f];
    if (schemaType && schemaType.instance === 'Array') {
      orMissing.push({ [f]: { $size: 0 } });
    }
  }

  const empFilter = buildEmploymentFilter(employmentStatus);

  const apafaFilter =
    apafa === null
      ? {}
      : {
          apafa: apafa === 'si' ? true : apafa === 'no' ? false : undefined,
        };

  if (apafaFilter.apafa === undefined) delete apafaFilter.apafa;

  const now = new Date();

  // Cálculos de paginación
  const skip = (page - 1) * limit;

  // PIPELINE BASE
  const basePipeline = [
    {
      $match: {
        $or: orMissing,
        ...empFilter,
        ...apafaFilter,
      },
    },

    // PERÍODOS ACTIVOS
    {
      $lookup: {
        from: 'periods',
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$idUser', '$$userId'] },
                  { $lte: ['$startDate', now] },
                  {
                    $or: [
                      { $eq: ['$endDate', null] },
                      { $gte: ['$endDate', now] },
                    ],
                  },
                ],
              },
            },
          },

          // DISPOSITIVO
          {
            $lookup: {
              from: 'dispositives',
              localField: 'dispositiveId',
              foreignField: '_id',
              as: 'device',
            },
          },
          { $unwind: { path: '$device', preserveNullAndEmptyArrays: true } },

          // RESPONSABLES DISPOSITIVO
          {
            $lookup: {
              from: 'users',
              localField: 'device.responsible',
              foreignField: '_id',
              as: 'responsibleUsers',
            },
          },

          // COORDINADORES DISPOSITIVO
          {
            $lookup: {
              from: 'users',
              localField: 'device.coordinators',
              foreignField: '_id',
              as: 'coordinatorUsers',
            },
          },

          // PROGRAMA
          {
            $lookup: {
              from: 'programs',
              localField: 'device.program',
              foreignField: '_id',
              as: 'program',
            },
          },
          {
            $unwind: {
              path: '$program',
              preserveNullAndEmptyArrays: true,
            },
          },

          // RESPONSABLES PROGRAMA
          {
            $lookup: {
              from: 'users',
              localField: 'program.responsible',
              foreignField: '_id',
              as: 'programResponsibleUsers',
            },
          },

          // PROYECCIÓN FINAL PERIODO
          {
            $project: {
              _id: 1,
              startDate: 1,
              endDate: 1,
              position: 1,
              category: 1,
              workShift: 1,

              dispositiveId: 1,
              deviceName: '$device.name',

              programId: '$program._id',
              programName: '$program.name',

              responsibles: {
                $map: {
                  input: '$responsibleUsers',
                  as: 'r',
                  in: {
                    _id: '$$r._id',
                    name: { $concat: ['$$r.firstName', ' ', '$$r.lastName'] },
                  },
                },
              },

              coordinators: {
                $map: {
                  input: '$coordinatorUsers',
                  as: 'c',
                  in: {
                    _id: '$$c._id',
                    name: { $concat: ['$$c.firstName', ' ', '$$c.lastName'] },
                  },
                },
              },

              programResponsibles: {
                $map: {
                  input: '$programResponsibleUsers',
                  as: 'pr',
                  in: {
                    _id: '$$pr._id',
                    name: { $concat: ['$$pr.firstName', ' ', '$$pr.lastName'] },
                  },
                },
              },
            },
          },
        ],
        as: 'currentHiring',
      },
    },

    {
      $project: {
        firstName: 1,
        lastName: 1,
        birthday: 1,
        socialSecurityNumber: 1,
        bankAccountNumber: 1,
        studies: 1,
        phoneJob: 1,
        dni: 1,
        email: 1,
        phone: 1,
        apafa: 1,
        employmentStatus: 1,
        currentHiring: 1,
      },
    },
  ];

  // 🚀 PIPELINE CON PAGINACIÓN
  const pipeline = [
    ...basePipeline,
    { $skip: skip },
    { $limit: limit }
  ];

  // 🚀 PIPELINE PARA CONTAR RESULTADOS TOTALES
  const countPipeline = [
    ...basePipeline,
    { $count: 'total' }
  ];

  const [results, countResult] = await Promise.all([
    User.aggregate(pipeline),
    User.aggregate(countPipeline)
  ]);

  const totalResults = countResult.length > 0 ? countResult[0].total : 0;
  const totalPages = Math.ceil(totalResults / limit);

  response(res, 200, {
    results,
    page,
    totalResults,
    totalPages,
    limit
  });
};


/* =========================================================
   2. AUDITORÍA DE PROGRAMAS — INFORMACIÓN
   (TIPO-AWARE PARA $size, SIN BUCLES LENTOS)
========================================================= */


/* =========================================================
   HELPERS
========================================================= */

function buildEmploymentFilter(status) {
  if (!status || status === 'todos') return {};

  if (status === 'activos') {
    return { employmentStatus: { $in: ['activo', 'en proceso de contratación'] } };
  }

  if (status === 'inactivos') {
    return { employmentStatus: 'ya no trabaja con nosotros' };
  }

  return {};
}

/* =========================================================
   AUDITORÍA PROGRAMAS — INFO 
========================================================= */
// Fuera de la función (arriba del archivo)
const now = new Date();

/* =========================================================
   AUDITORÍA PROGRAMAS — INFO + DOCUMENTOS
========================================================= */

const auditInfoPrograms = async (req, res) => {
  try {
    const {
      fields = [],   // campos de Program a auditar (name, acronym, about.description, etc.)
      page = 1,
      limit = 20,
    } = req.body;

    // ¿El cliente ha enviado algún campo?
    const hasInfo = Array.isArray(fields) && fields.length > 0;

    if (!hasInfo) {
      // Sin campos no tiene sentido auditar
      throw new ClientError(
        "Debes seleccionar al menos un campo de información para auditar programas",
        400
      );
    }

    const skip = (page - 1) * limit; // cálculo estándar de paginación

    /* =========================================================
       1. EXPRESIÓN infoMissing (campos de Program vacíos)
       Construimos condiciones para detectar programas con
       ALGÚN campo de `fields` vacío / nulo.
    ========================================================= */
    const infoMissingExprs = [];

    for (const f of fields) {
      const schemaType = Program.schema.paths[f];

      // 1.1. Campos anidados tipo "about.description"
      if (f.startsWith("about.")) {
        // Para estos campos no hay schemaType directo, así que comprobamos null / ""
        infoMissingExprs.push({
          $or: [
            { $eq: [`$${f}`, null] },
            { $eq: [`$${f}`, ""] },
          ],
        });
        continue;
      }

      // Si el campo no existe en el schema, lo ignoramos
      if (!schemaType) continue;

      // 1.2. Arrays (ej. responsible, finantial)
      if (schemaType.instance === "Array") {
        // Consideramos "faltante" si el array está vacío o no existe
        infoMissingExprs.push({
          $eq: [
            {
              $size: {
                $ifNull: [`$${f}`, []], // si es null => []
              },
            },
            0, // tamaño 0
          ],
        });
        continue;
      }

      // 1.3. Campos escalares (string, etc.)
      infoMissingExprs.push({
        $or: [
          { $eq: [`$${f}`, null] },
          { $eq: [`$${f}`, ""] },
        ],
      });
    }

    // Si todos los campos eran inválidos / no existen en el schema
    if (infoMissingExprs.length === 0) {
      throw new ClientError(
        "Ninguno de los campos seleccionados es válido en Program",
        400
      );
    }

    // infoMissingExpr será TRUE cuando se cumpla AL MENOS una de las condiciones
    // (equivale a: "falta algún campo seleccionado")
    const infoMissingExpr = { $or: infoMissingExprs };

    /* =========================================================
       2. PIPELINE BASE DE AGGREGATE
       - Filtramos solo activos
       - Hacemos lookups de responsible y finantial
       - Calculamos infoMissing
       - Nos quedamos solo con los que tienen infoMissing = true
    ========================================================= */
    const basePipeline = [
      // 2.1. Solo programas activos
      { $match: { active: true } },

      // 2.2. RESPONSABLES (array de Users)
      {
        $lookup: {
          from: "users",
          localField: "responsible",
          foreignField: "_id",
          as: "responsible",
        },
      },

      // 2.3. FINANCIACIÓN (array de Finantial)
      {
        $lookup: {
          from: "finantials",
          localField: "finantial",
          foreignField: "_id",
          as: "finantial",
        },
      },

      // 2.4. Añadimos un campo booleano "infoMissing" calculado
      {
        $addFields: {
          infoMissing: infoMissingExpr,
        },
      },

      // 2.5. Nos quedamos solo con los que tienen algún campo faltante
      {
        $match: {
          infoMissing: true,
        },
      },
    ];

    /* =========================================================
       3. PAGINACIÓN + CONTEO
       - Ejecutamos el pipeline con skip/limit
       - Ejecutamos el pipeline con $count para saber cuántos hay
    ========================================================= */
    const pipelineResults = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
    ];

    const pipelineCount = [...basePipeline, { $count: "total" }];

    const [results, countArr] = await Promise.all([
      Program.aggregate(pipelineResults),
      Program.aggregate(pipelineCount),
    ]);

    const totalResults = countArr[0]?.total || 0;
    const totalPages = Math.ceil(totalResults / limit);

    // Estructura estándar de respuesta
    response(res, 200, {
      results,
      page,
      totalPages,
      totalResults,
      limit,
    });
  } catch (error) {
    console.error("Error en auditInfoPrograms:", error);
    throw new ClientError("Error interno en auditoría de programas", 500);
  }
};


/* =========================================================
   AUDITORÍA DISPOSITIVOS — INFO 
========================================================= */
/* =========================================================
   AUDITORÍA DISPOSITIVOS — INFO + DOCUMENTOS
========================================================= */

const auditInfoDevices = async (req, res) => {
  try {
    const {
      fields = [],   // campos de Dispositive a auditar (name, email, phone, address, responsible, coordinators, program, etc.)
      page = 1,
      limit = 20,
    } = req.body;

    const hasInfo = Array.isArray(fields) && fields.length > 0;

    if (!hasInfo) {
      throw new ClientError(
        "Debes seleccionar al menos un campo de información para auditar dispositivos",
        400
      );
    }

    const skip = (page - 1) * limit;

    /* =========================================================
       1. EXPRESIÓN infoMissing (campos de Dispositive vacíos)
    ========================================================= */
    const infoMissingExprs = [];

    for (const f of fields) {
      const schemaType = Dispositive.schema.paths[f];

      // Si el campo no existe en el schema de Dispositive, lo ignoramos
      if (!schemaType) continue;

      // 1.1. Arrays (responsible, coordinators, etc.)
      if (schemaType.instance === "Array") {
        infoMissingExprs.push({
          $eq: [
            {
              $size: {
                $ifNull: [`$${f}`, []],
              },
            },
            0,
          ],
        });
        continue;
      }

      // 1.2. Campos escalares (name, email, phone, address, program, groupWorkspace...)
      infoMissingExprs.push({
        $or: [
          { $eq: [`$${f}`, null] },
          { $eq: [`$${f}`, ""] },
        ],
      });
    }

    if (infoMissingExprs.length === 0) {
      throw new ClientError(
        "Ninguno de los campos seleccionados es válido en Dispositive",
        400
      );
    }

    const infoMissingExpr = { $or: infoMissingExprs };

    /* =========================================================
       2. PIPELINE BASE
       - Solo dispositivos activos
       - Lookup de programa, responsables y coordinadores
       - Calculamos infoMissing
       - Filtramos solo los que tienen infoMissing = true
    ========================================================= */
    const basePipeline = [
      // 2.1. Solo dispositivos activos
      { $match: { active: true } },

      // 2.2. PROGRAMA ASOCIADO
      {
        $lookup: {
          from: "programs",
          localField: "program",
          foreignField: "_id",
          as: "program",
        },
      },
      {
        $unwind: {
          path: "$program",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 2.3. RESPONSABLES
      {
        $lookup: {
          from: "users",
          localField: "responsible",
          foreignField: "_id",
          as: "responsible",
        },
      },

      // 2.4. COORDINADORES
      {
        $lookup: {
          from: "users",
          localField: "coordinators",
          foreignField: "_id",
          as: "coordinators",
        },
      },

      // 2.5. Añadir flag infoMissing
      {
        $addFields: {
          infoMissing: infoMissingExpr,
        },
      },

      // 2.6. Filtrar solo los dispositivos con información faltante
      {
        $match: {
          infoMissing: true,
        },
      },
    ];

    /* =========================================================
       3. PAGINACIÓN + CONTEO
    ========================================================= */
    const pipelineResults = [
      ...basePipeline,
      { $skip: skip },
      { $limit: limit },
    ];

    const pipelineCount = [...basePipeline, { $count: "total" }];

    const [results, countArr] = await Promise.all([
      Dispositive.aggregate(pipelineResults),
      Dispositive.aggregate(pipelineCount),
    ]);

    const totalResults = countArr[0]?.total || 0;
    const totalPages = Math.ceil(totalResults / limit);

    response(res, 200, {
      results,
      page,
      totalPages,
      totalResults,
      limit,
    });
  } catch (error) {
    console.error("Error en auditInfoDevices:", error);
    throw new ClientError("Error interno en auditoría de dispositivos", 500);
  }
};




/* =========================================================
   4. AUDITORÍA DE BAJAS ACTIVAS
      (aggregate con filtros opcionales y periodos + dispositivo)
========================================================= */

const auditActiveLeaves = async (req, res) => {
  const {
    apafa = "todos",
    employmentStatus = "activos",
    leaveTypes = [],
    page = 1,
    limit = 20
  } = req.body;

  const now = new Date();
  const skip = (page - 1) * limit;

  const leavesMatch = {
    active: true,
    $or: [
      { actualEndLeaveDate: null },
      { actualEndLeaveDate: { $exists: false } }
    ]
  };

  if (leaveTypes?.length > 0) {
    leavesMatch.leaveType = {
      $in: leaveTypes.map(id => new mongoose.Types.ObjectId(id))
    };
  }

  const userStatusFilter = buildEmploymentFilter(employmentStatus);
  const userApafaFilter =
    apafa === "si"
      ? { apafa: true }
      : apafa === "no"
        ? { apafa: false }
        : {};

  const basePipeline = [
    { $match: leavesMatch },

    // ============== JOIN USER ==============
    {
      $lookup: {
        from: "users",
        localField: "idUser",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },

    // ============== FILTROS DE USUARIO ==============
    {
      $match: {
        ...(userStatusFilter.employmentStatus
          ? { "user.employmentStatus": userStatusFilter.employmentStatus }
          : {}),
        ...(Object.keys(userApafaFilter).length
          ? { "user.apafa": userApafaFilter.apafa }
          : {})
      }
    },

    // ============== PERIODOS ACTIVOS + DISPOSITIVO + PROGRAMA + RESPONSABLES (misma estructura que en usuarios) ==============
    {
      $lookup: {
        from: "periods",
        let: { userId: "$user._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$idUser", "$$userId"] },
                  { $lte: ["$startDate", now] },
                  {
                    $or: [
                      { $eq: ["$endDate", null] },
                      { $gte: ["$endDate", now] }
                    ]
                  }
                ]
              }
            }
          },

          // DISPOSITIVO
          {
            $lookup: {
              from: "dispositives",
              localField: "dispositiveId",
              foreignField: "_id",
              as: "device"
            }
          },
          { $unwind: { path: "$device", preserveNullAndEmptyArrays: true } },

          // RESPONSABLES DE DISPOSITIVO
          {
            $lookup: {
              from: "users",
              localField: "device.responsible",
              foreignField: "_id",
              as: "responsibleUsers"
            }
          },

          // COORDINADORES
          {
            $lookup: {
              from: "users",
              localField: "device.coordinators",
              foreignField: "_id",
              as: "coordinatorUsers"
            }
          },

          // PROGRAMA
          {
            $lookup: {
              from: "programs",
              localField: "device.program",
              foreignField: "_id",
              as: "program"
            }
          },
          {
            $unwind: {
              path: "$program",
              preserveNullAndEmptyArrays: true
            }
          },

          // RESPONSABLES DE PROGRAMA
          {
            $lookup: {
              from: "users",
              localField: "program.responsible",
              foreignField: "_id",
              as: "programResponsiblesRaw"
            }
          },

          // PROYECCIÓN IGUAL A auditInfoUsers
          {
            $project: {
              _id: 1,
              startDate: 1,
              endDate: 1,
              position: 1,
              category: 1,
              workShift: 1,

              dispositiveId: 1,
              deviceName: "$device.name",

              programId: "$program._id",
              programName: "$program.name",

              responsibles: {
                $map: {
                  input: "$responsibleUsers",
                  as: "r",
                  in: {
                    _id: "$$r._id",
                    name: { $concat: ["$$r.firstName", " ", "$$r.lastName"] }
                  }
                }
              },

              coordinators: {
                $map: {
                  input: "$coordinatorUsers",
                  as: "c",
                  in: {
                    _id: "$$c._id",
                    name: { $concat: ["$$c.firstName", " ", "$$c.lastName"] }
                  }
                }
              },

              programResponsibles: {
                $map: {
                  input: "$programResponsiblesRaw",
                  as: "pr",
                  in: {
                    _id: "$$pr._id",
                    name: { $concat: ["$$pr.firstName", " ", "$$pr.lastName"] }
                  }
                }
              }
            }
          }
        ],
        as: "currentHiring"
      }
    },

    // ============== SALIDA ==============
    {
  $project: {
    _id: 0,

    user: {
      _id: "$user._id",
      firstName: "$user.firstName",
      lastName: "$user.lastName",
      dni: "$user.dni",
      email: "$user.email",
      phone: "$user.phone",
      apafa: "$user.apafa",
      employmentStatus: "$user.employmentStatus"
    },

    leave: {
      _id: "$_id",
      leaveType: "$leaveType",
      startLeaveDate: "$startLeaveDate",
      expectedEndLeaveDate: "$expectedEndLeaveDate"
    },

    currentHiring: 1
  }
}

  ];

  // PAGINACIÓN
  const paginated = [...basePipeline, { $skip: skip }, { $limit: limit }];
  const counted = [...basePipeline, { $count: "total" }];

  const [results, totalCount] = await Promise.all([
    Leaves.aggregate(paginated),
    Leaves.aggregate(counted)
  ]);

  const totalResults = totalCount?.[0]?.total || 0;
  const totalPages = Math.ceil(totalResults / limit);
  response(res, 200, {
    results,
    page,
    totalPages,
    totalResults,
    limit
  });
};

const auditDocsProgram=async(req,res)=>{

   let {docs=[]}=req.body
  
  if(!Array.isArray(docs) || docs.length == 0) throw new ClientError('Debes seleccionar al menos un campo de documentación para auditar programas', 400);
  docs=docs.map((x)=>toId(x))

  const listDocumentation=await Documentation.find({_id:{ $in: docs }}).select('programs date duration')
  const listFileDrives=await Filedrive.find({originDocumentation:{ $in: docs }}).select('idModel originDocumentation date')

  let resData={}
  const missing = [];
    const expired = [];

    const now = new Date();

    for (const doc of listDocumentation) {
      const docId = doc._id;
      const hasExpiry = !!doc.date && !!doc.duration; // solo caduca si date=true y hay duration
      const durationDays = hasExpiry ? doc.duration : null;

      for (const programId of doc.programs) {
        // Todos los archivos para este documento + programa
        const filesForProgram = listFileDrives.filter(
          (fd) =>
            fd.originDocumentation.equals(docId) &&
            fd.idModel.equals(programId)
        );

        // 1) Si no hay ningún archivo -> missing
        if (filesForProgram.length === 0) {
          missing.push({
            documentationId: docId,
            programId,
          });
          continue; // no tiene sentido mirar caducidad si ni existe
        }

        // 2) Si no tiene caducidad configurada, no puede estar "expired"
        if (!hasExpiry) continue;
        const latestFile = filesForProgram.reduce((latest, current) =>
          !latest || current.date > latest.date ? current : latest
        , null);  

        const diffMs = now - latestFile.date;
        const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (daysPassed > durationDays) {
          expired.push({
            documentationId: docId,
            programId,
            lastFileId: latestFile._id,
            lastFileDate: latestFile.date,
            durationDays,
            daysPassed,
          });
        }
      }
    }
  response(res,200,{missing, expired})
  
}

const auditDocsDispo = async (req, res) => {
  let { docs = [] } = req.body;

  // 1) Validación básica
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new ClientError(
      'Debes seleccionar al menos un campo de documentación para auditar dispositivos',
      400
    );
  }

  // Aseguramos que son ObjectId
  docs = docs.map((x) => toId(x));

  // 2) Documentación seleccionada (para dispositivos)
  const listDocumentation = await Documentation.find({
    _id: { $in: docs },
  }).select('dispositives date duration');

  // 3) Todos los FileDrives asociados a esa documentación
  const listFileDrives = await Filedrive.find({
    originDocumentation: { $in: docs },
  }).select('idModel originDocumentation date');

  const missing = [];
  const expired = [];
  const now = new Date();

  for (const doc of listDocumentation) {
    const docId = doc._id;
    const hasExpiry = !!doc.date && !!doc.duration; // solo caduca si date=true y hay duration
    const durationDays = hasExpiry ? doc.duration : null;

    for (const dispositiveId of doc.dispositives) {
      // Todos los archivos para este documento + dispositivo
      const filesForDispositive = listFileDrives.filter(
        (fd) =>
          fd.originDocumentation.equals(docId) &&
          fd.idModel.equals(dispositiveId)
      );

      // 1) Si no hay ningún archivo -> missing
      if (filesForDispositive.length === 0) {
        missing.push({
          documentationId: docId,
          dispositiveId,
        });
        continue; // no tiene sentido mirar caducidad si ni existe
      }

      // 2) Si no tiene caducidad configurada, no puede estar "expired"
      if (!hasExpiry) continue;

      // 3) Mirar el último archivo (por fecha)
      const latestFile = filesForDispositive.reduce(
        (latest, current) =>
          !latest || current.date > latest.date ? current : latest,
        null
      );

      const diffMs = now - latestFile.date;
      const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (daysPassed > durationDays) {
        expired.push({
          documentationId: docId,
          dispositiveId,
          lastFileId: latestFile._id,
          lastFileDate: latestFile.date,
          durationDays,
          daysPassed,
        });
      }
    }
  }

  response(res, 200, { missing, expired });
};
// Regla: nómina del mes M → trabajo del mes M-1
function getPreviousMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// Conjunto de todos los meses en los que el usuario estuvo contratado
function buildActiveMonthsSet(periods) {
  const set = new Set();

  for (const p of periods) {
    if (!p.startDate) continue;

    const start = new Date(p.startDate);
    const end = p.endDate ? new Date(p.endDate) : new Date(); // periodo abierto = sigue activo

    let y = start.getFullYear();
    let m = start.getMonth() + 1;

    const endY = end.getFullYear();
    const endM = end.getMonth() + 1;

    while (y < endY || (y === endY && m <= endM)) {
      set.add(`${y}-${m}`);

      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  return set;
}

// Comprueba si la leave cubre un mes laboral concreto
function leaveCoversMonth(leave, year, month) {
  const start = new Date(leave.startLeaveDate);

  // Si no tiene final, la leave sigue activa
  const end = leave.actualEndLeaveDate
    ? new Date(leave.actualEndLeaveDate)
    : new Date(9999, 11, 31);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month    , 0);

  return start <= lastDay && end >= firstDay;
}

// Nómina firmada = tiene sign con texto y datetimeSign no null
function isPayrollSigned(p) {
  const sign = (p.sign || "").toString().trim();
  return sign.length > 0 && p.datetimeSign != null;
}


/* =========================================================
   LEAVE TYPES EXCLUIDOS
========================================================= */
const EXCLUDED_LEAVE_TYPES = [
  "673dba22eb7280f56e22b506",
  "673dba22eb7280f56e22b505",
  "673dba22eb7280f56e22b504"
];


/* =========================================================
   FUNCIÓN PRINCIPAL
========================================================= */

const auditPayrolls = async (req, res) => {
  let {
    selectedFields = [],
    apafa = "no",
    traking = "no",
    employment = "activos",
    time = { months: [], years: [] },
    page = 1,
    limit = 30,
  } = req.body || {};


  /* ---------------- VALIDACIONES ---------------- */

  if (!Array.isArray(selectedFields) || selectedFields.length === 0) {
    throw new ClientError(
      "Debes seleccionar al menos un criterio de auditoría.",
      400
    );
  }

  if (!time || !Array.isArray(time.months) || !Array.isArray(time.years)) {
    throw new ClientError("El filtro de tiempo es inválido.", 400);
  }

  if (time.months.length === 0 || time.years.length === 0) {
    throw new ClientError("Debes seleccionar al menos un mes y un año.", 400);
  }

  page  = Math.max(1, Number(page)  || 1);
  limit = Math.max(1, Number(limit) || 30);

  const payrollMonths = time.months.map(Number);
  const payrollYears  = time.years.map(Number);

  const auditNotPayroll = selectedFields.includes("notPayroll");
  const auditNotSign    = selectedFields.includes("notSign");


  /* ---------------- FILTRO BASE DE USUARIOS ---------------- */

  const matchBase = { ...buildEmploymentFilter(employment) };

  if (apafa === "si") matchBase.apafa = true;
  if (apafa === "no") matchBase.apafa = false;

  if (traking === "si") matchBase.tracking = true;
  if (traking === "no") matchBase.tracking = false;


  /* ---------------- OBTENER USUARIOS ---------------- */

  const users = await User.find(matchBase, {
    dni: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    apafa: 1,
    tracking: 1,
    employmentStatus: 1,
    payrolls: 1,
  }).lean();

  if (users.length === 0) {
    return response(res, 200, {
      results: [],
      totalResults: 0,
      totalPages: 1,
      page,
    });
  }

  const userIds = users.map((u) => u._id);


  /* ---------------- OBTENER PERIODOS ---------------- */

  const periods = await Periods.find(
    { 
    idUser: { $in: userIds },
    dispositiveId: { $ne: "68ee1f93ba50082b64512e65" } 
  },
    
    { idUser: 1, startDate: 1, endDate: 1 }
  ).lean();

  const periodsByUser = {};
  for (const p of periods) {
    const uid = p.idUser.toString();
    if (!periodsByUser[uid]) periodsByUser[uid] = [];
    periodsByUser[uid].push(p);
  }


  /* ---------------- OBTENER LEAVES ---------------- */

  const leaves = await Leaves.find(
    { 
      idUser: { $in: userIds },
      leaveType: { $in: EXCLUDED_LEAVE_TYPES }
    },
    {
      idUser: 1,
      leaveType: 1,
      startLeaveDate: 1,
      expectedEndLeaveDate: 1,
      actualEndLeaveDate: 1,
      active: 1
    }
  ).lean();

  const leavesByUser = {};
  for (const l of leaves) {
    const uid = l.idUser.toString();
    if (!leavesByUser[uid]) leavesByUser[uid] = [];
    leavesByUser[uid].push(l);
  }


  /* ---------------- COMBINACIONES DE MESES DE NÓMINA ---------------- */

  const payrollPeriods = [];
  for (const year of payrollYears) {
    for (const month of payrollMonths) {
      payrollPeriods.push({ year, month });
    }
  }


  /* =========================================================
     AUDITORÍA INDIVIDUAL POR USUARIO
  ========================================================== */

  const resultsAll = [];

  for (const u of users) {
    const uid = u._id.toString();
    const userPeriods = periodsByUser[uid] || [];

    if (userPeriods.length === 0) continue; // nunca estuvo contratado → no esperamos nóminas

    const activeMonthsSet = buildActiveMonthsSet(userPeriods);
    const userLeaves = leavesByUser[uid] || [];

    // Preprocesamos nóminas del usuario por mes
    const payrollIndex = new Map();
    for (const p of u.payrolls || []) {
      payrollIndex.set(`${p.payrollYear}-${p.payrollMonth}`, p);
    }

    let missingPayrolls = [];
    let notSignedPayrolls = [];
    let excludeUser = false;

    // Analizar cada nómina solicitada
    for (const { year: py, month: pm } of payrollPeriods) {

      const { year: laborYear, month: laborMonth } = getPreviousMonth(py, pm);
      const laborKey = `${laborYear}-${laborMonth}`;

      // 1) ¿Trabajó ese mes laboral?
      const wasActiveLaborMonth = activeMonthsSet.has(laborKey);

      if (!wasActiveLaborMonth) continue; // no estaba contratado → no se espera nómina

      // 2) ¿Tenía baja/excedencia (de tipos excluidos) ese mes?
      for (const leave of userLeaves) {
        if (leaveCoversMonth(leave, laborYear, laborMonth)) {
          excludeUser = true;
          break;
        }
      }

      if (excludeUser) break;

      // 3) Ahora sí: esperamos nómina para (py, pm)
      const payroll = payrollIndex.get(`${py}-${pm}`);

      if (!payroll) {
        if (auditNotPayroll) missingPayrolls.push({ year: py, month: pm });
        continue;
      }

      if (auditNotSign && !isPayrollSigned(payroll)) {
        notSignedPayrolls.push({ year: py, month: pm });
      }
    }

    if (excludeUser) continue;

    const hasMissing = auditNotPayroll ? missingPayrolls.length > 0 : false;
    const hasNotSigned = auditNotSign ? notSignedPayrolls.length > 0 : false;

    if (!hasMissing && !hasNotSigned) continue;

    resultsAll.push({
      _id: u._id,
      dni: u.dni,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      apafa: u.apafa,
      tracking: u.tracking,
      employmentStatus: u.employmentStatus,
      missingPayrolls,
      notSignedPayrolls,
    });
  }


  /* ---------------- PAGINACIÓN ---------------- */

  const totalResults = resultsAll.length;
  const totalPages = totalResults > 0 ? Math.ceil(totalResults / limit) : 1;

  const start = (page - 1) * limit;
  const end   = start + limit;

  const results = resultsAll.slice(start, end);


  /* ---------------- RESPUESTA ---------------- */

  response(res, 200, {
    results,
    totalResults,
    totalPages,
    page,
  });
};

// 
module.exports = {
  auditInfoUsers: catchAsync(auditInfoUsers),
  auditInfoPrograms: catchAsync(auditInfoPrograms),
  auditInfoDevices: catchAsync(auditInfoDevices),
  auditActiveLeaves: catchAsync(auditActiveLeaves),
  auditDocsProgram:catchAsync(auditDocsProgram),
  auditDocsDispo:catchAsync(auditDocsDispo),
  auditPayrolls:catchAsync(auditPayrolls)

};
