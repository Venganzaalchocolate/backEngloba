const mongoose = require("mongoose");
const { Schema } = mongoose;

const fileSchema = new Schema({
    // nombre del archivo
    // si coincide el fileTag con oldToNewDocMap no se pondrá fileName, ya que el fileName y el FileLabel estará en Documentation con ese id
    fileName: { 
        type: String, 
    },
    // si coincide el fileTag con oldToNewDocMap no se pondrá fileLabel
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
        enum:['User', 'UserCv', 'Program', 'Finantial', 'Estadistics', 'Dispositive', 'VolunteerApplication'],
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
    // solo se pondrá si coincide el fileTag con oldToNewDocMap
    originDocumentation:{
        type:Schema.Types.ObjectId,
        ref:'Documentation'
    },
    idDrive:{
        type:String,
    },
    category:{
        type:String,
        enum:['Varios', 'Seguros', 'PRL', 'Funcionamiento', 'Registros', 'Sanidad', 'Laboral', 'Personal', 'Mantenimiento'],
        default:'Varios'
    },
    
}, { timestamps: true });

module.exports=mongoose.model('Filedrive', fileSchema)