const { Program } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

// Crear programa con dispositivos
const postCreateProgram = async (req, res) => {
    if (!req.body.funding || !req.body.name || !req.body.acronym) {
        throw new ClientError("Los datos no son correctos", 400);
    }

    const dataProgram = {
        funding: req.body.funding,
        name: req.body.name.toLowerCase(),
        acronym: req.body.acronym.toLowerCase(),
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
    if (!!req.body.name) updateText['name'] = req.body.name.toLowerCase();
    if (!!req.body.acronym) updateText['acronym'] = req.body.acronym.toLowerCase();
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
        responsible: req.body.responsible || null, // Optional
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
        responsible: req.body.responsible || dispositive.responsible,
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
};
