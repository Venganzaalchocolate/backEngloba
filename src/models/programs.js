const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const fileSchema = new Schema({
    fileName: { 
        type: String, 
        required: true 
    },
    fileTag: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String 
    },
    date: { 
        type: Date 
    }
});

const deviceSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    address: { 
        type: String
    },
    files: [fileSchema],
    responsible: { 
        type: Schema.Types.ObjectId 
    },
    protectionPlan: [fileSchema],
    organizationChart: [fileSchema],
    operatingAuthorization: [fileSchema],
    accidentInsurance: [fileSchema],
    civilLiabilityInsurance: [fileSchema],
    accidentInsuranceAgain: [fileSchema], // Duplicate entry in the provided table
    pestControl: [fileSchema],
    fireExtinguishers: [fileSchema],
    homeInsurance: [fileSchema],
    multiRiskInsurance: [fileSchema],
    rent: [fileSchema],
    fireDrill: [fileSchema]
});

const programSchema = new Schema({
    funding: {
        type: String,
        enum: ['Concierto', 'FSE', 'IRPF', 'NextGen', 'IAM'],
        required: true
    },
    name: { 
        type: String, 
        required: true 
    },
    acronym: { 
        type: String,
        required: true 
    },
    files: [fileSchema],
    devices: [deviceSchema]
});

module.exports = mongoose.model('Program', programSchema);