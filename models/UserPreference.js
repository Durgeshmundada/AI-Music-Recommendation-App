const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  // Mood preferences
  moodDistribution: {
    happy: { type: Number, default: 0.125 },
    sad: { type: Number, default: 0.125 },
    energetic: { type: Number, default: 0.125 },
    calm: { type: Number, default: 0.125 },
    party: { type: Number, default: 0.125 },
    romantic: { type: Number, default: 0.125 },
    workout: { type: Number, default: 0.125 },
    focus: { type: Number, default: 0.125 },
  },
  // Feature preferences
  preferredEnergy: { type: Number, min: 0, max: 1 },
  preferredTempo: { type: Number },
  preferredAcousticness: { type: Number, min: 0, max: 1 },
  // Genre preferences
  topGenres: [{
    genre: String,
    score: Number,
  }],
  // Artist preferences
  topArtists: [{
    artist: String,
    score: Number,
  }],
  // Algorithm weights (for personalization)
  algorithmWeights: {
    contentBased: { type: Number, default: 0.40 },
    collaborative: { type: Number, default: 0.25 },
    deepLearning: { type: Number, default: 0.20 },
    mood: { type: Number, default: 0.15 },
  },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('UserPreference', userPreferenceSchema);
