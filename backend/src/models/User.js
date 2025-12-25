const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
    },
    password: {
      type: String,
      required: true, // bcrypt hashed
    },
    role: {
      type: String,
      enum: ['admin', 'operator', 'viewer'],
      default: 'viewer',
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ active: 1 });
userSchema.index({ role: 1 });

// Method to convert to safe object (without password)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
