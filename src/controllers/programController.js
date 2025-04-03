const { Program } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { validateRequiredFields } = require('../utils/utils');

const postCreateProgram = async (req, res) => {

  const { name, acronym, area, active, responsible, finantial, about } = req.body;

  if (!name || !acronym) throw new ClientError('Falta datos', 400);

  const newProgram = new Program({
    name,
    acronym,
    area: area || "no identificado",
    active: active == 'si' ? true : (active == 'no') ? false : true,
    responsible: Array.isArray(responsible) ? responsible.filter(id => mongoose.Types.ObjectId.isValid(id)) : [],
    finantial: Array.isArray(finantial) ? finantial.filter(id => mongoose.Types.ObjectId.isValid(id)) : [],
    about: {
      description: about?.description || "",
      objectives: about?.objectives || "",
      profile: about?.profile || "",
    }
  });

  const savedProgram = await newProgram.save();
  response(res, 200, savedProgram);

};

// Recoger todos los programas con paginación y filtros
// Recoger todos los programas
const getPrograms = async (req, res) => {
  const programs = await Program.find().populate('funding').populate('devices.responsible');
  response(res, 200, programs);
};

// Recoger programa por ID
const getProgramID = async (req, res) => {
  const id = req.body.id;  // Usando body en lugar de params
  const program = await Program.findById(id).populate('funding').populate('devices.responsible')
    .catch(error => { throw new ClientError('Programa no encontrado', 404) });
  response(res, 200, program);
};

// Eliminar programa por ID
const ProgramDeleteId = async (req, res) => {
  const id = req.body.id;
  const ProgramDelete = await Program.deleteOne({ _id: id });
  response(res, 200, ProgramDelete);
};


const ProgramPut = async (req, res) => {
  const { id, name, acronym, area, active, finantial, about, cronology, type, essentialDocumentationProgram, essentialDocumentationDevice } = req.body;
  let query = { _id: id };
  const updateObj = {};

  // Actualiza campos simples
  const update = {};
  if (name !== undefined) update.name = name;
  if (acronym !== undefined) update.acronym = acronym;
  if (area !== undefined) update.area = area;
  if (active === 'si') update.active = true;
  if (active === 'no') update.active = false;
  if (Array.isArray(finantial)) update.finantial = finantial.filter(i => mongoose.Types.ObjectId.isValid(i));
  if (about) {
    if (about.description !== undefined) update['about.description'] = about.description;
    if (about.objectives !== undefined) update['about.objectives'] = about.objectives;
    if (about.profile !== undefined) update['about.profile'] = about.profile;
  }
  if (Object.keys(update).length) updateObj.$set = update;

  // Procesa documentación (solo "add" o "delete")
  const processDoc = (field, doc) => {
    if (!type || !['add', 'delete'].includes(type))
      throw new ClientError('Falta el tipo o es inválido para documentación', 400);
    if (!mongoose.Types.ObjectId.isValid(doc))
      throw new ClientError('Documento inválido', 400);
    return type === 'add'
      ? { $addToSet: { [field]: doc } }
      : { $pull: { [field]: doc } };
  };


  if (essentialDocumentationProgram !== undefined)
    Object.assign(updateObj, processDoc('essentialDocumentationProgram', essentialDocumentationProgram));
  if (essentialDocumentationDevice !== undefined)
    Object.assign(updateObj, processDoc('essentialDocumentationDevice', essentialDocumentationDevice));

  // Procesa cronology (se permiten "add", "delete" y "edit")
  if (cronology !== undefined) {
    if (!type || !['add', 'delete', 'edit'].includes(type))
      throw new ClientError('Falta el tipo o es inválido para cronology', 400);
    if (type === 'add') {
      Object.assign(updateObj, { $addToSet: { cronology } });
    } else if (type === 'delete') {
      if (!cronology._id)
        throw new ClientError('Falta _id para eliminar cronology', 400);
      Object.assign(updateObj, { $pull: { cronology: { _id: cronology._id } } });
    } else if (type === 'edit') {
      if (!cronology._id)
        throw new ClientError('Falta _id para editar cronology', 400);
      Object.assign(updateObj, { $set: { "cronology.$": cronology } });
      query["cronology._id"] = cronology._id;
    }
  }

  const program = await Program.findOneAndUpdate(query, updateObj, { new: true });
  if (!program) return response(res, 400, { error: "No existe el programa" });
  response(res, 200, program);
};




// Añadir dispositivo a un programa existente
const addDispositive = async (req, res) => {
  const {
    name,
    active,
    address,
    email,
    phone,
    province,
    programId
  } = req.body;

  if (!programId) throw new ClientError('Falta el id del programa', 404);
  if (!name) throw new ClientError('Falta el nombre del dispositivo', 400);
  const program = await Program.findById(programId);
  if (!program) throw new ClientError('No existe el programa', 404);

  const newDevice = {
    name,
    active: active !== 'si' ? false : true,
    address: address || '',
    email: email || '',
    phone: phone || '',
    responsible: [],
    coordinators: [],
    province: mongoose.Types.ObjectId.isValid(province) ? province : null,
    files: []
  };

  program.devices.push(newDevice);
  const savedProgram = await program.save();
  response(res, 200, savedProgram);
};

// Obtener un dispositivo específico dentro de un programa
const getDispositive = async (req, res) => {
  const { programId, dispositiveId } = req.body;
  const program = await Program.findById(programId).populate('devices.responsible');
  if (!program) throw new ClientError('Programa no encontrado', 404);

  const dispositive = program.devices.id(dispositiveId);
  if (!dispositive) throw new ClientError('Dispositivo no encontrado', 404);

  response(res, 200, dispositive);
};

// Actualizar un dispositivo dentro de un programa
const updateDispositive = async (req, res) => {
  const { programId, dispositiveId, active, name, address, email, phone, province } = req.body;

  // Buscar el programa
  const program = await Program.findById(programId);
  if (!program) throw new ClientError('Programa no encontrado', 404);

  // Buscar el dispositivo dentro del programa
  const dispositive = program.devices.id(dispositiveId);
  if (!dispositive) throw new ClientError('Dispositivo no encontrado', 404);

  // Construir el objeto de actualización solo con los campos enviados
  const updateFields = {};
  if (active !== undefined) updateFields["devices.$.active"] = active;
  if (name !== undefined) updateFields["devices.$.name"] = name;
  if (address !== undefined) updateFields["devices.$.address"] = address;
  if (email !== undefined) updateFields["devices.$.email"] = email;
  if (phone !== undefined) updateFields["devices.$.phone"] = phone;
  if (province !== undefined) updateFields["devices.$.province"] = province;

  // Actualizar el dispositivo usando el operador $set en el array devices
  const updatedProgram = await Program.findOneAndUpdate(
    { _id: programId, "devices._id": dispositiveId },
    { $set: updateFields },
    { new: true }
  );

  if (!updatedProgram) throw new ClientError("No se pudo actualizar el dispositivo", 400);
  response(res, 200, updatedProgram);
};


// Eliminar un dispositivo de un programa
const deleteDispositive = async (req, res) => {
  const { programId, dispositiveId } = req.body;

  // Encuentra el programa
  const program = await Program.findById(programId);

  if (!program) {
    throw new ClientError("No existe el programa", 400);
  }

  // Actualiza el documento del programa eliminando el dispositivo específico
  const updatedProgram = await Program.findByIdAndUpdate(
    programId,
    { $pull: { devices: { _id: dispositiveId } } },
    { new: true } // Devuelve el documento actualizado
  );

  if (!updatedProgram) {
    throw new ClientError("No existe el dispositivo", 400);
  }

  response(res, 200, updatedProgram);
};


const getDispositiveResponsable = async (req, res) => {

  // Verificamos que el request tiene un _id en el body. Si no, lanzamos un error controlado.
  if (!req.body._id) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  // Convertimos el _id del usuario en un ObjectId de MongoDB para poder hacer la consulta.
  const userId = new mongoose.Types.ObjectId(req.body._id);

  // Ejecutamos una agregación en la colección Program para encontrar los programas en los que el usuario tiene un rol.
  const programs = await Program.aggregate([
    {
      // Filtramos los programas donde el usuario:
      // - Es responsable de algún dispositivo (devices.responsible)
      // - Es coordinador de algún dispositivo (devices.coordinators)
      // - Es responsable del programa (responsible)
      $match: {
        $or: [
          { "devices.responsible": userId },
          { "devices.coordinators": userId },
          { responsible: userId }
        ]
      }
    },
    {
      // Proyectamos solo los campos necesarios para la respuesta
      $project: {
        name: 1,      // Nombre del programa
        acronym: 1,   // Acrónimo del programa
        // Booleano que indica si este usuario es responsable del programa.
        isProgramResponsible: {
          $cond: {
            if: { $in: [userId, { $ifNull: ["$responsible", []] }] },
            then: true,
            else: false
          }
        },
        // Filtramos solo los dispositivos donde el usuario es responsable o coordinador
        // y añadimos en cada dispositivo dos campos booleanos:
        //   isDeviceResponsible   -> true si userId ∈ device.responsible
        //   isDeviceCoordinator  -> true si userId ∈ device.coordinators
        devices: {
          $map: {
            input: {
              $filter: {
                input: "$devices",
                as: "dev",
                cond: {
                  $or: [
                    { $in: [userId, { $ifNull: ["$$dev.responsible", []] }] },
                    { $in: [userId, { $ifNull: ["$$dev.coordinators", []] }] }
                  ]
                }
              }
            },
            as: "filteredDevice",
            in: {
              _id: "$$filteredDevice._id",
              name: "$$filteredDevice.name",
              isDeviceResponsible: {
                $in: [userId, { $ifNull: ["$$filteredDevice.responsible", []] }]
              },
              isDeviceCoordinator: {
                $in: [userId, { $ifNull: ["$$filteredDevice.coordinators", []] }]
              }
            }
          }
        }
      }
    }
  ]);

  // Mapeamos los datos obtenidos para estructurar la respuesta final
  const result = programs.flatMap(program =>
    (program.devices.length > 0 ? program.devices : [{}]).map(device => ({
      idProgram: program._id,                  // ID del programa
      programName: program.name,               // Nombre del programa
      programAcronym: program.acronym,         // Acrónimo del programa
      isProgramResponsible: program.isProgramResponsible,  // Booleano
      dispositiveName: device.name || null,    // Nombre del dispositivo (si existe)
      dispositiveId: device._id || null,       // ID del dispositivo (si existe)
      isDeviceResponsible: device.isDeviceResponsible || false,
      isDeviceCoordinator: device.isDeviceCoordinator || false
    }))
  );

  // // Enviamos la respuesta al cliente con código 200 y los datos procesados
  response(res, 200, result);

};




const handleCoordinators = async (req, res) => {

  const { action, deviceId, programId, coordinators = [], coordinatorId } = req.body;

  // Validaciones mínimas
  if (!action || !deviceId || !programId) {
    throw new Error("Faltan datos: 'action', 'programId' o 'deviceId'.");
  }

  let updatedProgram = null;
  let deviceFound = null;

  switch (action) {

    /**
     * LISTAR coordinadores
     */
    case "list": {
      const program = await Program.findOne(
        { _id: programId, "devices._id": deviceId },
        { "devices.$": 1 } // Proyectar solo el subdocumento que coincida
      ).lean();


      if (!program || !program.devices || program.devices.length === 0) {
        throw new Error("No se encontró el dispositivo en el programa.");
      }

      // El device está en program.devices[0]
      deviceFound = program.devices[0];

      return response(res, 200,
        deviceFound.coordinators
      );
    }

    /**
     * AÑADIR coordinadores
     */
    case "add": {
      const newCoordinators = Array.isArray(coordinators) ? coordinators : [coordinators];

      updatedProgram = await Program.findOneAndUpdate(
        { _id: programId, "devices._id": deviceId },
        {
          $addToSet: {
            "devices.$.coordinators": { $each: newCoordinators }
          }
        },
        { new: true }
      );


      if (!updatedProgram) {
        throw new Error("No se encontró el programa o el dispositivo para añadir coordinadores.");
      }


      return response(res, 200, updatedProgram);
    }

    /**
     * ACTUALIZAR (reemplazar) la lista completa de coordinadores
     */
    case "update": {
      const updatedCoordinators = Array.isArray(coordinators) ? coordinators : [coordinators];

      updatedProgram = await Program.findOneAndUpdate(
        { _id: programId, "devices._id": deviceId },
        {
          $set: {
            "devices.$.coordinators": updatedCoordinators
          }
        },
        { new: true }
      );


      if (!updatedProgram) {
        throw new Error("No se encontró el programa o el dispositivo para actualizar.");
      }


      return response(res, 200, updatedProgram);
    }

    /**
     * ELIMINAR un coordinador específico
     */
    case "remove": {
      if (!coordinatorId) {
        throw new Error("Falta 'coordinatorId' para eliminar el coordinador.");
      }

      updatedProgram = await Program.findOneAndUpdate(
        { _id: programId, "devices._id": deviceId },
        {
          $pull: {
            "devices.$.coordinators": coordinatorId
          }
        },
        { new: true }
      );

      if (!updatedProgram) {
        throw new Error("No se encontró el programa o el dispositivo para eliminar el coordinador.");
      }


      return response(res, 200, updatedProgram);
    }

    /**
     * ACCIÓN NO RECONOCIDA
     */
    default: {
      throw new Error(`La acción '${action}' no está soportada.`);
    }
  }
};

// Controlador que gestiona responsables tanto de un PROGRAM como de un DEVICE.
// Asume que en tu esquema "programSchema", "responsible" es [ObjectId] a nivel de programa
// y "devices.responsible" es [ObjectId] a nivel de dispositivo.
const handleResponsibles = async (req, res) => {
  const { type, action, programId, deviceId, responsible = [], responsibleId } = req.body;

  if (!type || !action || !programId)
    throw new ClientError("Faltan 'type', 'action' o 'programId'.", 400);
  if (type === "device" && !deviceId)
    throw new ClientError("Falta 'deviceId' para gestionar responsables de dispositivo.", 400);

  let updatedProgram, foundProgram, dataToReturn;

  if (type === "program") {
    switch (action) {
      case "list":
        foundProgram = await Program.findById(programId);
        if (!foundProgram) throw new ClientError("No se encontró el programa.", 400);
        dataToReturn = foundProgram;
        break;
      case "add": {
        const newResponsibles = Array.isArray(responsible) ? responsible : [responsible];
        updatedProgram = await Program.findByIdAndUpdate(
          programId,
          { $addToSet: { responsible: { $each: newResponsibles } } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa para añadir responsables.", 400);
        dataToReturn = updatedProgram;
        break;
      }
      case "update": {
        const updatedResponsibles = Array.isArray(responsible) ? responsible : [responsible];
        updatedProgram = await Program.findByIdAndUpdate(
          programId,
          { $set: { responsible: updatedResponsibles } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa para actualizar.", 400);
        dataToReturn = updatedProgram;
        break;
      }
      case "remove":
        if (!responsibleId)
          throw new ClientError("Falta 'responsibleId' para eliminar el responsable.", 400);
        updatedProgram = await Program.findByIdAndUpdate(
          programId,
          { $pull: { responsible: responsibleId } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa para eliminar el responsable.", 400);
        dataToReturn = updatedProgram;
        break;
      default:
        throw new ClientError(`Acción '${action}' no soportada para 'program'.`, 400);
    }
  } else if (type === "device") {
    switch (action) {
      case "list":
        // Buscamos el programa que contenga el dispositivo y retornamos el programa completo
        foundProgram = await Program.findOne({ _id: programId, "devices._id": deviceId });
        if (!foundProgram)
          throw new ClientError("No se encontró el programa.", 400);
        dataToReturn = foundProgram;
        break;
      case "add": {
        const newRespsDevice = Array.isArray(responsible) ? responsible : [responsible];
        updatedProgram = await Program.findOneAndUpdate(
          { _id: programId, "devices._id": deviceId },
          { $set: { "devices.$.responsible": newRespsDevice } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa/dispositivo para añadir responsables.", 400);
        dataToReturn = updatedProgram;
        break;
      }
      case "update": {
        const updatedRespsDevice = Array.isArray(responsible) ? responsible : [responsible];
        updatedProgram = await Program.findOneAndUpdate(
          { _id: programId, "devices._id": deviceId },
          { $set: { "devices.$.responsible": updatedRespsDevice } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa/dispositivo para actualizar.", 400);
        dataToReturn = updatedProgram;
        break;
      }
      case "remove":
        if (!responsibleId)
          throw new ClientError("Falta 'responsibleId' para eliminar el responsable.", 400);
        updatedProgram = await Program.findOneAndUpdate(
          { _id: programId, "devices._id": deviceId },
          { $pull: { "devices.$.responsible": responsibleId } },
          { new: true }
        );
        if (!updatedProgram)
          throw new ClientError("No se encontró el programa/dispositivo para eliminar el responsable.", 400);
        dataToReturn = updatedProgram;
        break;
      default:
        throw new ClientError(`Acción '${action}' no soportada para 'device'.`, 400);
    }
  } else {
    throw new ClientError(`Tipo '${type}' no soportado (debe ser 'program' o 'device').`, 400);
  }

  return response(res, 200, dataToReturn);
};










module.exports = {
  postCreateProgram: catchAsync(postCreateProgram),
  getPrograms: catchAsync(getPrograms),
  getProgramID: catchAsync(getProgramID),
  ProgramDeleteId: catchAsync(ProgramDeleteId),
  ProgramPut: catchAsync(ProgramPut),
  addDispositive: catchAsync(addDispositive),
  getDispositive: catchAsync(getDispositive),
  updateDispositive: catchAsync(updateDispositive),
  deleteDispositive: catchAsync(deleteDispositive),
  getDispositiveResponsable: catchAsync(getDispositiveResponsable),
  handleCoordinators: catchAsync(handleCoordinators),
  handleResponsibles: catchAsync(handleResponsibles),

};
