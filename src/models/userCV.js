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
    firstName:{
        type: String,
        required:true,
    },
    lastName:{
        type: String,
        required:true,
    },
    email:{
        type:String,
        require:true,
    },
    phone:{
        type: String,
        required: true,
        unique:true
    },
    dni:{
        type: String,
        unique:true
    },
    jobs:{
        type: [String],
        // ref:'Jobs'
    },
    provinces: {
        type: [String],
        // ref:'Provinces'
    },
    gender:{
        type:String,
        enum: ['male', 'female', 'others', 'nonBinary'],
    },
    about:{
        type: String,
    },
    commentsPhone:{
        type: [commentSchema],
        default: undefined 
    },
    commentsVideo:{
        type: [commentSchema],
        default: undefined 
    },
    commentsInperson:{
        type: [commentSchema],
        default: undefined 
    },

    notes:{
        type: [commentSchema],
        default: undefined
    },

    view:{
        type: Schema.Types.ObjectId,
        default: null,
    },
    offer:{
        type: String,
        default: null,
        // ref:'Offer'
    },
    work_schedule:{
        type: [String],
        enum: ['Cualquiera', 'Jornada completa', 'Media Jornada', 'Mañanas', 'Tardes', 'Noches'],
        require:true,
        default:'Cualquiera'
    },
    job_exchange: {
        type: Boolean,
        default: true,
    },
    numberCV:{
        type: Number,
        default: 1,
    },
    hired:{
        type: {
            date:{
                type: Date,
                required: true,

            },
            for:{
                type: Schema.Types.ObjectId,
                required: true,
            }
        }
    },
    favorite:{
        type: Schema.Types.ObjectId,
        default: null,
    },
    reject:{
        type:Schema.Types.ObjectId,
        default: null,
    },
        // Añadido campo studies que es un enum permitiendo múltiples valores
    studies: {
        type: [String],
        required: true,
        // ref:'Studies'
    },
    disability:{
            type:Number,
            default: 0
    },
    fostered:{
        type:Boolean,
        default: false
    },
    jobsId: [{ type: Schema.Types.ObjectId, ref: 'Jobs', default: [] }],
    provincesId: [{ type: Schema.Types.ObjectId, ref: 'Provinces', default: [] }],
    studiesId: [{ type: Schema.Types.ObjectId, ref: 'Studies', default: [] }],


}, { timestamps: true });

module.exports=mongoose.model('UserCv', userCv)