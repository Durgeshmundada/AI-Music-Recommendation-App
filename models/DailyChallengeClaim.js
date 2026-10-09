const mongoose = require('mongoose');

const dailyChallengeClaimSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  key: {
    type: String,
    required: true,
    index: true,
  },
  xp: {
    type: Number,
    required: true,
    min: 0,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

dailyChallengeClaimSchema.index({ user: 1, key: 1 }, { unique: true });
dailyChallengeClaimSchema.index({ claimedAt: -1 });

module.exports = mongoose.model('DailyChallengeClaim', dailyChallengeClaimSchema);
