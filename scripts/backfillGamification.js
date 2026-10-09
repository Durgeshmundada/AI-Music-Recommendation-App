/* eslint-disable no-console */
const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');

dotenv.config();

const DEFAULT_GAMIFICATION = {
  totalXp: 0,
  challengeStreak: 0,
  challengesCompleted: 0,
  lastChallengeClaimDate: null,
};

async function run() {
  await connectDB();

  const result = await User.updateMany(
    {
      $or: [
        { gamification: { $exists: false } },
        { 'gamification.totalXp': { $exists: false } },
        { 'gamification.challengeStreak': { $exists: false } },
        { 'gamification.challengesCompleted': { $exists: false } },
      ],
    },
    {
      $set: {
        gamification: DEFAULT_GAMIFICATION,
      },
    }
  );

  console.log(`Gamification backfill complete. Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`);
  process.exit(0);
}

run().catch((error) => {
  console.error('Gamification backfill failed:', error);
  process.exit(1);
});
