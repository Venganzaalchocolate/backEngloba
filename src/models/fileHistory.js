const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  modifiedTime: {
    type: Date,
    required: true
  },
  isFolder: {
    type: Boolean,
    required: true
  }
});

const Filehistory = mongoose.model('Filehistory', fileSchema);

module.exports = Filehistory;
