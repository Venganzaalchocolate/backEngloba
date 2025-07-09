const { UserCv, Program, Offer, User } = require('../models/indexModels');

//------------------------------------------------------------------
//  Estadísticas de CV para Engloba
//  Siguiendo el mismo esquema que auditorController.js
//------------------------------------------------------------------
/* eslint-disable no-magic-numbers */

const mongoose = require('mongoose');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
//  Helper: cuenta CV contratados buscando coincidencia de DNI
//------------------------------------------------------------------
const countHiredCv = async () => {
  const dnis = await User.distinct('dni');            // DNIs de empleados
  if (!dnis.length) return 0;
  return UserCv.countDocuments({ dni: { $in: dnis } });
};

//------------------------------------------------------------------
//  1. Overview
//------------------------------------------------------------------
const getCvOverview = async (req, res) => {
  const now = new Date();
  const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, month, hired, disability33] = await Promise.all([
    UserCv.estimatedDocumentCount(),
    UserCv.countDocuments({ createdAt: { $gte: firstDayMonth } }),
    countHiredCv(),
    UserCv.countDocuments({ disability: { $gte: 33 } })
  ]);

  response(res, 200, {
    total,
    thisMonth: month,
    hired,
    disabilityEqualOrAbove33: disability33
  });
};

//------------------------------------------------------------------
//  2. Serie mensual
//------------------------------------------------------------------
const getCvMonthly = async (req, res) => {
  const { year } = req.body;
  if (!year || isNaN(year)) {
    return response(res, 400, { error: 'Debes enviar un año válido en el body.' });
  }

  const startOfYear = new Date(year, 0, 1);
  const startOfNext = new Date(+year + 1, 0, 1);

  const monthlyPipeline = [
    { $match: { createdAt: { $gte: startOfYear, $lt: startOfNext } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: 1 } } },
    { $sort: { '_id': 1 } }
  ];
  const yearsPipeline = [
    { $group: { _id: { $year: '$createdAt' } } },
    { $sort: { '_id': -1 } },
    { $project: { _id: 0, year: { $toString: '$_id' } } }
  ];

  const [rawMonthly, yearsRaw] = await Promise.all([
    UserCv.aggregate(monthlyPipeline),
    UserCv.aggregate(yearsPipeline)
  ]);

  const countsByMonth = rawMonthly.reduce((acc, { _id, total }) => {
    const [, month] = _id.split('-');
    acc[month] = total;
    return acc;
  }, {});
  const years = yearsRaw.map(d => d.year);

  response(res, 200, { [year]: countsByMonth, years });
};



const getCvDistributionMeta = async (field) => {

  // 1 · Validación del campo
  const allowed = ['provinces', 'jobs', 'studies', 'work_schedule'];
  if (!allowed.includes(field)) {
    throw new ClientError(`Campo no admitido: ${field}`, 400);
  }

  // 2 · Pipeline para extraer todos los year y month disponibles
  const docs = await UserCv.aggregate([
    { $unwind: `$${field}` },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        }
      }
    },
    {
      $project: {
        _id: 0,
        year: { $toString: '$_id.year' },
        month: {
          $cond: [
            { $lt: ['$_id.month', 10] },
            { $concat: ['0', { $toString: '$_id.month' }] },
            { $toString: '$_id.month' }
          ]
        }
      }
    },
    { $sort: { year: 1, month: 1 } }
  ]);

  // 3 · Construir meta
  const years = [];
  const monthsByYear = {};

  docs.forEach(({ year, month }) => {
    if (!years.includes(year)) {
      years.push(year);
      monthsByYear[year] = new Set();
    }
    monthsByYear[year].add(month);
  });

  years.sort();
  Object.keys(monthsByYear).forEach(y => {
    monthsByYear[y] = Array.from(monthsByYear[y]).sort();
  });

  // 4 · Responder
  return {
    years,           // e.g. ['2024','2025']
    monthsByYear     // e.g. { '2024':['08','09',...], '2025':['01','02',...] }
  };
};



//------------------------------------------------------------------
//  3. Distribución por campo discreto
//------------------------------------------------------------------
const getCvDistribution = async (req, res) => {
  const { year, month, field, granularity = 'month' } = req.body || {};

  /* 1 · validaciones ------------------------------------------------------ */
  const allowed = ['provinces', 'jobs', 'studies', 'work_schedule'];
  if (!allowed.includes(field)) {
    throw new ClientError(`Campo no admitido: ${field}`, 400);
  }
  if (!['month', 'year'].includes(granularity)) {
    throw new ClientError('granularity debe ser "month" o "year"', 400);
  }
  if (!year || !/^\d{4}$/.test(year)) {
    throw new ClientError('year debe tener formato YYYY', 400);
  }
  if (granularity === 'month') {
    if (!month || !/^(0[1-9]|1[0-2])$/.test(month)) {
      throw new ClientError('month debe tener formato MM (01–12)', 400);
    }
  }

  /* 2 · rango de fechas --------------------------------------------------- */
  const match = {
    createdAt: {
      $gte: new Date(`${year}-${granularity === 'month' ? month : '01'}-01T00:00:00Z`),
      $lt: new Date(
        granularity === 'year'
          ? `${Number(year) + 1}-01-01T00:00:00Z`
          : // primer día del mes siguiente:
          new Date(Date.UTC(year, Number(month), 1))
            .toISOString()
            .slice(0, 10) + 'T00:00:00Z'
      )
    }
  };

  /* 3 · proyección de periodo -------------------------------------------- */
  const periodExpr = granularity === 'year'
    ? { year: { $year: '$createdAt' } }
    : {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' }
    };

  /* 4 · pipeline ---------------------------------------------------------- */
  const pipeline = [
    { $match: match },
    { $unwind: `$${field}` },

    // 1 · contar por (periodo,val)
    {
      $group: {
        _id: { period: periodExpr, val: `$${field}` },
        total: { $sum: 1 }
      }
    },

    // 2 · reagrupar por periodo, acumulando la lista
    {
      $group: {
        _id: '$_id.period',
        distr: { $push: { value: '$_id.val', total: '$total' } }
      }
    },

    // 3 · ordenar dentro del array por total desc
    {
      $set: {
        distr: {
          $sortArray: { input: '$distr', sortBy: { total: -1 } }
        }
      }
    },

    // 4 · top 12
    { $set: { distr: { $slice: ['$distr', 12] } } },

    // 5 · formatear periodo y renombrar array a `distribution`
    {
      $project: {
        _id: 0,
        period:
          granularity === 'year'
            ? { $toString: '$_id.year' }
            : {
              $concat: [
                { $toString: '$_id.year' },
                '-',
                {
                  $cond: [
                    { $lt: ['$_id.month', 10] },
                    { $concat: ['0', { $toString: '$_id.month' }] },
                    { $toString: '$_id.month' }
                  ]
                }
              ]
            },
        distribution: '$distr'
      }
    },

    // 6 · orden cronológico
    { $sort: { period: 1 } }
  ];

  // Ejecuta la agregación
  const data = await UserCv.aggregate(pipeline);



  const meta = await getCvDistributionMeta(field)

  // 8 · devolver todo junto
  response(res, 200, {
    distribution: data,
    meta
  });
};



//------------------------------------------------------------------
//  4. Conversión CV → contratado
//------------------------------------------------------------------
// ─── util: array de DNIs contratados ─────────────────────────
const getEmployeeDnis = async () => {
  // filtra solo empleados activos si lo prefieres
  return User.distinct('dni');
};



// ─── conversión mensual dentro de un año ───────────────────────
const getCvConversion = async (req, res) => {
  const { year } = req.body || {};

  /* 1 · Validación ---------------------------------------------------- */
  if (!year || !/^\d{4}$/.test(year)) {
    throw new ClientError('year debe tener formato YYYY', 400);
  }

  /* 2 · Rango de fechas ---------------------------------------------- */
  const startOfYear = new Date(`${year}-01-01T00:00:00Z`);
  const startOfNext = new Date(`${Number(year) + 1}-01-01T00:00:00Z`);

  /* 3 · DNIs contratados --------------------------------------------- */
  const hiredDnis = await getEmployeeDnis();

  /* 4 · Pipelines ----------------------------------------------------- */
  const pipeline = [
    { $match: { createdAt: { $gte: startOfYear, $lt: startOfNext } } },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        totalCv: { $sum: 1 },
        hiredCv: { $sum: { $cond: [{ $in: ['$dni', hiredDnis] }, 1, 0] } }
      }
    },
    { $sort: { '_id.month': 1 } },
    {
      $project: {
        _id: 0,
        period: {
          year: { $literal: year },          // «2025» en texto
          month: {
            $cond: [
              { $lt: ['$_id.month', 10] },
              { $concat: ['0', { $toString: '$_id.month' }] },
              { $toString: '$_id.month' }
            ]
          }
        },
        totalCv: 1,
        hiredCv: 1,
        conversionRate: {
          $cond: [
            { $eq: ['$totalCv', 0] },
            0,
            { $divide: ['$hiredCv', '$totalCv'] }
          ]
        }
      }
    }
  ];

  const yearsPipeline = [
    { $group: { _id: { $year: '$createdAt' } } },
    { $sort: { '_id': -1 } },
    { $project: { _id: 0, year: { $toString: '$_id' } } }
  ];

  /* 5 · Ejecutar ambas consultas en paralelo -------------------------- */
  const [data, yearsRaw] = await Promise.all([
    UserCv.aggregate(pipeline),
    UserCv.aggregate(yearsPipeline)
  ]);
  const years = yearsRaw.map(d => d.year);

  /* 6 · Responder ----------------------------------------------------- */
  response(res, 200, { data, years });
};

//----------------------TRABAJADORES-----------------------------

const auditWorkersStats = async (req, res) => {
  const { month, year, programId, deviceId, apafa } = req.body;

  /* 1 · Validaciones */
  if (month && !year)
    throw new ClientError('Si envías month debes enviar también year', 400);

  if (month && (month < 1 || month > 12))
    throw new ClientError('month debe ser 1-12', 400);

  if (programId && !mongoose.Types.ObjectId.isValid(programId))
    throw new ClientError('programId inválido', 400);

  if (deviceId && !mongoose.Types.ObjectId.isValid(deviceId))
    throw new ClientError('deviceId inválido', 400);

  if (programId && !mongoose.Types.ObjectId.isValid(programId))
    throw new ClientError('programId inválido', 400);
  if (deviceId && !mongoose.Types.ObjectId.isValid(deviceId))
    throw new ClientError('deviceId inválido', 400);

  let refDate = null;
  let periodDateMatch = null;

  if (year && month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or: [{ endDate: null }, { endDate: { $gte: start } }]
    };
    refDate = end;
  } else if (year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or: [{ endDate: null }, { endDate: { $gte: start } }]
    };
    refDate = end;
  } else {
    refDate = new Date();   // sin filtros de fecha
  }


  /* 4 · Dispositivos de interés (para filtro programa/device) */
  let deviceIdsFilter = [];

  if (programId) {
    const program = await Program.findById(programId).select('devices._id');
    if (!program) throw new ClientError('Programa no encontrado', 404);
    deviceIdsFilter = program.devices.map(d => d._id.toString());
  }
  if (deviceId) {                               // prioriza dispositivo explícito
    if (deviceIdsFilter.length && !deviceIdsFilter.includes(deviceId)) {
      // el dispositivo no pertenece a ese programa → sin resultados
      return response(res, 200, {
        total: 0, disability: 0, male: 0, female: 0,
        fostered: 0, over55: 0, under25: 0
      });
    }
    deviceIdsFilter = [deviceId];
  }

let match = { employmentStatus: 'activo' };

if (apafa === 'si') match.apafa = true;
else if (apafa === 'no') match.apafa = false;

  // a) filtro histórico (mes/año) sobre hiringPeriods
  if (periodDateMatch) {
    match.hiringPeriods = { $elemMatch: periodDateMatch };
  }

  // b) filtro por programa/dispositivo “actual” usando dispositiveNow
  if (deviceIdsFilter.length) {
    match.dispositiveNow = {
      $elemMatch: {
        active: true,                                         // por claridad
        device: { $in: deviceIdsFilter.map(id => new mongoose.Types.ObjectId(id)) }
      }
    };
  }

  /* 6 · Pipeline */
  const stats = await User.aggregate([
    { $match: match },
    {
      $addFields: {
        age: {
          $dateDiff: {
            startDate: '$birthday',
            endDate: refDate,
            unit: 'year'
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        disability: { $sum: { $cond: [{ $gt: ['$disability.percentage', 0] }, 1, 0] } },
        male: { $sum: { $cond: [{ $eq: ['$gender', 'male'] }, 1, 0] } },
        female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } },
        fostered: { $sum: { $cond: ['$fostered', 1, 0] } },       // jóvenes extutelados
        over55: { $sum: { $cond: [{ $gte: ['$age', 55] }, 1, 0] } },
        under25: { $sum: { $cond: [{ $lt: ['$age', 25] }, 1, 0] } }
      }
    },
    { $project: { _id: 0 } }
  ]);

  const normalized = stats[0] ?? {
    total: 0, disability: 0, male: 0, female: 0,
    fostered: 0, over55: 0, under25: 0
  };

  /* 7 · Respuesta */
  response(res, 200, normalized);
};

// ──────────────────────────────────────────────────────────────────────────────
// 1 · Pirámide de edad  (male / female)
//    →  [{ age: 18, male: 4, female: 6 }, … ]
// ──────────────────────────────────────────────────────────────────────────────


async function buildMatchStage({ year, month, programId, deviceId, apafa }) {

  /* ───── 1 · Validaciones básicas ────────────────────────────────────── */
  if (month && !year) {
    throw new ClientError('Si envías month debes enviar también year', 400);
  }
  if (month && (month < 1 || month > 12)) {
    throw new ClientError('month debe estar entre 1-12', 400);
  }
  if (programId && !mongoose.Types.ObjectId.isValid(programId)) {
    throw new ClientError('programId inválido', 400);
  }
  if (deviceId && !mongoose.Types.ObjectId.isValid(deviceId)) {
    throw new ClientError('deviceId inválido', 400);
  }

  /* ───── 2 · refDate + filtro temporal sobre hiringPeriods ───────────── */
  let refDate          = new Date(); // por defecto: ahora
  let periodDateMatch  = null;       // se usará en $elemMatch

  if (year && month) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or      : [{ endDate: null }, { endDate: { $gte: start } }]
    };
    refDate = end;

  } else if (year) {
    const start = new Date(year, 0, 1);
    const end   = new Date(year, 11, 31, 23, 59, 59, 999);

    periodDateMatch = {
      startDate: { $lte: end },
      $or      : [{ endDate: null }, { endDate: { $gte: start } }]
    };
    refDate = end;
  }

  /* ───── 3 · Determinar dispositivos válidos según programa/device ───── */
  let deviceIdsFilter = [];

  if (programId) {
    const program = await Program.findById(programId).select('devices._id');
    if (!program) throw new ClientError('Programa no encontrado', 404);
    deviceIdsFilter = program.devices.map(d => String(d._id));
  }

  if (deviceId) {
    // si ya tenemos deviceIdsFilter (por programa) comprueba pertenencia
    if (deviceIdsFilter.length && !deviceIdsFilter.includes(deviceId)) {
      // el dispositivo no forma parte del programa ⇒ ningún usuario coincidirá
      deviceIdsFilter = ['000000000000000000000000']; // id imposible
    } else {
      deviceIdsFilter = [deviceId];
    }
  }

  /* ───── 4 · Construir el $match base ─────────────────────────────────── */
  const match = { employmentStatus: 'activo' };

  // a) filtro APAFA
  if (apafa === 'si')      match.apafa = true;
  else if (apafa === 'no') match.apafa = false;

  // b) rango temporal sobre hiringPeriods
  if (periodDateMatch) {
    match.hiringPeriods = { $elemMatch: periodDateMatch };
  }

  // c) dispositivo actual (dispositiveNow.activo = true)
  if (deviceIdsFilter.length) {
    match.dispositiveNow = {
      $elemMatch: {
        active: true,
        device: { $in: deviceIdsFilter.map(id => new mongoose.Types.ObjectId(id)) }
      }
    };
  }

  return { match, refDate };
}


function expandElemMatchObject(elemMatchObj = {}) {
  if (!elemMatchObj.$elemMatch) return {};
  const criteria = elemMatchObj.$elemMatch;
  const flat = {};
  for (const [k, v] of Object.entries(criteria)) {
    flat[`hiringPeriods.${k}`] = v;
  }
  return flat;
}


// controllers/statsWorkers.js
const getWorkersStats = async (req, res) => {

  const {
    year, month, programId, deviceId, apafa,
    // opcional: lista de estadísticos que el front desea;
    // [] ó null ⇒ todos
    stats = []
  } = req.body;

  /* 1 · Filtros comunes ---------------------------------------------- */
  const { match, refDate } = await buildMatchStage({
    year, month, programId, deviceId, apafa
  });

  /* 2 · Construcción dinámica de facets ------------------------------ */
  // Si el front manda un array con ['pyramid','pie'] solo añadimos esas ramas
  // Para evitar repetir strings creamos un set:
  const wanted = new Set(stats);          // vacío ⇒ todas

  const facets = {};

  /* ——— a) Conteo global (tu auditWorkersStats) ———————————————— */
  if (!stats.length || wanted.has('audit')) {
    facets.audit = [
      {
        $group: {
          _id: null,
          total      : { $sum: 1 },
          disability : { $sum: { $cond:[{ $gt:['$disability.percentage',0]},1,0] } },
          male       : { $sum: { $cond:[{ $eq:['$gender','male']  },1,0] } },
          female     : { $sum: { $cond:[{ $eq:['$gender','female']},1,0] } },
          fostered   : { $sum: { $cond:['$fostered',1,0] } },
          over55     : { $sum: { $cond:[{ $gte:['$age',55]},1,0] } },
          under25    : { $sum: { $cond:[{ $lt :['$age',25]},1,0] } }
        }
      },
      { $project:{ _id:0 } }
    ];
  }
  /* ——— b) Pirámide de edad ——————————————————————————————— */
  if (!stats.length || wanted.has('pyramid')) {
    facets.pyramid = [
      { $group: {
          _id  : '$age',
          male : { $sum:{ $cond:[{ $eq:['$gender','male']},1,0] } },
          female:{ $sum:{ $cond:[{ $eq:['$gender','female']},1,0] } }
      }},
      { $project:{ _id:0, age:'$_id', male:1, female:1 } },
      { $sort:{ age:1 } }
    ];
  }

  /* ——— c) Pie genérico (podemos incluir los cuatro de golpe) ———— */
  const pieFields = ['gender', 'apafa', 'fostered', 'disability'];
  for (const fld of pieFields) {
    if (stats.length && !wanted.has(`pie:${fld}`)) continue;       // saltar
    let groupExpr;
    switch (fld) {
      case 'disability':
        groupExpr = { $cond:[{ $gt:['$disability.percentage',0]},'disability','no_disability'] };
        break;
      case 'apafa':
        groupExpr = { $cond:['$apafa','apafa','engloba'] };
        break;
      case 'fostered':
        groupExpr = { $cond:['$fostered','fostered','no_fostered'] };
        break;
      default:            // gender
        groupExpr = '$gender';
    }

    facets[`pie_${fld}`] = [
      { $group:{ _id: groupExpr, value:{ $sum:1 } } },
      { $project:{ _id:0, key:'$_id', value:1 } }
    ];
  }

  // —— d) Altas / Bajas mensuales ——————————— */
if (!stats.length || wanted.has('hiredEnded')) {
  facets.hiredEnded = [
    { $unwind: '$hiringPeriods' },
    { $match : expandElemMatchObject(match.hiringPeriods) },

    /* 1) creamos un array events: [{date, type:'hired'}, {date, type:'ended'}] */
    { $project: {
        events: {
          $concatArrays: [
            [ { date:'$hiringPeriods.startDate', type:'hired' } ],
            {
              $cond: [
                { $ne:['$hiringPeriods.endDate', null] },
                [ { date:'$hiringPeriods.endDate', type:'ended' } ],
                []
              ]
            }
          ]
        }
      }
    },

    /* 2) aplanamos cada evento */
    { $unwind: '$events' },

    /* 3) agrupamos por año-mes contando contrataciones y bajas */
    { $group: {
        _id: {
          y: { $year : '$events.date' },
          m: { $month: '$events.date' }
        },
        hired: { $sum: { $cond:[{ $eq:['$events.type','hired'] }, 1, 0] } },
        ended: { $sum: { $cond:[{ $eq:['$events.type','ended'] }, 1, 0] } }
      }
    },

    /* 4) formato final ordenado */
    { $project: {
        _id  : 0,
        year : '$_id.y',
        month: '$_id.m',
        hired: 1,
        ended: 1
      }
    },
    { $sort: { year: 1, month: 1 } }
  ];
}
  /* ——— e) Jornada (full-time / part-time) ——————————— */
  if (!stats.length || wanted.has('workShift')) {
    facets.workShift = [
      { $unwind:'$dispositiveNow' },
      { $match:{ 'dispositiveNow.active':true } },
      { $group:{
          _id :'$dispositiveNow.workShift.type',
          total:{ $sum:1 }
      }},
      { $project:{ _id:0, type:'$_id', total:1 } }
    ];
  }

  /* ——— f) Antigüedad buckets ——————————— */
  if (!stats.length || wanted.has('tenure')) {
    facets.tenure = [
      { $unwind:'$hiringPeriods' },
      { $match:{ 'hiringPeriods.active':true } },
      { $addFields:{
          tenureYears:{
            $divide:[
              { $subtract:[ refDate, '$hiringPeriods.startDate' ] },
              1000*60*60*24*365
            ]
          }
      }},
      { $addFields:{
          bucket:{
            $switch:{
              branches:[
                { case:{ $lt:['$tenureYears',1] }, then:'0-1' },
                { case:{ $lt:['$tenureYears',3] }, then:'1-3' },
                { case:{ $lt:['$tenureYears',5] }, then:'3-5' }
              ],
              default:'5+'
            }
          }
      }},
      { $group:{ _id:'$bucket', total:{ $sum:1 } } },
      { $project:{ _id:0, bucket:'$_id', total:1 } },
      { $sort:{ bucket:1 } }
    ];
  }

  /* 3 · Pipeline principal ------------------------------------------- */
  const pipeline = [
    { $match: match },
    { $addFields:{
        age:{ $dateDiff:{ startDate:'$birthday', endDate:refDate, unit:'year' } }
    }},
    { $facet: facets }
  ];

  /* 4 · Ejecución y formateo ----------------------------------------- */
  const [raw] = await User.aggregate(pipeline, { allowDiskUse:true }).catch((x)=>console.log(x));

  // Normalizamos salida parecido a lo que ya hacías
  const responseData = {
    audit     : raw.audit?.[0]        ?? { total:0, disability:0, male:0, female:0, fostered:0, over55:0, under25:0 },
    pyramid   : raw.pyramid           ?? [],
    pie       : {
      gender     : raw.pie_gender    ?? [],
      apafa      : raw.pie_apafa     ?? [],
      fostered   : raw.pie_fostered  ?? [],
      disability : raw.pie_disability?? []
    },
    hiredEnded: raw.hiredEnded        ?? [],
    workShift : raw.workShift         ?? [],
    tenure    : raw.tenure            ?? []
  };

  response(res, 200, responseData);
};

//borrar



//------------------------------------------------------------------
module.exports = {
  getCvOverview: catchAsync(getCvOverview),
  getCvMonthly: catchAsync(getCvMonthly),
  getCvDistribution: catchAsync(getCvDistribution),
  getCvConversion: catchAsync(getCvConversion),
  auditWorkersStats: catchAsync(auditWorkersStats),
  getWorkersStats: catchAsync(getWorkersStats),

};