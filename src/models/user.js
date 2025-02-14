const mongoose = require("mongoose");
const Bag = require("./bag")
const { Schema } = mongoose;

// Esquema para Periodos de Excedencia o Baja Laboral
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
    }
});


const fileSchema = new Schema({
    fileName: { 
        type: String, 
        required: true 
    },
    fileTag: { 
        type: String, 
        required: true,
        index: true  // Agrega un índice en fileName
        
    },
    description: { 
        type: String,
        maxlength: 200
    },
    date: { 
        type: Date ,
        index: true  // Agrega un índice en fileName
    },
    notes:{
        type:String,
        maxlength: 200
    }
});

// Esquema para Periodos de Contratación
const PeriodSchema = new Schema({
    // Cargo que desempeña el empleado durante el periodo de contratación
    position: {
        type: Schema.Types.ObjectId,
        required: true
    },
    // Categoría del puesto del empleado
    category: {
        type: String,
        enum:['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
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
            enum: ['completa', 'parcial'],
            required: true 
        }
    },
    // Proceso de selección asociado al periodo de contratación (referencia a otra colección)
    selectionProcess: { 
        type: Schema.Types.ObjectId,
        ref: 'Bag'
    },

    leavePeriods:[LeavePeriodSchema],
    active: {
        type: Boolean
    }

});



// Esquema para Nóminas
const PayrollSchema = new Schema({
     // Mes de la nómina (1-12)
     payrollMonth: {
        type: Number,
        required: true,
        min: 1, // El valor mínimo debe ser 1
        max: 12, // El valor máximo debe ser 12
        validate: {
            validator: Number.isInteger,
            message: 'El mes debe ser un número entero.'
        }
    },
    // Año de la nómina (por ejemplo, entre 2000 y el año actual)
    payrollYear: {
        type: Number,
        required: true,
        min: 2000, // Establece un año mínimo, por ejemplo, 2000
        max: new Date().getFullYear(), // Establece como máximo el año actual
        validate: {
            validator: Number.isInteger,
            message: 'El año debe ser un número entero.'
        }
    },
    // Archivo PDF de la nómina
    pdf: {
        type: String,
        required: true
    },
    // Archivo de la firma
    sign: {
        type: String
    }
});

// Esquema principal del Empleado
const UserSchema = new Schema({
    disability:{
        percentage:{
            type:Number,
            required: true,
            default: 0
        },
        notes:{
            type: String,
        }
    },
    apafa:{
        type:Boolean,
        default: false
    },
    fostered:{
        type:Boolean,
        default: false
    },
    gender:{
        type:String,
        enum: ['male', 'female'],
        required:true,
    },
    role:{
        type: String,
        default: 'user',
        enum: ['global', 'root', 'auditor', 'employee', 'responsable'],
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
        enum: ['ya no trabaja con nosotros', 'activo', 'en proceso de contratación'],
        default:  'en proceso de contratación'
    },
    dispositiveNow:{
            type: [Schema.Types.ObjectId], // ID del dispositivo
    },
    // Periodos de contratación del empleado
    hiringPeriods: [PeriodSchema],
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
    // Nóminas del empleado
    payrolls: [PayrollSchema],
    // subida de archivos firmados
    // uploadFileSigned: pdf
    vacationDays:[Date],
    personalDays:[Date],
    files:[fileSchema],
    notes:{
        type: String,
    },
}, { timestamps: true });

module.exports=mongoose.model('User', UserSchema)