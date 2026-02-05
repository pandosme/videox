const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (key already has unique index from schema definition)

// Static method to get config value
systemConfigSchema.statics.getValue = async function (key, defaultValue = null) {
  const config = await this.findOne({ key });
  return config ? config.value : defaultValue;
};

// Static method to set config value
systemConfigSchema.statics.setValue = async function (key, value, userId = null) {
  const config = await this.findOneAndUpdate(
    { key },
    { value, updatedBy: userId },
    { new: true, upsert: true }
  );
  return config;
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
