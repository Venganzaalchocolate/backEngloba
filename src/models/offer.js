const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const offer= mongoose.Schema({
    entinty:{
        type:String,
        enum: ['ASOCIAIÓN ENGLOBA', 'ENTIDAD DOS'],
        default: 'ASOCIAIÓN ENGLOBA'
    },
    job_title:{
        type: String,
        required:true,
    },
    functions:{
        type: String,
        required:true,
    },
    work_schedule:{
        type:String,
        required:true
    },
    essentials_requirements:{
        type: String,
    },
    optionals_requirements:{
        type: String,
    },
    conditions:{
        type: String,
    },
    province:{
        type:String,
        required:true
    },
    location:{
        type: String,
        required:true,
    },
    date:{
        type:Date,
    },
    create:{
        type: Schema.Types.ObjectId,
        required:true
    },
    expected_incorporation_date:{
        type:  String,
        required:true
    },
    active:{
        type: Boolean,
        default:true
    },
    dispositive:{
        programId:{
            type: Schema.Types.ObjectId,
            required:true,
            ref:'Program'
        },
        dispositiveId:{
            type: Schema.Types.ObjectId,
            required:true
        }
    },
    sepe:{
        type:Boolean,
        default:false
    },
    studies:[{
        type:String,
    }],
    rejectCv:{
        type: [Schema.Types.ObjectId],
        required:true,
        default:[],
        ref: 'UserCv'
    },
    favoritesCv:{
        type: [Schema.Types.ObjectId],
        required:true,
        default:[],
        ref: 'UserCv'
    },
    viewCv:{
        type: [Schema.Types.ObjectId],
        required:true,
        default:[],
        ref: 'UserCv'
    },
    userCv:{
        type: [Schema.Types.ObjectId],
        ref: 'UserCv',
        default: []
    }
}, { timestamps: true })

module.exports=mongoose.model('Offer', offer)