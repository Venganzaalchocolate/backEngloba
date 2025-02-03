const { Program } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');

// Crear programa con dispositivos
const postCreateProgram = async (req, res) => {
    if (!req.body.funding || !req.body.name || !req.body.acronym) {
        throw new ClientError("Los datos no son correctos", 400);
    }

    const dataProgram = {
        funding: req.body.funding,
        name: req.body.name,
        acronym: req.body.acronym,
        devices: req.body.devices || []
    };

    const newProgram = new Program(dataProgram);
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

// Modificar programa
const ProgramPut = async (req, res) => {
    const filter = { _id: req.body._id };
    const updateText = {};
    if (!!req.body.name) updateText['name'] = req.body.name;
    if (!!req.body.acronym) updateText['acronym'] = req.body.acronym;
    if (!!req.body.funding) updateText['funding'] = req.body.funding;

    let doc = await Program.findOneAndUpdate(filter, updateText, { new: true });
    if (doc == null) throw new ClientError("No existe el programa", 400);
    response(res, 200, doc);
};

// Añadir dispositivo a un programa existente
const addDispositive = async (req, res) => {
    const filter = { _id: req.body._id };

    const newDevice = {
        name: req.body.name,
        address: req.body.address,
        responsible: req.body.responsible || [], // Optional
        contratoAdministracion: req.body.contratoAdministracion || [],
        autorizacionFuncionamiento: req.body.autorizacionFuncionamiento || [],
        seguros: req.body.seguros || [],
        libroQuejasSugerencias: req.body.libroQuejasSugerencias || [],
        libroFoliadoRegistroUsuarios: req.body.libroFoliadoRegistroUsuarios || [],
        constanciaProyectoEducativo: req.body.constanciaProyectoEducativo || [],
        constanciaCurriculumEducativo: req.body.constanciaCurriculumEducativo || [],
        constanciaReglamentoOrganizacion: req.body.constanciaReglamentoOrganizacion || [],
        constanciaMemoriaAnual: req.body.constanciaMemoriaAnual || [],
        constanciaProgramacionAnual: req.body.constanciaProgramacionAnual || [],
        planAutoproteccion: req.body.planAutoproteccion || [],
        certificadoImplantacionPlanAutoproteccion: req.body.certificadoImplantacionPlanAutoproteccion || [],
        revisionExtintores: req.body.revisionExtintores || [],
        revisionesBIE: req.body.revisionesBIE || [],
        certificadoRevisionCalderas: req.body.certificadoRevisionCalderas || [],
        certificadoRevisionElectricidad: req.body.certificadoRevisionElectricidad || [],
        simulacroEvacuacion: req.body.simulacroEvacuacion || [],
        actaIdentificacionFunciones: req.body.actaIdentificacionFunciones || [],
        puntosEmergenciaOperativos: req.body.puntosEmergenciaOperativos || [],
        senalizacionEvacuacion: req.body.senalizacionEvacuacion || [],
        senalizacionAscensoresEmergencia: req.body.senalizacionAscensoresEmergencia || [],
        menuVisadoNutricionista: req.body.menuVisadoNutricionista || [],
        contratoCatering: req.body.contratoCatering || [],
        planHigiene: req.body.planHigiene || [],
        planLegionela: req.body.planLegionela || [],
        contratoDDD: req.body.contratoDDD || [],
        firmaProtocoloAcoso: req.body.firmaProtocoloAcoso || []
    };

    const updateProgram = {
        '$push': { devices: newDevice }
    };

    let doc = await Program.findOneAndUpdate(filter, updateProgram, { new: true });
    if (doc == null) throw new ClientError("No existe el programa", 400);
    response(res, 200, doc);
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
    const { programId, dispositiveId } = req.body;
    const program = await Program.findById(programId);
    if (!program) throw new ClientError('Programa no encontrado', 404);

    const dispositive = program.devices.id(dispositiveId);
    if (!dispositive) throw new ClientError('Dispositivo no encontrado', 404);

    // Actualizar los campos del dispositivo
    const updateText = {
        name: req.body.name || dispositive.name,
        address: req.body.address || dispositive.address,
        responsible: (req.body.responsible && req.body.responsible != 'delete') ? req.body.responsible : (req.body.responsible && req.body.responsible == 'delete') ? null : dispositive.responsible,
        contratoAdministracion: req.body.contratoAdministracion || dispositive.contratoAdministracion,
        autorizacionFuncionamiento: req.body.autorizacionFuncionamiento || dispositive.autorizacionFuncionamiento,
        seguros: req.body.seguros || dispositive.seguros,
        libroQuejasSugerencias: req.body.libroQuejasSugerencias || dispositive.libroQuejasSugerencias,
        libroFoliadoRegistroUsuarios: req.body.libroFoliadoRegistroUsuarios || dispositive.libroFoliadoRegistroUsuarios,
        constanciaProyectoEducativo: req.body.constanciaProyectoEducativo || dispositive.constanciaProyectoEducativo,
        constanciaCurriculumEducativo: req.body.constanciaCurriculumEducativo || dispositive.constanciaCurriculumEducativo,
        constanciaReglamentoOrganizacion: req.body.constanciaReglamentoOrganizacion || dispositive.constanciaReglamentoOrganizacion,
        constanciaMemoriaAnual: req.body.constanciaMemoriaAnual || dispositive.constanciaMemoriaAnual,
        constanciaProgramacionAnual: req.body.constanciaProgramacionAnual || dispositive.constanciaProgramacionAnual,
        planAutoproteccion: req.body.planAutoproteccion || dispositive.planAutoproteccion,
        certificadoImplantacionPlanAutoproteccion: req.body.certificadoImplantacionPlanAutoproteccion || dispositive.certificadoImplantacionPlanAutoproteccion,
        revisionExtintores: req.body.revisionExtintores || dispositive.revisionExtintores,
        revisionesBIE: req.body.revisionesBIE || dispositive.revisionesBIE,
        certificadoRevisionCalderas: req.body.certificadoRevisionCalderas || dispositive.certificadoRevisionCalderas,
        certificadoRevisionElectricidad: req.body.certificadoRevisionElectricidad || dispositive.certificadoRevisionElectricidad,
        simulacroEvacuacion: req.body.simulacroEvacuacion || dispositive.simulacroEvacuacion,
        actaIdentificacionFunciones: req.body.actaIdentificacionFunciones || dispositive.actaIdentificacionFunciones,
        puntosEmergenciaOperativos: req.body.puntosEmergenciaOperativos || dispositive.puntosEmergenciaOperativos,
        senalizacionEvacuacion: req.body.senalizacionEvacuacion || dispositive.senalizacionEvacuacion,
        senalizacionAscensoresEmergencia: req.body.senalizacionAscensoresEmergencia || dispositive.senalizacionAscensoresEmergencia,
        menuVisadoNutricionista: req.body.menuVisadoNutricionista || dispositive.menuVisadoNutricionista,
        contratoCatering: req.body.contratoCatering || dispositive.contratoCatering,
        planHigiene: req.body.planHigiene || dispositive.planHigiene,
        planLegionela: req.body.planLegionela || dispositive.planLegionela,
        contratoDDD: req.body.contratoDDD || dispositive.contratoDDD,
        firmaProtocoloAcoso: req.body.firmaProtocoloAcoso || dispositive.firmaProtocoloAcoso
    };

    let doc = await Program.findOneAndUpdate(
        { _id: programId, "devices._id": dispositiveId },
        { $set: { "devices.$": updateText } },
        { new: true }
    );

    if (doc == null) throw new ClientError("No existe el dispositivo", 400);
    response(res, 200, doc);
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
  
    // Enviamos la respuesta al cliente con código 200 y los datos procesados
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
  
        deviceFound = updatedProgram.devices.find(
          (dev) => dev._id.toString() === deviceId
        );
  
        return response(res, 200, deviceFound);
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
  
        deviceFound = updatedProgram.devices.find(
          (dev) => dev._id.toString() === deviceId
        );
  
        return response(res, 200, deviceFound);
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
  
        deviceFound = updatedProgram.devices.find(
          (dev) => dev._id.toString() === deviceId
        );
  
        return response(res, 200, deviceFound);
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
  if (!type || !action || !programId) throw new Error("Faltan 'type', 'action' o 'programId'.");
  if (type === "device" && !deviceId) throw new Error("Falta 'deviceId' para gestionar responsables de dispositivo.");

  let updatedProgram, foundProgram, selectedDevice, dataToReturn;

  switch (type) {
    // =========== GESTIÓN DE RESPONSABLES EN PROGRAMA ===========
    case "program":
      switch (action) {
        case "list":
          foundProgram = await Program.findById(programId);
          if (!foundProgram) throw new Error("No se encontró el programa.");
          dataToReturn = foundProgram;
          break;
        case "add":
          // Aseguramos array
          const newResponsibles = Array.isArray(responsible) ? responsible : [responsible];
          updatedProgram = await Program.findByIdAndUpdate(
            programId,
            { $addToSet: { responsible: { $each: newResponsibles } } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa para añadir responsables.");
          dataToReturn = updatedProgram;
          break;
        case "update":
          const updatedResponsibles = Array.isArray(responsible) ? responsible : [responsible];
          updatedProgram = await Program.findByIdAndUpdate(
            programId,
            { $set: { responsible: updatedResponsibles } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa para actualizar.");
          dataToReturn = updatedProgram;
          break;
        case "remove":
          if (!responsibleId) throw new Error("Falta 'responsibleId' para eliminar el responsable.");
          updatedProgram = await Program.findByIdAndUpdate(
            programId,
            { $pull: { responsible: responsibleId } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa para eliminar el responsable.");
          dataToReturn = updatedProgram;
          break;
        default:
          throw new Error(`Acción '${action}' no soportada para 'program'.`);
      }
      break;

    // =========== GESTIÓN DE RESPONSABLES EN DISPOSITIVO ===========
    case "device":
      switch (action) {
        case "list":
          foundProgram = await Program.findOne({ _id: programId, "devices._id": deviceId });
          if (!foundProgram) throw new Error("No se encontró el programa.");
          selectedDevice = foundProgram.devices.find(dev => dev._id.toString() === deviceId);
          if (!selectedDevice) throw new Error("No se encontró el dispositivo en el programa.");
          dataToReturn = selectedDevice;
          break;
        case "add":
          const newRespsDevice = Array.isArray(responsible) ? responsible : [responsible];
          updatedProgram = await Program.findOneAndUpdate(
            { _id: programId, "devices._id": deviceId },
            { $set: { "devices.$.responsible": newRespsDevice } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa/dispositivo para añadir responsables.");
          dataToReturn = updatedProgram.devices.find(dev => dev._id.toString() === deviceId);
          break;
        case "update":
          const updatedRespsDevice = Array.isArray(responsible) ? responsible : [responsible];
          updatedProgram = await Program.findOneAndUpdate(
            { _id: programId, "devices._id": deviceId },
            { $set: { "devices.$.responsible": newRespsDevice } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa/dispositivo para actualizar.");
          dataToReturn = updatedProgram.devices.find(dev => dev._id.toString() === deviceId);
          break;
        case "remove":
          if (!responsibleId) throw new Error("Falta 'responsibleId' para eliminar el responsable.");
          updatedProgram = await Program.findOneAndUpdate(
            { _id: programId, "devices._id": deviceId },
            { $pull: { "devices.$.responsible": responsibleId } },
            { new: true }
          );
          if (!updatedProgram) throw new Error("No se encontró el programa/dispositivo para eliminar el responsable.");
          dataToReturn = updatedProgram.devices.find(dev => dev._id.toString() === deviceId);
          break;
        default:
          throw new Error(`Acción '${action}' no soportada para 'device'.`);
      }
      break;

    default:
      throw new Error(`Tipo '${type}' no soportado (debe ser 'program' o 'device').`);
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
    handleCoordinators:catchAsync(handleCoordinators),
    handleResponsibles:catchAsync(handleResponsibles)
};
