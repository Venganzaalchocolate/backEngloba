const {
  Jobs,
  Studies,
  Provinces,
  Work_schedule,
  Finantial,
  Offer,
  Program,
  User,
  Leavetype,
  Documentation,
  Filedrive,
  Dispositive,
  Entity,
  PeriodEndReason,
} = require("../models/indexModels");
const leavetype = require("../models/leavetype");
const { default: cache } = require("../utils/cache");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const mongoose = require("mongoose");

/* -------------------------------
   Helpers para construir índices
---------------------------------*/

const { uploadFileToDrive, updateFileInDrive, deleteFileById } = require("./googleController");



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

//PRL
const JOB_POSITION_DOCUMENTATION_TEMPLATES = [
  {
    key: "prl-info",
    prefix: "Información PRL",
    categoryFiles: "PRL",
    model: "User",
    date: false,
    requiresSignature: true,
  },
];

const buildJobPositionDocumentationName = (template, positionName) =>
  `${template.prefix} - ${String(positionName || "").trim()}`;

const ensureJobPositionDocumentation = async (positionId, positionName) => {
  if (!positionId || !positionName) return [];

  const cleanName = String(positionName).trim();
  if (!cleanName) return [];

  const results = [];

  for (const template of JOB_POSITION_DOCUMENTATION_TEMPLATES) {
    const filter = {
      model: template.model || "User",
      categoryFiles: template.categoryFiles,
      "jobScope.positions": positionId,
      "jobScope.autoKey": template.key,
    };

    const existing = await Documentation.findOne(filter).lean();

    if (existing) {
      results.push({
        status: "exists",
        positionId,
        positionName: cleanName,
        autoKey: template.key,
        documentationId: existing._id,
      });
      continue;
    }

    const doc = await Documentation.create({
      name: buildJobPositionDocumentationName(template, cleanName),
      model: template.model || "User",
      visible: true,
      date: !!template.date,
      duration: template.date ? template.duration : undefined,
      requiresSignature: !!template.requiresSignature,
      categoryFiles: template.categoryFiles,
      jobScope: {
        positions: [positionId],
        autoKey: template.key,
      },
    });

    results.push({
      status: "created",
      positionId,
      positionName: cleanName,
      autoKey: template.key,
      documentationId: doc._id,
    });
  }

  cache.del?.("enums");
  return results;
};

const updateJobPositionDocumentationName = async (positionId, positionName) => {
  if (!positionId || !positionName) return [];

  const cleanName = String(positionName).trim();
  if (!cleanName) return [];

  const results = [];

  for (const template of JOB_POSITION_DOCUMENTATION_TEMPLATES) {
    const result = await Documentation.updateMany(
      {
        model: template.model || "User",
        categoryFiles: template.categoryFiles,
        "jobScope.positions": positionId,
        "jobScope.autoKey": template.key,
      },
      {
        $set: {
          name: buildJobPositionDocumentationName(template, cleanName),
        },
      }
    );

    results.push({
      autoKey: template.key,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    });
  }

  cache.del?.("enums");
  return results;
};

// FIN PRL

const resolveModelsFolderId = () => {
  return process.env.GOOGLE_DRIVE_FILES || null;
};

function createSimpleIndex(list = []) {
  const out = {};

  for (const item of list) {
    out[String(item._id)] = {
      _id: item._id,
      name: item.name || "",
      description: item.description || "",
      active: item.active,
    };
  }

  return out;
}

// utils de índice
function createCategoryAndSubcategoryIndex(list = []) {
  const out = {};
  for (const p of list) {
    const pid = String(p._id);
    out[pid] = {
      name: p.name || "",
      isRoot: true,
    };
    if (typeof p.public === "boolean") out[pid].public = p.public;

    for (const sc of p.subcategories || []) {
      const sid = String(sc._id);
      out[sid] = {
        name: sc.name || "",
        parent: p._id,
        isSub: true,
      };
      if (typeof sc.public === "boolean") out[sid].public = sc.public;
    }
  }
  return out;
}

function createProgramIndex(programs = []) {
  const byProgram = new Map();
 
  for (const p of programs) {
    byProgram.set(String(p._id), {
      _id: p._id,
      name: p.name || "",
      acronym: p.acronym || "",
      type: "program",
      active: p.active,
      entity: p.entity,
      area:p.area
    });
  }

  const out = {};
  for (const [k, v] of byProgram.entries()) out[k] = v;
  return out;
}

function createDispositiveIndex(dispositives = []) {
  const out = {};

  for (const d of dispositives) {
    out[String(d._id)] = {
      _id: d._id,
      name: d.name || "",
      program: d.program ? String(d.program) : null,
      province: d.province ? String(d.province) : null,
      type: "dispositive",
      active: d.active,
      officeIdSesame: d.officeIdSesame ? String(d.officeIdSesame) : null,
      departamentSesame: d.departamentSesame ? String(d.departamentSesame) : null,
       coordinates: {
        lat: typeof d.coordinates?.lat === "number" ? d.coordinates.lat : null,
        lng: typeof d.coordinates?.lng === "number" ? d.coordinates.lng : null,
      },
      serviceType: {
        residencial: Boolean(d.serviceType?.residencial),
        capacity: Number.isFinite(Number(d.serviceType?.capacity))
          ? Number(d.serviceType.capacity)
          : 0,
      },

      workplaces: Array.isArray(d.workplaces)
        ? d.workplaces.map((workplace) => ({
            _id: workplace?._id ? String(workplace._id) : null,
            name: workplace?.name || "",
            active: workplace?.active !== false,
            officeIdSesame: workplace?.officeIdSesame ? String(workplace.officeIdSesame) : null,
          }))
        : [],
    };
  }

  return out;
}

// PRL
const getJobSubcategoryItemsForPrl = (jobs = []) => {
  const items = [];

  for (const job of jobs) {
    for (const sub of job.subcategories || []) {
      if (sub?._id && sub?.name) {
        items.push({
          _id: sub._id,
          name: sub.name,
          parent: job._id,
          parentName: job.name || "",
        });
      }
    }
  }

  return items;
};



const getEnums = async (req, res) => {
  const cached = cache.get("enums");
  if (cached) return response(res, 200, cached);

const [jobs, provinces, work_schedule, studies, finantial, programs, dispositives, entity] =
  await Promise.all([
    Jobs.find().lean(),
    Provinces.find().lean(),
    Work_schedule.find().lean(),
    Studies.find().lean(),
    Finantial.find().lean(),
    Program.find({ active: true }, { name: 1, acronym: 1, entity:1 }).lean(),
    Dispositive.find({}, { name: 1, program: 1, province: 1, active: 1, departamentSesame: 1, workplaces: 1, serviceType:1 })
  .populate("workplaces", "_id name active officeIdSesame address")
  .lean(),
    Entity.find().lean(),
  ]);

  const jobsIndex = createCategoryAndSubcategoryIndex(jobs);
  const provincesIndex = createCategoryAndSubcategoryIndex(provinces);
  const studiesIndex = createCategoryAndSubcategoryIndex(studies);
  const dispositiveIndex = createDispositiveIndex(dispositives);


  if (!jobs || !provinces || !work_schedule || !studies || !finantial || !entity) {
    throw new ClientError("No se han podido cargar todos los enums", 500);
  }

  const enumValues = {
    jobs,
    provinces,
    work_schedule,
    studies,
    finantial,
    programs,
    entity,
    jobsIndex,
    provincesIndex,
    studiesIndex,
    dispositiveIndex,

  };

  cache.set("enums", enumValues);
  response(res, 200, enumValues);
};

/* --------------------------------
   Handler principal (sin caché)
----------------------------------*/
const getEnumEmployers = async (req, res) => {
  const status = User.schema.path("employmentStatus")?.enumValues || [];

  const [
    workSchedule,
    offers,
    jobs,
    provinces,
    leaveTypes,
    programs,
    studies,
    finantial,
    documentation,
    dispositives,
    docCats,
    fileCats,
    entity,
    periodEndReasons,
  ] = await Promise.all([
    Work_schedule.find({}).lean(),
    Offer.find({ active: true }).lean(),
    Jobs.find({}, { name: 1, subcategories: 1 }).lean(),
    Provinces.find({}, { name: 1, subcategories: 1 }).lean(),
    Leavetype.find({}, { name: 1 }).lean(),
    Program.find({}, { name: 1, acronym: 1, active: 1, entity:1, area:1 }).lean(),
    Studies.find({}, { name: 1, subcategories: 1 }).lean(),
    Finantial.find({}).lean(),
    Documentation.find({}).lean(),
    Dispositive.find({}, { name: 1, program: 1, province: 1, active: 1, departamentSesame: 1, workplaces: 1, serviceType:1 })
  .populate("workplaces", "_id name active officeIdSesame address")
  .lean(),
    Documentation.distinct("categoryFiles").catch(() => []),
    Filedrive.schema.path("category").enumValues,
    Entity.find({}, { name: 1 }).lean(),
    PeriodEndReason.find({}, { name: 1, description: 1, active: 1 }).lean()
  ]);

  const jobsIndex = createCategoryAndSubcategoryIndex(jobs);
  const provincesIndex = createCategoryAndSubcategoryIndex(provinces);
  const leavesIndex = createCategoryAndSubcategoryIndex(leaveTypes);
  const programsIndex = createProgramIndex(programs);
  const dispositiveIndex = createDispositiveIndex(dispositives);
  const studiesIndex = createCategoryAndSubcategoryIndex(studies);
  const entityIndex=createCategoryAndSubcategoryIndex(entity);
  const periodEndReasonsIndex = createSimpleIndex(periodEndReasons);

  const categoryFiles = Array.from(
    new Set([...(docCats || []), ...(fileCats || [])].filter(Boolean))
  ).sort();


  response(res, 200, {
    status,
    work_schedule: workSchedule,
    offers,
    jobsIndex,
    provincesIndex,
    dispositiveIndex,
    leavesIndex,
    programsIndex,
    studiesIndex,
    finantial,
    documentation,
    categoryFiles,
    entity,
    entityIndex,
    periodEndReasonsIndex,
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
  entity: Entity,
  periodEndReason: PeriodEndReason,
};

// Función auxiliar para obtener el modelo según el tipo
const getModelByType = (type) => {
  const Model = validTypes[type];
  if (!Model) throw new ClientError("Tipo no válido", 400);
  return Model;
};

// POST Subcategoría: Agrega una subcategoría a un documento existente
const postSubcategory = async (req, res) => {
  if (!req.body.id || !req.body.name || !req.body.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  const Model = getModelByType(req.body.type);

  const subData = {
    _id: new mongoose.Types.ObjectId(),
    name: req.body.name,
  };

  if (req.body.type === "jobs") {
    subData.public = req.body.public === "si";
  }

  const updatedEnum = await Model.findOneAndUpdate(
    { _id: req.body.id },
    { $push: { subcategories: subData } },
    { new: true }
  );

  if (!updatedEnum) {
    throw new ClientError("Elemento no encontrado", 404);
  }

  if (req.body.type === "jobs") {
    await ensureJobPositionDocumentation(subData._id, subData.name);
  }

  response(res, 200, updatedEnum);
};

// DELETE Subcategoría: Eliminar una subcategoría de un documento existente
const deleteSubcategory = async (req, res) => {
  if (!req.body.id || !req.body.idCategory || !req.body.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }

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

if (type === "periodEndReason") {
  newData.description = req.body.description || "";
  newData.active = req.body.active !== false;
}

const savedEnum = await new Model(newData).save();

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
    "entity",
    "periodEndReason",
  ];


  if (!req.body.id || !req.body.name || !req.body.type) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  if (!allowedTypes.includes(req.body.type)) {
    throw new ClientError("El tipo no es correcto", 400);
  }

  const { id, type, subId } = req.body;
  const Model = getModelByType(type);

  if (subId) {
    if (type === "documentation") {
      throw new ClientError("Documentation no tiene subcategorías", 400);
    }

    const updateData = {
      "subcategories.$[elem].name": req.body.name,
    };

    if (type === "jobs") {
      updateData["subcategories.$[elem].public"] = req.body.public === "si";
    }

    const updatedEnum = await Model.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      {
        new: true,
        arrayFilters: [{ "elem._id": subId }],
      }
    );

    if (!updatedEnum) {
      throw new ClientError("Elemento no encontrado", 404);
    }

    if (type === "jobs") {
      await ensureJobPositionDocumentation(subId, req.body.name);
      await updateJobPositionDocumentationName(subId, req.body.name);
    }

    return response(res, 200, updatedEnum);
  }

  const updateData = {
    name: req.body.name,
  };

  if (type === "documentation") {
    if (!req.body.model) {
      throw new ClientError("El campo model es obligatorio para documentation", 400);
    }

    updateData.model = req.body.model;
    updateData.date = parseSiNo(req.body.date);
    updateData.requiresSignature = parseSiNo(req.body.requiresSignature);

    if (req.body.categoryFiles) {
      updateData.categoryFiles = req.body.categoryFiles;
    }

    if (updateData.date) {
      if (!req.body.duration) {
        throw new ClientError(
          "El campo duración (en días) es obligatorio si el documento tiene fecha",
          400
        );
      }

      updateData.duration = Number(req.body.duration);
    } else {
      updateData.duration = undefined;
    }

    if (req.file) {
      const folderId = resolveModelsFolderId();

      if (!folderId) {
        throw new ClientError("Falta GOOGLE_DRIVE_FILES para subir el modeloPDF", 500);
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

          if (!up?.id) {
            throw new ClientError("Error al subir modeloPDF a Drive", 500);
          }

          newUploadedId = up.id;
          updateData.modeloPDF = newUploadedId;
        }
      } catch (err) {
        if (newUploadedId) {
          await deleteFileById(newUploadedId).catch(() => {});
        }

        throw err;
      }
    }
  }

  if (type === "jobs") {
    updateData.public = req.body.public === "si";
  }

  if (type === "periodEndReason") {
    updateData.description = req.body.description || "";
    updateData.active = req.body.active !== false;
  }

  const updated = await Model.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  if (!updated) {
    throw new ClientError("Elemento no encontrado", 404);
  }

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

const deleteFileEnums = async (req, res) => {
  if (!req.body.modeloPDF || !req.body.id) {
    throw new ClientError("Faltan datos", 400);
  }

  const infoDelete = await deleteFileById(req.body.modeloPDF);

  if (infoDelete.success) {
    const data = await Documentation.updateOne(
      { _id: req.body.id },
      { $unset: { modeloPDF: 1 } },
      { new: true }
    );
    response(res, 200, data);
  } else {
    response(res, 200, infoDelete);
  }
};

const getProgramsAndDispositiveEnums = async (req, res) => {
  const [programs, dispositives, provinces] = await Promise.all([
    Program.find({}, { name: 1, acronym: 1, active: 1, entity: 1, area: 1 }).lean(),
    Dispositive.find({}, { name: 1, program: 1, province: 1, active: 1, departamentSesame: 1, workplaces: 1, coordinates: 1, serviceType:1 })
  .populate("workplaces", "_id name active officeIdSesame address")
  .lean(),
    Provinces.find({}, { name: 1, subcategories: 1 }).lean(),
  ]);

  response(res, 200, {
    programsIndex: createProgramIndex(programs),
    dispositiveIndex: createDispositiveIndex(dispositives),
    provincesIndex: createCategoryAndSubcategoryIndex(provinces),
  });
};




module.exports = {
  getEnums: catchAsync(getEnums),
  putEnums: catchAsync(putEnums),
  postEnums: catchAsync(postEnums),
  deleteEnums: catchAsync(deleteEnums),
  postSubcategory: catchAsync(postSubcategory),
  deleteSubcategory: catchAsync(deleteSubcategory),
  getEnumEmployers: catchAsync(getEnumEmployers),
  deleteFileEnums: catchAsync(deleteFileEnums),
  getProgramsAndDispositiveEnums:catchAsync(getProgramsAndDispositiveEnums)
};