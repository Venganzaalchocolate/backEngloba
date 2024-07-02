const mongoose = require("mongoose");

const bag= mongoose.Schema({
    name:{
        type: String,
        required:true,
    },
    userCv:{
        type: [],
        default: undefined
    },
    sepe:{
        type:Boolean
    },
    date:{
        type:Date,
    }
})

module.exports=mongoose.model('Bag', bag)