const mongoose = require("mongoose");
const { Schema } = mongoose;


const documentation = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    date: {
        type: Boolean,
        default: false 
    },
    model:{
        type:String,
        enum:['User', 'UserCv', 'Program', 'Finantial', 'Estadistics'],
        required: true
    },
    visible:{
        type:Boolean,
        default:true
    },
    duration:{
        type:Number,
        min: 0,
    },
    categoryFiles:{
        type: String
    },
    requiresSignature:{
        type: Boolean,
        default:false
    },
    programs: { 
        type: [Schema.Types.ObjectId], 
        ref: 'Program', 
        index: true,
        default:[] 
    },
    dispositives: { 
        type: [Schema.Types.ObjectId], 
        ref: 'Dispositive', 
        index: true,
        default:[]  
    }
}, { timestamps: true });

module.exports=mongoose.model('Documentation', documentation)