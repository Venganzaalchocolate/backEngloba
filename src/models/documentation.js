const mongoose = require("mongoose");
const { Schema } = mongoose;


const documentation = mongoose.Schema({
    label:{
        type:String,
        required:true
    },
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
    }
}, { timestamps: true });

module.exports=mongoose.model('Documentation', documentation)