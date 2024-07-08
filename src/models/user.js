const mongoose = require("mongoose");
const Bag = require("./bag")
const { Schema } = mongoose;

// Esquema para Periodos de Contratación
const PeriodSchema = new Schema({
    // Cargo que desempeña el empleado durante el periodo de contratación
    position: {
        type: String,
        required: true
    },
    // Categoría del puesto del empleado
    category: {
        type: String,
        required: true
    },
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
        ref: 'Device'
    },
    // Jornada laboral del empleado (total o parcial)
    workShift: {
        type: String,
        enum: ['total', 'parcial'],
        required: true
    },
    // Proceso de selección asociado al periodo de contratación (referencia a otra colección)
    selectionProcess: {
        type: Schema.Types.ObjectId,
        ref: 'SelectionProcess'
    }
});

// Esquema para Periodos de Excedencia o Baja Laboral
const LeavePeriodSchema = new Schema({
    // Tipo de excedencia (voluntaria, cuidado de hijo a cargo, cargo público, baja laboral)
    leaveType: {
        type: String,
        enum: ['voluntaria', 'cuidado de hijo a cargo', 'cargo público', 'baja laboral'],
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
    }
});

// Esquema para Nóminas
const PayrollSchema = new Schema({
    // Fecha de la nómina (mes/año)
    payrollDate: {
        type: String,
        required: true
    },
    // Archivo PDF de la nómina
    pdf: {
        type: String,
        required: true
    },
    // Indicador de si la nómina ha sido vista
    seen: {
        type: Boolean,
        required: true,
        default: false
    }
});

// Esquema principal del Empleado
const UserSchema = new Schema({
    pass:{
        type: String,
        required: true,
    },
    role:{
        type: String,
        default: 'user',
        enum: ['user', 'admin', 'auditor'],
        require:true,
    },
    // DNI del empleado
    dni: {
        type: String,
        required: true,
        unique: true
    },
    // Nombre del empleado
    firstName: {
        type: String,
        required: true
    },
    // Apellidos del empleado
    lastName: {
        type: String,
        required: true
    },
    // Correo electrónico del empleado
    email: {
        type: String,
        required: true,
        unique: true
    },
    // Teléfono del empleado
    phone: {
        type: String,
        required: true
    },
    // Proceso asociado al empleado (referencia a otra colección)
    process: {
        type: Schema.Types.ObjectId,
        ref: 'Bag',
        required: true
    },
    // Indicador de si el empleado está activo
    active: {
        type: Boolean,
        required: true,
        default: true
    },
    // Estado laboral del empleado
    employmentStatus: {
        type: String,
        enum: ['trabajando', 'excedencia voluntaria', 'excedencia forzosa', 'baja laboral', 'finalización de contrato'],
        required: true
    },
    // Periodos de contratación del empleado
    hiringPeriods: [PeriodSchema],
    // Periodos de excedencia o baja laboral del empleado
    leavePeriods: [LeavePeriodSchema],
    // Número de Seguridad Social del empleado
    socialSecurityNumber: {
        type: String,
        required: true
    },
    // Número de cuenta bancaria del empleado
    bankAccountNumber: {
        type: String,
        required: true
    },
    // Curriculum Vitae del empleado (no requerido)
    cv: {
        type: String
    },
    // Titulación del empleado (no requerida)
    degree: {
        type: String
    },
    // Certificado de Delitos Sexuales del empleado (no requerido)
    sexualOffenseCertificate: {
        type: String
    },
    // Modelo 145 del empleado (no requerido)
    model145: {
        type: String
    },
    // Certificado de Prevención de Incendios del empleado (no requerido)
    firePrevention: {
        type: String
    },
    // Contrato del empleado (no requerido)
    contract: {
        type: String
    },
    // Vida laboral del empleado (no requerida)
    employmentHistory: {
        type: String
    },
    // Protocolo de Protección de Datos del empleado (no requerido)
    dataProtection: {
        type: String
    },
    // Canal Ético del empleado (no requerido)
    ethicalChannel: {
        type: String
    },
    // Copia del DNI del empleado (no requerida)
    dniCopy: {
        type: String
    },
    // Nóminas del empleado
    payrolls: [PayrollSchema]
});

module.exports=mongoose.model('User', UserSchema)