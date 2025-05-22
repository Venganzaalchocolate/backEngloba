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



//------------------------------------------------------------------
module.exports = {
  getCvOverview: catchAsync(getCvOverview),
  getCvMonthly: catchAsync(getCvMonthly),
  getCvDistribution: catchAsync(getCvDistribution),
  getCvConversion: catchAsync(getCvConversion)
};