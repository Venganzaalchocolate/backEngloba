const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ['yesno'],
      default: 'yesno',
    },

    required: {
      type: Boolean,
      default: true,
    },

    yesText: {
      type: String,
      default: '',
    },

    noText: {
      type: String,
      default: '',
    },

    blocksSignatureIfAnswer: {
      type: String,
      enum: ['yes', 'no', null],
      default: null,
    },

    blockMessage: {
      type: String,
      default: '',
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const documentationReceiptTemplateSchema = new Schema(
  {
    documentationId: {
      type: Schema.Types.ObjectId,
      ref: 'Documentation',
      required: true,
      unique: true,
      index: true,
    },

    active: {
      type: Boolean,
      default: true,
    },

    title: {
      type: String,
      default: 'Declaración responsable',
    },

    introText: {
      type: String,
      default: '',
    },

    questions: {
      type: [questionSchema],
      default: [],
    },

    finalText: {
      type: String,
      default: 'Y para que así conste, firma digitalmente el presente recibí.',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentationReceiptTemplate',documentationReceiptTemplateSchema);