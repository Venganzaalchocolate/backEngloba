const mongoose = require("mongoose");
const { Schema } = mongoose;

const SubcategorySchema = new Schema({
    name: {
        type: String,
    }
});

const studies = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    subcategories: {
        type: [SubcategorySchema],
        default: undefined 
    }
});

module.exports=mongoose.model('Studies', studies)