const mongoose = require("mongoose");

const user = mongoose.Schema({
    name:{
        type: String,
        required:true,
    },
    email:{
        type:String,
        require:true
    },
    pass:{
        type: String,
        required: true,
    },
    role:{
        type: String,
        default: 'user',
        enum: ['user', 'admin', 'auditor'],
        require:true,
    },
    dni:{
        type: String,
        default: 'user',
        require:true,
        unique:true
    }

});

module.exports=mongoose.model('User', user)