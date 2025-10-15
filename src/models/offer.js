const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const offer= mongoose.Schema({
    entinty:{
        type:String,
        enum: ['ASOCIAIÓN ENGLOBA', 'ENTIDAD DOS'],
        default: 'ASOCIAIÓN ENGLOBA'
    },
    //es nombre compuesto por el el name de funcions y la provincia, sistema antiguo
    job_title:{
        type: String,
    },
    //es jobsId pero el name en vez d ela referecnia este es del sistema antiguo
    functions:{
        type: String,

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
    //es provinceId pero el name en vez d ela referecnia este es del sistema antiguo
    province:{
        type:String,

    },

    location:{
        type: String,

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
        },
        newDispositiveId:{
            type: Schema.Types.ObjectId,
        }
    },
    sepe:{
        type:Boolean,
        default:false
    }, 
    //es studiesId pero el name en vez de la referecnia este es del sistema antiguo
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
    },
    type:{
        type:String,
        enum: ['internal', 'external'],
        default: 'external'
    },
    datecreate:{
        type:Date
    },
    studiesId:{
        type: [Schema.Types.ObjectId],
        ref: 'Studies'
    },
    jobId:{
        type: Schema.Types.ObjectId,
        ref: 'Jobs'
    },
    provinceId:{
        type: Schema.Types.ObjectId,
        ref: 'Provinces'
    },
    solicitants:{
        type: [Schema.Types.ObjectId],
        ref: 'UserCv',
        default: []
    }
}, { timestamps: true })

module.exports=mongoose.model('Offer', offer)