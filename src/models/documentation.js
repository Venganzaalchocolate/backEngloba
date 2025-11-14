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
        enum:['User', 'UserCv', 'Program', 'Finantial', 'Estadistics', 'Dispositive'],
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
    modeloPDF:{
        type:String
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
    },
    // Dentro de documentationSchema (o como se llame):
dynamicTemplate: {
  type: Schema.Types.ObjectId,
  ref: 'DynamicDocTemplate',
},

dynamicRequired: {
  type: Boolean,
  default: false,
},

}, { timestamps: true });

module.exports=mongoose.model('Documentation', documentation)