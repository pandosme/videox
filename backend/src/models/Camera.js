const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    port: {
      type: Number,
      default: 554,
      min: 1,
      max: 65535,
    },
    credentials: {
      username: {
        type: String,
        required: true,
      },
      password: {
        type: String,
        required: true, // AES-256 encrypted
      },
    },
    streamSettings: {
      resolution: {
        type: String,
        default: '1920x1080',
      },
      videoCodec: {
        type: String,
        enum: ['h264', 'h265'],
        default: 'h264',
      },
      fps: {
        type: Number,
        min: 5,
        max: 30,
        default: 25,
      },
      streamProfile: {
        type: String,
        enum: ['Quality', 'Balanced', 'Bandwidth', 'Zipstream'],
        default: 'Quality',
      },
      zipstreamEnabled: {
        type: Boolean,
        default: true,
      },
      enableAudio: {
        type: Boolean,
        default: false,
      },
    },
    recordingSettings: {
      mode: {
        type: String,
        enum: ['continuous', 'motion', 'scheduled', 'disabled'],
        default: 'continuous',
      },
      schedule: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      preBuffer: {
        type: Number,
        min: 5,
        max: 30,
        default: 5,
      },
      postBuffer: {
        type: Number,
        min: 5,
        max: 30,
        default: 10,
      },
    },
    retentionDays: {
      type: Number,
      default: null, // null = use global default
    },
    storageQuotaGB: {
      type: Number,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    metadata: {
      model: String,
      firmware: String,
      location: String,
      tags: [String],
      capabilities: {
        ptz: {
          type: Boolean,
          default: false,
        },
        audio: {
          type: Boolean,
          default: false,
        },
        profiles: [String],
      },
    },
    status: {
      connectionState: {
        type: String,
        enum: ['online', 'offline', 'connecting', 'error'],
        default: 'offline',
      },
      lastSeen: Date,
      recordingState: {
        type: String,
        enum: ['recording', 'paused', 'stopped', 'error'],
        default: 'stopped',
      },
      currentBitrate: Number,
      currentFps: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
cameraSchema.index({ active: 1 });
cameraSchema.index({ 'status.connectionState': 1 });
cameraSchema.index({ 'metadata.tags': 1 });

module.exports = mongoose.model('Camera', cameraSchema);
