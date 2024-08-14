const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SubcategorySchema = new Schema({
    name: {
        type: String,
    }
});

const finantialSchema = mongoose.Schema({
    name:{
        type: String,
        required:true,
        unique:true
    },
    subcategories: {
        type: [SubcategorySchema],
        default: undefined 
    }
    
});

module.exports = mongoose.model('Finantial', finantialSchema);