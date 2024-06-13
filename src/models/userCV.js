const mongoose = require("mongoose");

const userCv = mongoose.Schema({
    name:{
        type: String,
        required:true,
    },
    email:{
        type:String,
        require:true
    },
    phone:{
        type: String,
        required: true,
        unique:true
    },
    jobs:{
        type: String,
        enum: ['trabajo1', 'trabajo2', 'trabajo3'],
        require:true,
    },
    comments:{
        type: String,
    },
    view:{
        type: Boolean,
        default: false,
    }

});

module.exports=mongoose.model('UserCv', userCv)