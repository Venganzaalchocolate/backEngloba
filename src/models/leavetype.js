const mongoose = require("mongoose");
const { Schema } = mongoose;



const leavetype = mongoose.Schema({
    name:{
        type: String,
        required:true,
        unique:true
    },
    
});

module.exports=mongoose.model('Leavetype', leavetype)