const mongoose = require("mongoose");
const { Schema } = mongoose;

const PeriodSchema = new Schema({
    // Cargo que desempeña el empleado durante el periodo de contratación
    position: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    // Categoría del puesto del empleado
    // Fecha de inicio del periodo de contratación
    startDate: {
        type: Date,
        required: true
    },
    // Fecha de fin del periodo de contratación
    endDate: {
        type: Date
    },
    // Dispositivo asignado al empleado (referencia a otra colección)
    device: {
        type: Schema.Types.ObjectId,
    },
    dispositiveID:{
        type: Schema.Types.ObjectId,
        ref: 'Dispositive'
    },
    // Jornada laboral del empleado (total o parcial)
    workShift: {
        nota: {
            type: String,
        },
        type: {
            type: String,
            enum: ['completa', 'parcial'],
            required: true
        }
    },
    // Proceso de selección asociado al periodo de contratación (referencia a otra colección)
    selectionProcess: {
        type: Schema.Types.ObjectId,
        ref: 'Offer'
    },
    active: {
        type: Boolean,
        default: true
    },
    replacement: {
        leave:{
            type: Schema.Types.ObjectId,
                ref: 'Leaves',     // ajusta a tu nombre de modelo real: 'Leave' / 'Leaves'
                default: null,
                index: true,
        },
        user:{
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true
        }
     
    },
    idUser: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
});

module.exports = mongoose.model('Periods', PeriodSchema)