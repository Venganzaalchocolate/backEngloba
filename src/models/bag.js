const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bag= mongoose.Schema({
    name:{
        type: String,
        required:true,
    },
    userCv:{
        type: [Schema.Types.ObjectId],
        default: undefined
    },
    sepe:{
        type:Boolean
    },
    date:{
        type:Date,
    },
    create:{
        type:  Schema.Types.ObjectId,
        required:true
    },
    dispositive:{
        name:{
            type: String,
            required:true,
        },
        id:{
            type: Schema.Types.ObjectId,
            required:true,    
        }
    },
    active:{
        type: Boolean,
        default: true
    }
} , { timestamps: true })

module.exports=mongoose.model('Bag', bag)