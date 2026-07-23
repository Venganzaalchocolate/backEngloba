const mongoose = require("mongoose");
const { Schema } = mongoose;

/* =========================================================
   ESTADÍSTICAS DE WORDPRESS / GOOGLE ANALYTICS
========================================================= */

const wordpressStatsSchema = new Schema(
  {
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    users: {
      type: Number,
      default: 0,
      min: 0,
    },
    sessions: {
      type: Number,
      default: 0,
      min: 0,
    },
    collectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   ESTADÍSTICAS DE INSTAGRAM
========================================================= */

const instagramStatsSchema = new Schema(
  {
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    reach: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    comments: {
      type: Number,
      default: 0,
      min: 0,
    },
    saved: {
      type: Number,
      default: 0,
      min: 0,
    },
    shares: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalInteractions: {
      type: Number,
      default: 0,
      min: 0,
    },
    collectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   HISTORIAL DE CAMBIOS
========================================================= */

const historySchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
  }
);

/* =========================================================
   PUBLICACIÓN DE COMUNICACIÓN
========================================================= */

const communicationPublicationSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    /*
      Una publicación puede estar relacionada con varios
      programas y varios dispositivos.

      Los arrays también pueden estar vacíos para publicaciones
      institucionales o generales de Asociación Engloba.
    */
    programs: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Program",
        },
      ],
      default: [],
    },

    dispositives: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Dispositive",
        },
      ],
      default: [],
    },

    publicationDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    platforms: {
      type: [
        {
          type: String,
          enum: ["wordpress", "instagram"],
        },
      ],
      default: [],
    },

    wordpress: {
      postId: {
        type: Number,
        default: null,
      },
      url: {
        type: String,
        trim: true,
        default: null,
      },
      publishedAt: {
        type: Date,
        default: null,
      },
      stats: {
        type: [wordpressStatsSchema],
        default: [],
      },
    },

    instagram: {
      mediaId: {
        type: String,
        trim: true,
        default: null,
      },
      url: {
        type: String,
        trim: true,
        default: null,
      },
      matchText: {
        type: String,
        trim: true,
        default: "",
      },
      matchStatus: {
        type: String,
        enum: ["pending", "matched", "ambiguous"],
        default: "pending",
      },
      caption: {
        type: String,
        default: "",
      },
      mediaType: {
        type: String,
        trim: true,
        default: "",
      },
      publishedAt: {
        type: Date,
        default: null,
      },
      stats: {
        type: [instagramStatsSchema],
        default: [],
      },
    },

    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "partial",
        "complete",
        "error",
      ],
      default: "draft",
      index: true,
    },

    history: {
      type: [historySchema],
      default: [],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   ÍNDICES
========================================================= */

communicationPublicationSchema.index({ programs: 1 });
communicationPublicationSchema.index({ dispositives: 1 });
communicationPublicationSchema.index({ publicationDate: -1 });
communicationPublicationSchema.index({ platforms: 1 });
communicationPublicationSchema.index({ "wordpress.publishedAt": 1 });
communicationPublicationSchema.index({ "instagram.publishedAt": 1 });

communicationPublicationSchema.index(
  { "wordpress.postId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "wordpress.postId": { $type: "number" },
    },
  }
);

communicationPublicationSchema.index(
  { "instagram.mediaId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "instagram.mediaId": { $type: "string" },
    },
  }
);

module.exports = mongoose.model(
  "CommunicationPublication",
  communicationPublicationSchema
);