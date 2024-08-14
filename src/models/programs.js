const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const fileSchema = new Schema({
    fileName: { 
        type: String, 
        required: true 
    },
    fileTag: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String 
    },
    date: { 
        type: Date 
    }
});

const deviceSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    address: { 
        type: String
    },
    responsible: { 
        type: Schema.Types.ObjectId,
        ref: 'User'
    },

    contratoAdministracion: [fileSchema],
    autorizacionFuncionamiento: [fileSchema],
    seguros: [fileSchema],
    libroQuejasSugerencias: [fileSchema],
    libroFoliadoRegistroUsuarios: [fileSchema],
    constanciaProyectoEducativo: [fileSchema],
    constanciaCurriculumEducativo: [fileSchema],
    constanciaReglamentoOrganizacion: [fileSchema],
    constanciaMemoriaAnual: [fileSchema],
    constanciaProgramacionAnual: [fileSchema],
    planAutoproteccion: [fileSchema],
    certificadoImplantacionPlanAutoproteccion: [fileSchema],
    revisionExtintores: [fileSchema],
    revisionesBIE: [fileSchema],
    certificadoRevisionCalderas: [fileSchema],
    certificadoRevisionElectricidad: [fileSchema],
    simulacroEvacuacion: [fileSchema],
    actaIdentificacionFunciones: [fileSchema],
    puntosEmergenciaOperativos: [fileSchema],
    senalizacionEvacuacion: [fileSchema],
    senalizacionAscensoresEmergencia: [fileSchema],
    menuVisadoNutricionista: [fileSchema],
    contratoCatering: [fileSchema],
    planHigiene: [fileSchema],
    planLegionela: [fileSchema],
    contratoDDD: [fileSchema],
    firmaProtocoloAcoso: [fileSchema]
});


const programSchema = new Schema({
    funding: { 
        type: Schema.Types.ObjectId,
        ref: 'Finantial'
    },
    name: { 
        type: String, 
        required: true 
    },
    acronym: { 
        type: String,
        required: true 
    },
    files: [fileSchema],
    devices: [deviceSchema]
});

module.exports = mongoose.model('Program', programSchema);