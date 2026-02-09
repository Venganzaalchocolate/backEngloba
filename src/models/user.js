const mongoose = require("mongoose");
const { Schema } = mongoose;

const fileSchema = new Schema({
    filesId:{
        type:Schema.Types.ObjectId,
          ref: 'Filedrive'  
      },
fileName:  {type: String},
  fileTag: {type: String},
  description: {type: String},
  date: {type: String}
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
    },
    datetimeSign:{
        type:Date
    }
});

const VacationEntrySchema = new Schema({
  date: {
    type: Date,
    required: true,
  },
  hours: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });


// Esquema principal del Empleado
const UserSchema = new Schema({
    birthday:{
        type:Date,
    },
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
        enum: ['male', 'female', 'others', 'nonBinary'],
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
        index: true, // ← esto creará un índice en MongoDB
        unique: true, // recomendado si es único
        required: true, // recomendado si siempre estará presente
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
    },
    email_personal: {
        type: String,
    },
    // Teléfono del empleado privado
    phone: {
        type: String,
        required: true,
    },
    phoneJob:{
        number:{
           type: String, 
        },
        extension:{
            type: String, 
        }
    },

    // Estado laboral del empleado
    employmentStatus: {
        type: String,
        enum: ['ya no trabaja con nosotros', 'activo', 'en proceso de contratación'],
        default:  'en proceso de contratación'
    },
    
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
    //vacationDays:[Date] y personalDays:[Date] son campos antiguos que no se deben tener en cuenta
    vacationDays:[Date],
    personalDays:[Date],
    //NUEVOS CAMPOS
    vacationHours: [VacationEntrySchema],
    personalHours: [VacationEntrySchema],
    
    files: [fileSchema],
    notes:{
        type: String,
    },
    consetmentDataProtection:{
        type:Boolean,
        default:true,
    },
    //
    studies:{
        type:[Schema.Types.ObjectId],
        ref: 'Studies'
    },
    tracking:{
        type:Boolean,
        default:false
    },
    photoProfile:{
        type: String
    }

}, { timestamps: true });



module.exports=mongoose.model('User', UserSchema)