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
      publicationDate: {
        type: String,
        default: null,
        match: /^\d{4}-\d{2}-\d{2}$/,
      },
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
      publicationDate: {
        type: String,
        default: null,
        match: /^\d{4}-\d{2}-\d{2}$/,
      },
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

const calculateVerifiedStatus = (publication) => {
  const platforms = Array.from(publication.platforms || []);

  if (!platforms.length) return "draft";

  const hasWordpress =
    Number.isInteger(Number(publication.wordpress?.postId)) &&
    Number(publication.wordpress.postId) > 0;

  const hasInstagram = Boolean(
    String(publication.instagram?.mediaId || "").trim()
  );

  const verifiedPlatforms = [
    platforms.includes("wordpress") && hasWordpress,
    platforms.includes("instagram") && hasInstagram,
  ].filter(Boolean).length;

  if (verifiedPlatforms === platforms.length) return "complete";
  if (verifiedPlatforms > 0) return "partial";

  const hasScheduledDate = platforms.some((platform) =>
    platform === "wordpress"
      ? Boolean(publication.wordpress?.publicationDate)
      : Boolean(publication.instagram?.publicationDate)
  );

  return hasScheduledDate ? "scheduled" : "draft";
};

// Impide guardar `complete` o `partial` solo porque exista una URL.
communicationPublicationSchema.pre("validate", function (next) {
  if (this.status !== "error") {
    this.status = calculateVerifiedStatus(this);
  }

  next();
});

/* =========================================================
   ÍNDICES
========================================================= */

communicationPublicationSchema.index({ programs: 1 });
communicationPublicationSchema.index({ dispositives: 1 });
communicationPublicationSchema.index({ platforms: 1 });
communicationPublicationSchema.index({ "wordpress.publicationDate": -1 });
communicationPublicationSchema.index({ "instagram.publicationDate": -1 });
communicationPublicationSchema.index({ "wordpress.publishedAt": 1 });
communicationPublicationSchema.index({ "instagram.publishedAt": 1 });
communicationPublicationSchema.index({
  platforms: 1,
  "wordpress.postId": 1,
  "wordpress.publicationDate": 1,
});
communicationPublicationSchema.index({
  platforms: 1,
  "instagram.mediaId": 1,
  "instagram.publicationDate": 1,
});

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
