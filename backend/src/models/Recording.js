const mongoose = require('mongoose');

/**
 * Recording Schema
 * Each document represents a single 60-second video segment
 */
const recordingSchema = new mongoose.Schema(
  {
    cameraId: {
      type: String,
      required: true,
      ref: 'Camera',
      index: true,
    },
    filename: {
      type: String,
      required: true,
      unique: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // Duration in seconds
      required: true,
    },
    size: {
      type: Number, // File size in bytes
      required: true,
    },
    status: {
      type: String,
      enum: ['recording', 'completed', 'corrupted', 'deleted'],
      default: 'recording',
      index: true,
    },
    protected: {
      type: Boolean,
      default: false,
      index: true,
    },
    eventTags: {
      type: [String],
      default: [],
      index: true,
    },
    metadata: {
      resolution: String,
      codec: String,
      bitrate: Number,
      fps: Number,
    },
    retentionDate: {
      type: Date,
      index: true, // Date when this segment should be deleted
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
recordingSchema.index({ cameraId: 1, startTime: -1 });
recordingSchema.index({ cameraId: 1, status: 1, startTime: -1 });
recordingSchema.index({ status: 1, protected: 1, retentionDate: 1 }); // For retention cleanup
recordingSchema.index({ eventTags: 1, startTime: -1 });

/**
 * Calculate retention date based on camera's retention policy
 */
recordingSchema.methods.calculateRetentionDate = function (retentionDays) {
  const retentionDate = new Date(this.startTime);
  retentionDate.setDate(retentionDate.getDate() + retentionDays);
  this.retentionDate = retentionDate;
  return retentionDate;
};

module.exports = mongoose.model('Recording', recordingSchema);
