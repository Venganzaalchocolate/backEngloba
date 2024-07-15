const mongoose = require("mongoose");

const estadistics = mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    }, // Nombre
    dateOfBirth: {
        type: Date, 
        required: true 
    }, // Fecha de nacimiento
    age: { 
        type: Number, 
        required: true 
    }, // Edad
    interventionPlan: { 
        type: Boolean, 
        required: true 
    }, // Plan de intervención (Sí - No)
    surname: { 
        type: String, 
        required: true 
    }, // Apellidos
    gender: { 
        type: String, 
        enum: ['Male', 'Female', 'Other'], 
        required: true }, // Sexo
    compliesInterventionPlan: { 
        type: Boolean, 
        required: true 
    }, // Cumple plan intervención (Sí - No)
    registrationDate: { type: Date, required: true }, // Fecha inscripción
    referredFrom: { type: String, required: true }, // Derivada desde
    currentStatus: { type: String, enum: ['In program', 'Discharged', 'Dropped out'], required: true }, // Estado actual en programa (En programa, Alta, Baja)
    program: { type: String, required: true }, 
    dispostivo: { type: String, required:true },
    // TODO Programa LISTA DE PROGRAMAS Y DISPOSITIVOS
    referredTo: { type: String, required: true }, // Derivada a
    metObjectives: { type: Boolean, required: true }, // ¿Ha cumplido objetivos planteados? (Sí - No)
    province: { type: String, required: true }, // Provincia
    participatesInOtherPrograms: { type: Boolean, required: true }, // Participa en otros programas entidad? (Sí - No)
    gbvExists: { type: Boolean, required: true }, // Existe o ha existido VG (Sí - No)
    children: [{ // Hijos
        name: { type: String }, // Nombre del hijo
        year: { type: Number } // Edad del hijo
    }],
    numberOfChildren: { type: Number, required: true }, // Número hijos
    childInSPM: { type: Boolean, required: true }, // Hijo/a en SPM (Sí - No)
    nationality: { type: String, required: true }, // Nacionalidad
    childInEnglobaProgram: { type: Boolean, required: true }, // Hijo/a participa en otro programa de Engloba? (Sí - No)
});

module.exports=mongoose.model('Estadistics', estadistics)