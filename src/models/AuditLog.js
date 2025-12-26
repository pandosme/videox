const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.Mixed, // Accepts ObjectId or String (for 'admin' user)
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resource: {
      type: String,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, timestamp: -1 });

// Static method to log an action
auditLogSchema.statics.log = async function (userId, action, resource, details = {}) {
  const entry = new this({
    userId,
    action,
    resource,
    details,
    timestamp: new Date(),
  });
  return await entry.save();
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
