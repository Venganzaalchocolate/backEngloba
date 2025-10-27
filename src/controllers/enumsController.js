const { Jobs, Studies, Provinces, Work_schedule, Finantial, Offer, Program, User, Leavetype, Documentation, Filedrive, Dispositive } = require('../models/indexModels');
const leavetype = require('../models/leavetype');
const { default: cache } = require('../utils/cache');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* -------------------------------
   Helpers para construir índices
---------------------------------*/
function createSubcategoriesIndex(list = []) {
  // Espera docs con { _id, name, subcategories: [{ _id, name }] }
  const out = {};
  for (const it of list) {
    out[String(it._id)] = {
      name: it.name || '',
      subcategories: (it.subcategories || []).map(sc => ({
        _id: sc._id,
        name: sc.name || ''
      }))
    };
  }
  return out;
}

// utils de índice (reemplaza createCategoryAndSubcategoryIndex por esta versión)
function createCategoryAndSubcategoryIndex(list = []) {
  // Indexa raíz y subs; si existe "public", lo preserva
  const out = {};
  for (const p of list) {
    const pid = String(p._id);
    out[pid] = { 
      name: p.name || '', 
      isRoot: true 
    };
    if (typeof p.public === 'boolean') out[pid].public = p.public;

    for (const sc of (p.subcategories || [])) {
      const sid = String(sc._id);
      out[sid] = {
        name: sc.name || '',
        parent: p._id,
        isSub: true
      };
      if (typeof sc.public === 'boolean') out[sid].public = sc.public;
    }
  }
  return out;
}

function createCategoriesIndex(list = []) {
  // Tipos simples (sin subcategorías)
  const out = {};
  for (const it of list) {
    out[String(it._id)] = { name: it.name || '' };
  }
  return out;
}

function createProgramIndex(programs = []) {
  // Mantiene la estructura legacy: por cada programa, lista sus "devices"
  // devices = [{ _id, name, province }]
  const byProgram = new Map();
  for (const p of programs) {
    byProgram.set(String(p._id), {
      _id: p._id,
      name: p.name || '',
      acronym: p.acronym || '',
    });
  }


  // Devuelve un objeto indexado por id de programa (como antes)
  const out = {};
  for (const [k, v] of byProgram.entries()) out[k] = v;
  return out;
}

function createDispositiveIndex(dispositives = []) {
  const out = {};
  for (const d of dispositives) {
    out[String(d._id)] = {
      _id: d._id,
      name: d.name || '',
      program: d.program ? String(d.program) : null,   // <<< necesario
      province: d.province ? String(d.province) : null
    };
  }
  return out;
}

function createDispositivesByProgram(dispositives = []) {
  const byProgram = {};
  for (const d of dispositives) {
    const pid = String(d.program || 'null');
    if (!byProgram[pid]) byProgram[pid] = [];
    byProgram[pid].push({
      _id: d._id,
      name: d.name || '',
      province: d.province ? String(d.province) : null
    });
  }
  // (opcional) ordena por nombre
  for (const pid of Object.keys(byProgram)) {
    byProgram[pid].sort((a,b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }
  return byProgram;
}



const getEnums = async (req, res) => {
    const cached = cache.get('enums');
    if (cached) return response(res, 200, cached);

    const [jobs, provinces, work_schedule, studies, finantial] = await Promise.all([
      Jobs.find().lean(),           // solo campo name
      Provinces.find().lean(),
      Work_schedule.find().lean(),
      Studies.find().lean(),
      Finantial.find().lean(),
    ]);

      const jobsIndex = createCategoryAndSubcategoryIndex(jobs);
    const provincesIndex = createCategoryAndSubcategoryIndex(provinces);
    const studiesIndex    = createCategoryAndSubcategoryIndex(studies);

    if (!jobs || !provinces || !work_schedule || !studies || !finantial) {
      throw new ClientError('No se han podido cargar todos los enums', 500);
    }

    const enumValues = { jobs, provinces, work_schedule, studies, finantial, jobsIndex, provincesIndex, studiesIndex };

    cache.set('enums', enumValues);
    response(res, 200, enumValues);
}


/* --------------------------------
   Handler principal (sin caché)
----------------------------------*/
const getEnumEmployers = async (req, res) => {
  // status no necesita await (enum del schema)
  const status = User.schema.path('employmentStatus')?.enumValues || [];

  // Cargas en paralelo
  const [
    workSchedule,
    offers,
    jobs,
    provinces,
    leavetype,
    programs,
    studies,
    finantial,
    documentation,
    dispositives,
    docCats,
    fileCats,
  ] = await Promise.all([
    Work_schedule.find({}).lean(),
    // Ajusta los campos mínimos que usa tu front
    Offer.find({ active: true }).lean(),
    Jobs.find({}, { name: 1, subcategories: 1 }).lean(),
    Provinces.find({}, { name: 1, subcategories: 1 }).lean(),
    Leavetype.find({}, { name: 1 }).lean(),
    Program.find({},{ name: 1, acronym: 1,  active:1  }).lean(),
    Studies.find({}, { name: 1, subcategories: 1 }).lean(),
    Finantial.find({}).lean(),
    Documentation.find({}).lean(),
    Dispositive.find({},{ name: 1, program: 1, province: 1, active:1 }).lean(),
    // categorías posibles para categoryFiles (desde Documentation)
    Documentation.distinct('category').catch(() => []),
    // ...y también desde FileDrive si existe ese campo
    Filedrive.distinct('category').catch(() => []),
  ]);

  // Índices
  const jobsIndex = createCategoryAndSubcategoryIndex(jobs);
  const provincesIndex = createCategoryAndSubcategoryIndex(provinces);
  const leavesIndex = createCategoryAndSubcategoryIndex(leavetype);
  const programsIndex = createProgramIndex(programs);
const dispositiveIndex      = createDispositiveIndex(dispositives);
const studiesIndex    = createCategoryAndSubcategoryIndex(studies);

  // Categorías de ficheros (unificadas + ordenadas)
  const categoryFiles = Array.from(new Set([...(docCats || []), ...(fileCats || [])]
    .filter(Boolean))).sort();
  response(res, 200, {
    status,
    work_schedule: workSchedule,
    offers,
    jobsIndex,
    provincesIndex,
    dispositiveIndex,
    leavesIndex,
    programsIndex,   // mismo nombre/estructura que antes (program + devices)
    studiesIndex,
    finantial,
    documentation,
    categoryFiles,
  });
};

// Definición de tipos válidos con su correspondiente modelo
const validTypes = {
  jobs: Jobs,
  studies: Studies,
  provinces: Provinces,
  work_schedule: Work_schedule,
  finantial: Finantial,
  documentation: Documentation,
  leavetype: leavetype,
};

// Función auxiliar para obtener el modelo según el tipo
const getModelByType = (type) => {
  const Model = validTypes[type];
  if (!Model) throw new ClientError("Tipo no válido", 400);
  return Model;
};
const putEnums = async (req, res) => {
  const allowedTypes = ['jobs', 'studies', 'provinces', 'work_schedule', 'finantial', 'documentation', 'leavetype'];
  if (!req.body.id || !req.body.name || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);
  if (!allowedTypes.includes(req.body.type))
    throw new ClientError("El tipo no es correcto", 400);

  const Model = getModelByType(req.body.type);

  // Actualización de subcategorías (no aplicable para documentation)
  if (req.body.subId) {
    if (req.body.type === "documentation") {
      throw new ClientError("Documentation no tiene subcategorías", 400);
    }
    const updateData = { "subcategories.$[elem].name": req.body.name };
    if (req.body.type === "jobs") {
      updateData["subcategories.$[elem].public"] = req.body.public === 'si';
    }
    const updatedEnum = await Model.findOneAndUpdate(
      { _id: req.body.id },
      { $set: updateData },
      { new: true, arrayFilters: [{ "elem._id": req.body.subId }] }
    );
    if (!updatedEnum) throw new ClientError("Elemento no encontrado", 404);
    response(res, 200, updatedEnum);
    return;
  }

  // Actualización del documento principal
  const updateData = { name: req.body.name };
  if (req.body.type === 'documentation') {
    // Se requieren los campos label y model
    if (!req.body.name || !req.body.model)
      throw new ClientError("El campo nombre y el modelo son obligatorios para documentation", 400);
    updateData.name = req.body.name;
    updateData.model = req.body.model;
    updateData.date = req.body.date === 'si'; // Se guarda como boolean
    if ('requiresSignature' in req.body) {
      updateData.requiresSignature = req.body.requiresSignature;
    }
    if (!!req.body.categoryFiles) updateData.categoryFiles = req.body.categoryFiles
    if (!!updateData.date) updateData.duration = req.body.duration;
  }
  if (req.body.type === 'jobs') {
    updateData.public = req.body.public === 'si';
  }

  const updatedEnum = await Model.findByIdAndUpdate(req.body.id, updateData, { new: true });
  if (!updatedEnum) throw new ClientError("Elemento no encontrado", 404);
  response(res, 200, updatedEnum);
};


// DELETE: Eliminar un documento existente
const deleteEnums = async (req, res) => {
  if (!req.body.id || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);
  const Model = getModelByType(req.body.type);
  const result = await Model.deleteOne({ _id: req.body.id });
  if (result.deletedCount === 0)
    throw new ClientError("No se encontró el documento para eliminar", 404);
  response(res, 200, result);
};

// POST Subcategoría: Agrega una subcategoría a un documento existente
const postSubcategory = async (req, res) => {
  if (!req.body.id || !req.body.name || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);
  const filter = { _id: req.body.id };
  // Construimos el objeto de la subcategoría
  const subData = { name: req.body.name };
  if (req.body.type === "jobs") {
    subData.public = req.body.public === 'si';
  }
  const update = { $push: { subcategories: subData } };
  const Model = getModelByType(req.body.type);
  const updatedEnum = await Model.findOneAndUpdate(filter, update, { new: true });
  response(res, 200, updatedEnum);
};
const postEnums = async (req, res) => {
  if (!req.body.name || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);

  const { name, date, type, public: pub } = req.body;
  const Model = getModelByType(type);

  const newData = { name };
  if (type === 'documentation') {
    // Se requiere el campo label y el campo model al crear documentation
    if (!name)
      throw new ClientError("El campo nombre es obligatorio para documentation", 400);
    if (!req.body.model)
      throw new ClientError("El campo model es obligatorio para documentation", 400);
    newData.name = name;
    newData.model = req.body.model;
    newData.date = date === 'si'; // Convertir 'si' a true, 'no' a false
    newData.requiresSignature = !!req.body.requiresSignature;
    if (!!req.body.categoryFiles) newData.categoryFiles = req.body.categoryFiles
    if (!!newData.date) {
      if (!req.body.duration) {
        throw new ClientError("El campo duración, la duración debe ser en días, y es obligatorio si el documento tiene fecha", 400);
      } else {
        newData.duration = req.body.duration
      }
    }
  }
  if (type === 'jobs') {
    newData.public = pub === 'si';
  }

  const newEnum = new Model(newData);
  const savedEnum = await newEnum.save();
  response(res, 200, savedEnum);
};


// DELETE Subcategoría: Eliminar una subcategoría de un documento existente
const deleteSubcategory = async (req, res) => {
  if (!req.body.id || !req.body.idCategory || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);
  const filter = { _id: req.body.id };
  const update = { $pull: { subcategories: { _id: req.body.idCategory } } };
  const Model = getModelByType(req.body.type);
  const updatedEnum = await Model.findOneAndUpdate(filter, update, { new: true });
  response(res, 200, updatedEnum);
};




module.exports = {
  //gestiono los errores con catchAsync
  getEnums: catchAsync(getEnums),
  putEnums: catchAsync(putEnums),
  postEnums: catchAsync(postEnums),
  deleteEnums: catchAsync(deleteEnums),
  postSubcategory: catchAsync(postSubcategory),
  deleteSubcategory: catchAsync(deleteSubcategory),
  getEnumEmployers: catchAsync(getEnumEmployers),
}
