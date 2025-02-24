const mongoose = require("mongoose");
const { Schema } = mongoose;

const SubcategorySchema = new Schema({
    name: {
        type: String,
    },
    public:{
        type: Boolean,
        default: true
    }
});

const jobs = mongoose.Schema({
    name:{
        type: String,
        required:true,
        unique:true
    },
    subcategories: {
        type: [SubcategorySchema],
        default: undefined 
    },
    public:{
        type: Boolean,
        default: true
    }
    
});

module.exports=mongoose.model('Jobs', jobs)