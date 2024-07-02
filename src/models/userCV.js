const mongoose = require("mongoose");
const { Schema } = mongoose;

const commentSchema = mongoose.Schema({
    userCv: {
        type: Schema.Types.ObjectId,
        ref: 'UserCv', // Referencia al modelo UserCv
        required: true,
    },
    nameUser:{
        type:String,
        required:true
    },
    date:{
        type: Date,
        require:true
    },
    message:{
        type: String,
        require:true
    }
})

const userCv = mongoose.Schema({
    date:{
        type: Date,
        require: true
    }, 
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
    commentsPhone:{
        type: [commentSchema],
        default: undefined // Array of cantidadJuegos subdocuments
    },
    commentsVideo:{
        type: [commentSchema],
        default: undefined // Array of cantidadJuegos subdocuments
    },
    commentsInperson:{
        type: [commentSchema],
        default: undefined // Array of cantidadJuegos subdocuments
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
    },
    status:{
        type:{
            hired:{
                type:{
                    date: {
                        type: Date
                    }
                }
            }
            
        }
    },
    favorite:{
        type: Boolean
    },
    reject:{
        type:Boolean
    }

});

module.exports=mongoose.model('UserCv', userCv)