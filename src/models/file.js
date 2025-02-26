const mongoose = require("mongoose");
const { Schema } = mongoose;

const fileSchema = new Schema({
    // nombre del archivo
    fileName: { 
        type: String, 
    },
    fileLabel: { 
        type: String, 
    },
    description: { 
        type: String,
        maxlength: 200
    },
    date: { 
        type: Date ,
        index: true  // Agrega un índice en fileName
    },
    notes:{
        type:String,
        maxlength: 200
    },
    originModel:{
        type: String,
        enum:['User', 'UserCv', 'Program', 'Finantial', 'Estadistics'],
        required: true 
    },
    idModel:{
        type: Schema.Types.ObjectId,
        required: true 
    },
    cronology:{
        open:{
            type:Date
        },
        closed:{
            type:Date
        }
    },
    originDocumentation:{
        type:Schema.Types.ObjectId,
        ref:'Documentation'
    },
    idDrive:{
        type:String,
    }
}, { timestamps: true });

module.exports=mongoose.model('File', fileSchema)