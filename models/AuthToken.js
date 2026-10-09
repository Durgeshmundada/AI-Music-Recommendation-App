const mongoose = require('mongoose');

const authTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['password_reset', 'email_verify'],
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  usedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// TTL cleanup once token expiry is reached.
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ user: 1, type: 1, usedAt: 1 });

module.exports = mongoose.model('AuthToken', authTokenSchema);
