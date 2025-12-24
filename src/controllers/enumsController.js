const { Jobs, Studies, Provinces, Work_schedule, Finantial, Offer, Program, User, Leavetype, Documentation, Filedrive, Dispositive } = require('../models/indexModels');
const leavetype = require('../models/leavetype');
const { default: cache } = require('../utils/cache');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');


/* -------------------------------
   Helpers para construir índices
---------------------------------*/

const { uploadFileToDrive, updateFileInDrive, deleteFileById } = require('./googleController');

const sanitizeDriveName = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);

const parseSiNo = (v) => {
  if (typeof v === "boolean") return v;
  const s = String(v || "").trim().toLowerCase();
  return s === "si" || s === "true" || s === "1";
};

const resolveModelsFolderId = () => {
  // fallback seguro: modelos -> files
  return (
    process.env.GOOGLE_DRIVE_FILES ||
    null
  );
};



// Upload con fallback si el env apunta a un FILE (y no a carpeta)
async function uploadModelPdfWithFallback({ reqFile, folderId, driveName }) {
  try {
    return await uploadFileToDrive(reqFile, folderId, driveName, false);
  } catch (err) {
    const msg = String(err?.message || "");
    const isNotFound =
      msg.includes("File not found") || msg.includes("notFound") || msg.includes("404");

    if (isNotFound) {
      const parentId = await obtenerCarpetaContenedora(folderId).catch(() => null);
      if (parentId && parentId !== folderId) {
        console.log("🟨 [documentation] folderId era un fileId, reintentando con parent:", parentId);
        return await uploadFileToDrive(reqFile, parentId, driveName, false);
      }
    }
    throw err;
  }
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


function createProgramIndex(programs = []) {
  // Mantiene la estructura legacy: por cada programa, lista sus "devices"
  // devices = [{ _id, name, province }]
  const byProgram = new Map();
  for (const p of programs) {
    byProgram.set(String(p._id), {
      _id: p._id,
      name: p.name || '',
      acronym: p.acronym || '',
      type:'program',
      active:p.active
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
      province: d.province ? String(d.province) : null,
      type:'dispositive',
      active:d.active
    };
  }
  return out;
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

const postEnums = async (req, res) => {
  if (!req.body?.name || !req.body?.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  const { name, type, public: pub } = req.body;
  const Model = getModelByType(type);

  const newData = { name };

  if (type === "documentation") {
    if (!req.body.model) {
      throw new ClientError("El campo model es obligatorio para documentation", 400);
    }

    newData.model = req.body.model;
    newData.date = parseSiNo(req.body.date);
    newData.requiresSignature = parseSiNo(req.body.requiresSignature);
    if (req.body.categoryFiles) newData.categoryFiles = req.body.categoryFiles;

    if (newData.date) {
      if (!req.body.duration) {
        throw new ClientError("Duración obligatoria si el documento tiene fecha", 400);
      }
      newData.duration = Number(req.body.duration);
    }
  }

  if (type === "jobs") {
    newData.public = pub === "si";
  }

  // 1) Crear documento Mongo
  const savedEnum = await new Model(newData).save();

  // 2) Subir modelo PDF si viene archivo
  if (type === "documentation" && req.file) {
    const folderId = resolveModelsFolderId();

    if (!folderId) {
      await Model.deleteOne({ _id: savedEnum._id }).catch(() => {});
      throw new ClientError("Carpeta destino inválida o sin acceso ", 500);
    }

    const driveName = `modelo_${sanitizeDriveName(savedEnum.name)}`;

    let uploadedId = null;
    try {
      const up = await uploadFileToDrive(req.file, folderId, driveName, false);

      uploadedId = up?.id;
      if (!uploadedId) throw new Error("uploadFileToDrive no devolvió id");

      savedEnum.modeloPDF = uploadedId;
      await savedEnum.save();
    } catch (err) {
      if (uploadedId) await deleteFileById(uploadedId).catch(() => {});
      await Model.deleteOne({ _id: savedEnum._id }).catch(() => {});
      throw err;
    }
  }

  response(res, 200, savedEnum);
};

const putEnums = async (req, res) => {
  const allowedTypes = [
    "jobs",
    "studies",
    "provinces",
    "work_schedule",
    "finantial",
    "documentation",
    "leavetype",
  ];

  if (!req.body.id || !req.body.name || !req.body.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }
  if (!allowedTypes.includes(req.body.type)) {
    throw new ClientError("El tipo no es correcto", 400);
  }

  const { id, type, subId } = req.body;
  const Model = getModelByType(type);

  // subcategorías
  if (subId) {
    if (type === "documentation") throw new ClientError("Documentation no tiene subcategorías", 400);

    const updateData = { "subcategories.$[elem].name": req.body.name };
    if (type === "jobs") updateData["subcategories.$[elem].public"] = req.body.public === "si";

    const updatedEnum = await Model.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true, arrayFilters: [{ "elem._id": subId }] }
    );

    if (!updatedEnum) throw new ClientError("Elemento no encontrado", 404);
    return response(res, 200, updatedEnum);
  }

  // doc principal
  const updateData = { name: req.body.name };

  if (type === "documentation") {
    if (!req.body.model) throw new ClientError("El campo model es obligatorio para documentation", 400);

    updateData.model = req.body.model;
    updateData.date = parseSiNo(req.body.date);
    updateData.requiresSignature = parseSiNo(req.body.requiresSignature);

    if (req.body.categoryFiles) updateData.categoryFiles = req.body.categoryFiles;

    if (updateData.date) {
      if (!req.body.duration) {
        throw new ClientError("El campo duración (en días) es obligatorio si el documento tiene fecha", 400);
      }
      updateData.duration = Number(req.body.duration);
    } else {
      updateData.duration = undefined;
    }

    // Si viene archivo, actualizar/subir modeloPDF
    if (req.file) {
      const folderId = resolveModelsFolderId();
      if (!folderId) {
        throw new ClientError("Falta  GOOGLE_DRIVE_FILES para subir el modeloPDF", 500);
      }

      const prev = await Model.findById(id).lean();
      if (!prev) throw new ClientError("Elemento no encontrado", 404);

      const driveName = `modelo_${sanitizeDriveName(req.body.name)}`;

      let newUploadedId = null;

      try {
        if (prev.modeloPDF) {
          await updateFileInDrive(req.file, prev.modeloPDF, driveName);
          updateData.modeloPDF = prev.modeloPDF;
        } else {
          const up = await uploadFileToDrive(req.file, folderId, driveName, false);
          if (!up?.id) throw new ClientError("Error al subir modeloPDF a Drive", 500);
          newUploadedId = up.id;
          updateData.modeloPDF = newUploadedId;
        }
      } catch (err) {
        if (newUploadedId) await deleteFileById(newUploadedId).catch(() => {});
        throw err;
      }
    }
  }

  if (type === "jobs") updateData.public = req.body.public === "si";

  const updated = await Model.findByIdAndUpdate(id, updateData, { new: true });
  if (!updated) throw new ClientError("Elemento no encontrado", 404);

  response(res, 200, updated);
};

const deleteEnums = async (req, res) => {
  if (!req.body.id || !req.body.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  const { id, type } = req.body;
  const Model = getModelByType(type);

  let modeloPDF = null;

  if (type === "documentation") {
    const doc = await Model.findById(id).lean();
    if (!doc) throw new ClientError("No se encontró el documento para eliminar", 404);
    modeloPDF = doc.modeloPDF || null;
  }

  const result = await Model.deleteOne({ _id: id });
  if (result.deletedCount === 0) {
    throw new ClientError("No se encontró el documento para eliminar", 404);
  }

  if (modeloPDF) {
    await deleteFileById(modeloPDF).catch(() => {});
  }

  response(res, 200, result);
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
