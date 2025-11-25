const mongoose = require("mongoose");
const { Schema } = mongoose;

const LeavePeriodSchema = new Schema({
    // Tipo de excedencia (voluntaria, cuidado de hijo a cargo, cargo público, baja laboral)
    leaveType: {
        type: Schema.Types.ObjectId,
        ref: 'Leavetype',
        required: true
    },
    // Fecha de inicio de la excedencia o baja laboral
    startLeaveDate: {
        type: Date,
        required: true
    },
    // Fecha prevista de fin de la excedencia o baja laboral
    expectedEndLeaveDate: {
        type: Date
    },
    // Fecha real de fin de la excedencia o baja laboral
    actualEndLeaveDate: {
        type: Date
    },
    active: {
        type: Boolean
    },
    idPeriod:{
        type:Schema.Types.ObjectId,
        ref: 'Periods',
        index: true
    },
    idUser:{
        type:Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
});

module.exports = mongoose.model('Leaves', LeavePeriodSchema)