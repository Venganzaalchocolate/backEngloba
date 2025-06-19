const mongoose = require('mongoose');
const Schema = mongoose.Schema;
// IMPORTAR `File` ANTES de definir el esquema


const deviceSchema = new Schema({
    active:{
        type: Boolean,
        default: true
    },
    name: { 
        type: String, 
        required: true 
    },
    address: { 
        type: String
    },
    email:{
        type:String
    },
    phone:{
        type:String
    },
    responsible: { 
        type: [Schema.Types.ObjectId],
        ref: 'User',
        required: false,
        default: []
    },
    province:{
        type:Schema.Types.ObjectId,
        ref:'Provinces',
    },
    coordinators:{
        type: [Schema.Types.ObjectId],
        ref: 'User',
        required: false,
        default: []
    },
    
    files: {
        type:[Schema.Types.ObjectId],
        ref: 'Filedrive'
    },
    groupWorkspace:{
        type:String
    },
    
    subGroupWorkspace:{
        type:[String],
        default:[]
    }
});

const cronologySchema=new Schema({
    open:{
        type: Date,
    },
    closed:{
        type:Date
    }
})


const programSchema = new Schema({
    area:{
        type: String,
        enum: ['igualdad', 'desarrollo comunitario', 'lgtbiq', 'infancia y juventud', 'personas con discapacidad', 'mayores', 'no identificado'],
        default: 'no identificado'
    },
    active:{
        type: Boolean,
        default: true
    },
    responsible: { 
        type: [Schema.Types.ObjectId],
        ref: 'User',
        required: false,
        default: []
    },
    finantial: { 
        type: [Schema.Types.ObjectId],
        ref: 'Finantial'
    },
    name: { 
        type: String, 
        required: true 
    },
    acronym: { 
        type: String,
        required: true 
    },
    files: {
        type:[Schema.Types.ObjectId],
        ref: 'Filedrive'
    },
    devices: [deviceSchema],
    cronology:[cronologySchema],
    essentialDocumentationProgram:{
        type:[Schema.Types.ObjectId],
        ref: 'Documentation',
        default:[]
    },
    essentialDocumentationDevice:{
        type:[Schema.Types.ObjectId],
        ref: 'Documentation',
        default:[]
    },
    about: {
        description: { 
            type: String
        },
        objectives: { 
            type: String
        },
        profile: { 
            type: String
        }
      },
    resindencial:{
        type:Boolean,
        default: false,
    },    
    
    groupWorkspace:{
        type:String
    },

    subGroupWorkspace:{
        type:[String],
        default:[]
    }

});

module.exports = mongoose.model('Program', programSchema);