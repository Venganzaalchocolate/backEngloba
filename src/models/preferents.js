const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const preferents= mongoose.Schema({
    user:{
         type: Schema.Types.ObjectId,
            required:true,
            ref:'User'
    },
    provinces:{
        type:[Schema.Types.ObjectId],
        reuired: true,
        ref:'Provinces'
    },
    jobs:{
        type:[Schema.Types.ObjectId],
        reuired: true,
        ref:'Jobs'
    },
    type:{
        type:String,
        enum:['traslado','reincorporación']
    },
    authorized:{
        type: Schema.Types.ObjectId,
        required:true,
        ref:'User'
    },
    active:{
        type:Boolean,
        default:true
    },
    moveDone:{
        type:Boolean,
        default:false
    }

}, { timestamps: true })

module.exports=mongoose.model('Preferents', preferents)