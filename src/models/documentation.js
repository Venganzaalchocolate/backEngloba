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
    }
});

module.exports=mongoose.model('Documentation', documentation)