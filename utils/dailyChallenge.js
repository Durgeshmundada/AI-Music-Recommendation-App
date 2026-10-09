const moods = ['happy', 'sad', 'energetic', 'calm', 'party', 'romantic', 'workout', 'focus'];
const xpRewards = [120, 140, 160, 180, 200, 220];

function toDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function seedFromDateKey(key) {
  const date = parseDateKey(key);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return year * 10000 + month * 100 + day;
}

function challengeFromDateKey(key) {
  const seed = seedFromDateKey(key);
  if (!seed) return null;

  const targetMood = moods[seed % moods.length];
  const targetPlays = 5 + (seed % 3);
  const targetArtists = 3 + ((seed >> 1) % 3);
  const targetHighEnergy = 1 + ((seed >> 2) % 2);
  const rewardXp = xpRewards[seed % xpRewards.length];

  return {
    key,
    targetMood,
    targetPlays,
    targetArtists,
    targetHighEnergy,
    rewardXp,
  };
}

function previousDateKey(key) {
  const date = parseDateKey(key);
  if (!date) return null;
  const previous = new Date(date.getTime() - (24 * 60 * 60 * 1000));
  return toDateKey(previous);
}

module.exports = {
  toDateKey,
  parseDateKey,
  challengeFromDateKey,
  previousDateKey,
};
