const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const fileSchema = new Schema({
    fileName: { 
        type: String, 
        required: true 
    },
    fileTag: { 
        type: String, 
        required: true,
        index: true  // Agrega un índice en fileName
    },
    description: { 
        type: String 
    },
    date: { 
        type: Date 
    }
}, { timestamps: true });

const deviceSchema = new Schema({
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
    files: [fileSchema],
});


const programSchema = new Schema({
    responsible: { 
        type: [Schema.Types.ObjectId],
        ref: 'User',
        required: false,
        default: []
    },
    funding: { 
        type: Schema.Types.ObjectId,
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
    files: [fileSchema],
    devices: [deviceSchema],
    about: {
        description: { 
            type: String
        },
        objectives: { 
            type: String
        },
        profile: { 
            type: String
        },
        table:{
            title: {
                type:String
            },
            content:{
                type:[String]
            }
        }
      }
});

module.exports = mongoose.model('Program', programSchema);