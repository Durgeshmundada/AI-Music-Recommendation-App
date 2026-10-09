const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide song name'],
    index: true,
  },
  artist: {
    type: String,
    required: [true, 'Please provide artist name'],
    index: true,
  },
  album: String,
  genre: {
    type: String,
    required: true,
    index: true,
  },
  duration: {
    type: Number,
    required: true, // in milliseconds
  },
  // Audio Features
  energy: { type: Number, min: 0, max: 1 },
  valence: { type: Number, min: 0, max: 1 },
  danceability: { type: Number, min: 0, max: 1 },
  tempo: { type: Number }, // BPM
  acousticness: { type: Number, min: 0, max: 1 },
  instrumentalness: { type: Number, min: 0, max: 1 },
  speechiness: { type: Number, min: 0, max: 1 },
  liveness: { type: Number, min: 0, max: 1 },
  loudness: { type: Number },
  mode: { type: Number, enum: [0, 1] }, // 0=Minor, 1=Major
  popularity: {
    type: Number,
    min: 0,
    max: 100,
  },
  explicit: { type: Boolean, default: false },
  // Recommendation System
  mood: {
    type: String,
    enum: ['happy', 'sad', 'energetic', 'calm', 'party', 'romantic', 'workout', 'focus'],
  },
  moodConfidence: { type: Number, min: 0, max: 1 },
  spotifyId: String,
  imageUrl: String,
  previewUrl: String,
  audioUrl: String,
  youtubeVideoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
  youtubeChannel: String,
  youtubeChannelId: String,
  featuredRank: { type: Number, default: 0 },
  featuresEstimated: { type: Boolean, default: false },
  source: { type: String, enum: ['upload', 'incompetech', 'itunes', 'youtube', 'legacy'], default: 'legacy', index: true },
  sourceId: String,
  license: String,
  licenseUrl: String,
  attribution: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  storageKey: { type: String, select: false },
  fileSize: { type: Number, select: false },
  fileHash: { type: String, select: false },
  deletedAt: { type: Date, default: null, select: false },
  externalUrl: String,
  playCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for faster queries
songSchema.index({ artist: 1, genre: 1 });
songSchema.index({ energy: 1, valence: 1, tempo: 1 });
songSchema.index({ source: 1, sourceId: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: 'string' } } });
songSchema.index({ uploadedBy: 1, fileHash: 1 }, { unique: true, partialFilterExpression: { fileHash: { $type: 'string' }, deletedAt: null } });

// A deleted track stays as a tombstone so catalog imports cannot resurrect it.
songSchema.pre(/^find/, function () { this.where({ deletedAt: null }); });
songSchema.pre('countDocuments', function () { this.where({ deletedAt: null }); });
songSchema.pre('distinct', function () { this.where({ deletedAt: null }); });

module.exports = mongoose.model('Song', songSchema);
