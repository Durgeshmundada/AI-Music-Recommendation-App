const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide playlist name'],
  },
  description: String,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  songs: [{
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
    },
    addedAt: { type: Date, default: Date.now },
  }],
  isPublic: {
    type: Boolean,
    default: false,
  },
  mood: {
    type: String,
    enum: ['happy', 'sad', 'energetic', 'calm', 'party', 'romantic', 'workout', 'focus'],
  },
  tags: [String],
  thumbnail: String,
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Playlist', playlistSchema);
