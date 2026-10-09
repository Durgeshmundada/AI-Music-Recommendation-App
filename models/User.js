const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide your name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  phone: {
    type: String,
    // Keep optional and flexible to avoid blocking registration
    required: false,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false, // Don't return password by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  favoriteGenres: [String],
  gamification: {
    totalXp: { type: Number, default: 0 },
    challengeStreak: { type: Number, default: 0 },
    challengesCompleted: { type: Number, default: 0 },
    lastChallengeClaimDate: { type: String, default: null },
  },
  challengeHistory: [{
    key: { type: String, required: true },
    xp: { type: Number, required: true },
    claimedAt: { type: Date, default: Date.now },
  }],
  listeningHistory: [{
    songId: mongoose.Schema.Types.ObjectId,
    playedAt: { type: Date, default: Date.now },
    duration: Number, // seconds listened
  }],
  playlists: [mongoose.Schema.Types.ObjectId],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to match password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
