const mongoose = require("mongoose");
const { Schema } = mongoose;

const entitySchema=new Schema({
    name:{
        type:String,
        require:true
    }
})

module.exports = mongoose.model('Entity', entitySchema);