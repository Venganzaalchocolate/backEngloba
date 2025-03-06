
const { Jobs, Studies, Provinces, Work_schedule, Finantial, Offer, Program, User, Leavetype, Documentation, File } = require('../models/indexModels');
const leavetype = require('../models/leavetype');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

// Función para crear índice de leaveTypes
const createCategoriesIndex = (x) => {
    const index = {};
    x.forEach(x => {
        // Crear un diccionario donde la clave es el ID y el valor es el leaveType completo
        index[x._id.toString()] = x;
    });
    return index;
};

// Función para crear índice de subcategorías de trabajos //jobs
const createSubcategoriesIndex = (x) => {
    const index = {};
    x.forEach(x => {
        // Crear un diccionario donde la clave es el ID de la subcategoría y el valor es la subcategoría completa
        x.subcategories?.forEach(sub => {
            index[sub._id.toString()] = sub;
        });
    });
    return index;
};


// crea un índice que tiene entradas tanto para programs como para devices
const createProgramDevicesIndex = (programs) => {
    const index = {};

    programs.forEach(program => {
        // Primero, creamos un registro donde la clave es el "programId"
        index[program._id.toString()] = {
            _id: program._id.toString(),
            type: "program",
            name: program.name,
            responsible: program.responsible, // responsables del PROGRAMA
            devicesIds: program.devices.map(d => d._id.toString()) // para saber qué devices pertenecen
            // ... más campos si deseas
        };

        // Luego, creamos registros para cada device
        if (Array.isArray(program.devices)) {
            program.devices.forEach(device => {
                index[device._id.toString()] = {
                    _id: device._id.toString(),
                    type: "device",
                    name: device.name,
                    responsible: device.responsible,
                    coordinators: device.coordinators,
                    programId: program._id.toString()
                    // ... más campos si necesitas
                };
            });
        }
    });
    return index;
};

const getEnums = async (req, res) => {
    let enumValues = {}
    enumValues['jobs'] = await Jobs.find();
    enumValues['provinces'] = await Provinces.find();
    enumValues['work_schedule'] = await Work_schedule.find();
    enumValues['studies'] = await Studies.find();
    enumValues['finantial'] = await Finantial.find();

    if (enumValues.jobs == undefined) throw new ClientError('Error al solicitar los enums de los trabajos', 500)
    if (enumValues.provinces == undefined) throw new ClientError('Error al solicitar los enums de las provincias ', 500)
    if (enumValues.work_schedule == undefined) throw new ClientError('Error al solicitar los enums de los horarios', 500)
    if (enumValues.studies == undefined) throw new ClientError('Error al solicitar los enums de los estudios', 500)
    if (enumValues.finantial == undefined) throw new ClientError('Error al solicitar los enums de las financiaciones', 500)
    response(res, 200, enumValues);
}

const getEnumEmployers = async (req, res) => {
  try {
      // Ejecutar todas las consultas en paralelo con Promise.all para mejorar el rendimiento
      const [
          provinces,
          programs,
          leavetype,
          jobs,
          studies,
          workSchedule,
          offers,
          finantial,
          documentation
      ] = await Promise.all([
          Provinces.find().lean(),
          Program.find().populate('files').lean(),
          Leavetype.find().lean(),
          Jobs.find().lean(),
          Studies.find().lean(),
          Work_schedule.find().lean(),
          Offer.find({ active: true }).lean(),
          Finantial.find().lean(),
          Documentation.find().lean()
      ]);

      // Construimos el objeto de respuesta
      let enumValues = {
          provinces,
          programs,
          status: User.schema.path('employmentStatus').enumValues,  // Esto no necesita await
          leavetype,
          jobs,
          studies,
          work_schedule: workSchedule,
          offers,
          jobsIndex: createSubcategoriesIndex(jobs),
          leavesIndex: createCategoriesIndex(leavetype),
          programsIndex: createProgramDevicesIndex(programs),
          finantial,
          documentation
      };

      // Verificar que los valores críticos no sean undefined o vacíos
      if (!programs || !provinces) {
          throw new ClientError('Error al solicitar los enums', 500);
      }

      // Responder con los datos obtenidos
      response(res, 200, enumValues);

  } catch (error) {
      console.error("Error en getEnumEmployers:", error);
      response(res, error.statusCode || 500, {
          message: error.message || 'Error interno del servidor',
      });
  }
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

  // Para todos los tipos salvo documentation, se permite actualizar subcategorías
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

  // Actualizar el documento principal
  const updateData = { name: req.body.name };
  if (req.body.type === 'documentation') {
    // Se requiere el campo label en documentation
    if (!req.body.label)
      throw new ClientError("El campo label es obligatorio para documentation", 400);
    updateData.label = req.body.label;
    updateData.date = req.body.date === 'si';
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

// POST: Crear un nuevo documento
const postEnums = async (req, res) => {
  if (!req.body.name || !req.body.type)
    throw new ClientError("Los datos no son correctos", 400);

  const { name, date, type, public: pub, label } = req.body;
  const Model = getModelByType(type);

  const newData = { name };
  if (type === 'documentation') {
    // Se requiere el campo label al crear documentation
    if (!label)
      throw new ClientError("El campo label es obligatorio para documentation", 400);
    newData.label = label;
    newData.date = date === 'si';
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
