const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const fileSchema = new Schema({
    fileName: { type: String, required: true },
    fileTag: { type: String, required: true }
});

const deviceSchema = new Schema({
    name: { type: String, required: true },
    funding: {
        type: String,
        enum: ['Concierto', 'FSE', 'IRPF', 'NextGen', 'IAM'],
        required: true
    },
    address: { type: String, required: true },
    files: [fileSchema],
    responsible: { type: Schema.Types.ObjectId },
    protectionPlan: { type: Boolean, required: true },
    organizationChart: { type: Boolean, required: true },
    operatingAuthorization: { type: Boolean, required: true },
    accidentInsurance: { type: Boolean, required: true },
    civilLiabilityInsurance: { type: Boolean, required: true },
    accidentInsuranceAgain: { type: Boolean, required: true }, // Duplicate entry in the provided table
    pestControl: { type: Boolean, required: true },
    fireExtinguishers: { type: Boolean, required: true },
    homeInsurance: { type: Boolean, required: true },
    multiRiskInsurance: { type: Boolean, required: true },
    rent: { type: Boolean, required: true },
    fireDrill: { type: Boolean, required: true }
});

const programSchema = new Schema({
    funding: {
        type: String,
        enum: ['Concierto', 'FSE', 'IRPF', 'NextGen', 'IAM'],
        required: true
    },
    name: { type: String, required: true },
    acronym: { type: String, required: true },
    files: [fileSchema],
    responsible: { type: Schema.Types.ObjectId },
    devices: [deviceSchema]
});

module.exports = mongoose.model('Program', programSchema);