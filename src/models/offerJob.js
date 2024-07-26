const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const offerJob= mongoose.Schema({
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
    studies:{
        type:String,
        required:true
    },
    essentials_requirements:{
        type: String,
        required:true,
    },
    optionals_requirements:{
        type: String,
        required:true,
    },
    conditions:{
        type: String,
        required:true,
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
        type:  Schema.Types.ObjectId,
        required:true
    },
    expected_incorporation_date:{
        type:  Date,
        required:true
    },
    active:{
        type: Boolean,
        default:true
    },
    bag:{
        type: Schema.Types.ObjectId,
        required:true,
        ref:'Bag'
    }
})

module.exports=mongoose.model('OfferJob', offerJob)