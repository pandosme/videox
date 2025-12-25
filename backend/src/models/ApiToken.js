const mongoose = require('mongoose');
const crypto = require('crypto');

const apiTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    lastUsed: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null, // null = never expires
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
apiTokenSchema.index({ token: 1 });
apiTokenSchema.index({ userId: 1 });
apiTokenSchema.index({ active: 1 });

// Static method to generate secure token
apiTokenSchema.statics.generateToken = function () {
  // Generate 32-byte random token, encode as base64url
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url');
};

// Method to check if token is expired
apiTokenSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to update last used timestamp
apiTokenSchema.methods.updateLastUsed = async function () {
  this.lastUsed = new Date();
  await this.save();
};

module.exports = mongoose.model('ApiToken', apiTokenSchema);
