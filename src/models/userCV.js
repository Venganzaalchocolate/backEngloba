const mongoose = require("mongoose");

const userCv = mongoose.Schema({
    name:{
        type: String,
        required:true,
    },
    email:{
        type:String,
        require:true,
        unique:true
    },
    phone:{
        type: String,
        required: true,
        unique:true
    },
    jobs:{
        type: String,
        enum: ['Auxiliar Técnico', 'Educación Social', 'Integración Sociolaboral', 'Magisterio', 'Psicología', 'Trabajo Social', 'Orientador Sociolaboral'],
        require:true,
    },
    provinces: {
        type: String,
        enum: ['Almería', 'Cádiz', 'Ceuta', 'Córdoba', 'Extremadura', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Murcia', 'Sevilla', 'Todas'],
        require:true,
    },
    about:{
        type: String,
    },
    comments:{
        type: String,
    },
    view:{
        type: Boolean,
        default: false,
    },
    offer:{
        type: String,
    },
    work_schedule:{
        type: String,
        enum: ['Cualquiera', 'Jornada completa', 'Media Jornada', 'Mañanas', 'Tardes', 'Noches'],
        require:true,
    },
    job_exchange: {
        type: Boolean,
        default: true,
    },
    numberCV:{
        type: Number,
        default: 1,
    }

});

module.exports=mongoose.model('UserCv', userCv)