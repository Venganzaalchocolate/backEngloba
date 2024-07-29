const mongoose = require("mongoose");
const { Schema } = mongoose;


const work_schedule = mongoose.Schema({
    name:{
        type: String,
        required:true,
        unique:true
    }
});

module.exports=mongoose.model('Work_schedule', work_schedule)