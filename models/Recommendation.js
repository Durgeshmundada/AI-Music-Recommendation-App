const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sourcesSong: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
    required: true,
  },
  recommendedSong: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
    required: true,
  },
  algorithms: {
    contentBased: { type: Number, min: 0, max: 1 },
    collaborative: { type: Number, min: 0, max: 1 },
    deepLearning: { type: Number, min: 0, max: 1 },
    mood: { type: Number, min: 0, max: 1 },
    trending: { type: Number, min: 0, max: 1 },
    timeOfDay: { type: Number, min: 0, max: 1 },
  },
  finalScore: { type: Number, min: 0, max: 1 },
  strength: { type: Number, min: 0, max: 100 }, // 0-100 scale
  reasons: [String], // Why this was recommended
  clicked: { type: Boolean, default: false },
  played: { type: Boolean, default: false },
  playDuration: { type: Number, default: 0 }, // seconds
  skipped: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
