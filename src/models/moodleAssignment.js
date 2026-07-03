const mongoose = require("mongoose");

const { Schema } = mongoose;

const moodleAssignmentSchema = new Schema(
  {
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    assignmentType: {
      type: String,
      enum: ["course-enrolment", "system-role"],
      required: true,
      index: true,
    },

    operation: {
      type: String,
      enum: ["enrol", "unenrol", "assign", "unassign"],
      required: true,
      index: true,
    },

    courseId: {
      type: Number,
      default: null,
      index: true,
    },

    courseName: {
      type: String,
      default: "",
      trim: true,
    },

    roleId: {
      type: Number,
      required: true,
      index: true,
    },

    roleName: {
      type: String,
      default: "",
      trim: true,
    },

    criteria: {
      userIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],

      filters: {
        allActive: {
          type: Boolean,
          default: false,
        },

        dispositiveIds: [
          {
            type: Schema.Types.ObjectId,
            ref: "Dispositive",
          },
        ],

        positionIds: [
          {
            type: Schema.Types.ObjectId,
            ref: "Jobs",
          },
        ],

        areas: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    },

    affectedUsers: [
      {
        _id: false,

        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        moodleId: {
          type: Number,
          required: true,
        },
      },
    ],

    affectedCount: {
      type: Number,
      default: 0,
    },

    selectedCount: {
      type: Number,
      default: 0,
    },

    skippedCount: {
      type: Number,
      default: 0,
    },

    errorCount: {
      type: Number,
      default: 0,
    },

    undoneAt: {
      type: Date,
      default: null,
    },

    undoneBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    undoneByAssignment: {
      type: Schema.Types.ObjectId,
      ref: "MoodleAssignment",
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

moodleAssignmentSchema.index({
  assignmentType: 1,
  courseId: 1,
  roleId: 1,
  active: 1,
});

moodleAssignmentSchema.index({
  assignmentType: 1,
  roleId: 1,
  active: 1,
});

moodleAssignmentSchema.index({
  "affectedUsers.user": 1,
  assignmentType: 1,
  courseId: 1,
  roleId: 1,
  active: 1,
});

moodleAssignmentSchema.index({
  createdAt: -1,
});

module.exports = mongoose.model("MoodleAssignment", moodleAssignmentSchema);