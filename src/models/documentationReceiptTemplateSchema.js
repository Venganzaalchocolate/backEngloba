const mongoose = require('mongoose');
const { Schema } = mongoose;

const receiptBlockSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["yesno", "text", "note"],
      required: true,
    },

    key: {
      type: String,
      default: "",
      trim: true,
    },

    label: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      default: "",
      trim: true,
    },

    required: {
      type: Boolean,
      default: true,
    },

    yesText: {
      type: String,
      default: "",
    },

    noText: {
      type: String,
      default: "",
    },

    blocksSignatureIfAnswer: {
      type: String,
      enum: ["yes", "no", null],
      default: null,
    },

    blockMessage: {
      type: String,
      default: "",
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

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

    blocks: {
      type: [receiptBlockSchema],
      default: [],
    },

    finalText: {
      type: String,
      default: 'Y para que así conste, firma digitalmente el presente documento.',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentationReceiptTemplate',documentationReceiptTemplateSchema);