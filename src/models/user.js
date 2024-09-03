const mongoose = require("mongoose");
const Bag = require("./bag")
const { Schema } = mongoose;


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
        enum:['grupo 1', 'grupo 2', 'grupo 3'],
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
        nota: {
            type: String,
        },
        type: {
            type: String,
            enum: ['total', 'parcial'],
            required: true 
        }
    },
    // Proceso de selección asociado al periodo de contratación (referencia a otra colección)
    selectionProcess: {
        type: Schema.Types.ObjectId,
        ref: 'Bag'
    }
});

// Esquema para Periodos de Excedencia o Baja Laboral
const LeavePeriodSchema = new Schema({
    // Tipo de excedencia (voluntaria, cuidado de hijo a cargo, cargo público, baja laboral)
    leaveType: {
        type: String,
        enum: ['excedencia voluntaria', 'excedencia forzosa', 'enfermedad común', 'accidente laboral', 'maternidad', 'riesgo emparazo', 'lactancia'],
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
        enum: ['global', 'root', 'auditor', 'employer', 'responsable'],
        require:true,
    },
    // DNI del empleado
    dni: {
        type: String,
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
    },
    // Correo electrónico del empleado
    email: {
        type: String,
        unique: true
    },
    // Teléfono del empleado
    phone: {
        type: String,
        required: true,
        unique: true
    },

    // Estado laboral del empleado
    employmentStatus: {
        type: String,
        enum: ['baja', 'activo', 'en proceso de contratación', 'excedencia'],
        default:  'en proceso de contratación'
    },
    dispositiveNow:{
        type: Schema.Types.ObjectId,
        ref: 'Device'
    },
    // Periodos de contratación del empleado
    hiringPeriods: [PeriodSchema],
    // Periodos de excedencia o baja laboral del empleado
    leavePeriods: [LeavePeriodSchema],
    // Número de Seguridad Social del empleado
    socialSecurityNumber: {
        type: String,
    },
    // Número de cuenta bancaria del empleado
    bankAccountNumber: {
        type: String,
    },
    // Curriculum Vitae del empleado (no requerido)
    cv: {
        type: String
    },

    degree: {
        type: [fileSchema]
    },

    // Certificado de Delitos Sexuales del empleado (no requerido) PDF
    // esquema file de programs
    sexualOffenseCertificate: {
        type: String
    },
    // Modelo 145 del empleado (no requerido) PDF
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
    // subida de archivos firmados
    // uploadFileSigned: pdf
}, { timestamps: true });

module.exports=mongoose.model('User', UserSchema)