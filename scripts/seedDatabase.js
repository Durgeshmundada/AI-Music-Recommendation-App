require('dotenv').config();
const axios = require('axios');
const Song = require('../models/Song');
const connectDB = require('../config/db');

const ITUNES_URL = 'https://itunes.apple.com/search';
const DEFAULT_LIMIT_PER_TERM = 70;

const SEARCH_TERMS = [
  // India/Hindi-first set
  { term: 'hindi songs', mood: 'happy', country: 'IN' },
  { term: 'bollywood hits', mood: 'party', country: 'IN' },
  { term: 'arijit singh', mood: 'romantic', country: 'IN' },
  { term: 'shreya ghoshal', mood: 'romantic', country: 'IN' },
  { term: 'hindi sad songs', mood: 'sad', country: 'IN' },
  { term: 'bollywood dance', mood: 'energetic', country: 'IN' },
  { term: 'punjabi songs', mood: 'party', country: 'IN' },
  { term: 'indian indie', mood: 'focus', country: 'IN' },
  { term: 'lofi hindi', mood: 'calm', country: 'IN' },
  { term: 'devotional hindi', mood: 'calm', country: 'IN' },
  { term: 'workout hindi', mood: 'workout', country: 'IN' },
  // Broader free catalog mix
  { term: 'global pop hits', mood: 'happy', country: 'US' },
  { term: 'sad songs', mood: 'sad', country: 'US' },
  { term: 'workout music', mood: 'workout', country: 'US' },
  { term: 'focus music', mood: 'focus', country: 'US' },
  { term: 'party anthems', mood: 'party', country: 'US' },
  { term: 'romantic songs', mood: 'romantic', country: 'US' },
  { term: 'calm chill', mood: 'calm', country: 'US' },
  { term: 'dance electronic', mood: 'energetic', country: 'US' },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hashToUnit(input) {
  const value = String(input || '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function inferMood(genre, fallbackMood) {
  const g = String(genre || '').toLowerCase();
  if (g.includes('bollywood')) return fallbackMood || 'party';
  if (g.includes('hindi')) return fallbackMood || 'happy';
  if (g.includes('punjabi')) return fallbackMood || 'party';
  if (g.includes('dance') || g.includes('electronic') || g.includes('edm')) return 'energetic';
  if (g.includes('hip-hop') || g.includes('rap')) return 'workout';
  if (g.includes('r&b') || g.includes('soul')) return 'romantic';
  if (g.includes('ambient') || g.includes('classical')) return 'focus';
  if (g.includes('jazz') || g.includes('acoustic')) return 'calm';
  if (g.includes('metal') || g.includes('rock')) return 'workout';
  return fallbackMood || 'happy';
}

function mapGenre(rawGenre) {
  const value = String(rawGenre || 'music').toLowerCase();
  if (value.includes('bollywood')) return 'bollywood';
  if (value.includes('hindi')) return 'hindi';
  if (value.includes('punjabi')) return 'punjabi';
  if (value.includes('hip-hop') || value.includes('rap')) return 'hip-hop';
  if (value.includes('electronic') || value.includes('dance')) return 'electronic';
  if (value.includes('r&b') || value.includes('soul')) return 'rnb';
  if (value.includes('alternative') || value.includes('indie')) return 'indie';
  if (value.includes('rock')) return 'rock';
  if (value.includes('pop')) return 'pop';
  if (value.includes('country')) return 'country';
  if (value.includes('latin')) return 'latin';
  return value.split('/')[0].trim() || 'music';
}

function buildAudioFeatures(trackKey, mood) {
  const randA = hashToUnit(`${trackKey}:a`);
  const randB = hashToUnit(`${trackKey}:b`);
  const randC = hashToUnit(`${trackKey}:c`);

  const presets = {
    happy: { energy: 0.7, valence: 0.8, danceability: 0.75, acousticness: 0.2, tempo: 118 },
    sad: { energy: 0.35, valence: 0.2, danceability: 0.45, acousticness: 0.6, tempo: 82 },
    energetic: { energy: 0.88, valence: 0.65, danceability: 0.8, acousticness: 0.12, tempo: 128 },
    calm: { energy: 0.3, valence: 0.45, danceability: 0.4, acousticness: 0.7, tempo: 78 },
    party: { energy: 0.84, valence: 0.78, danceability: 0.86, acousticness: 0.1, tempo: 124 },
    romantic: { energy: 0.45, valence: 0.55, danceability: 0.62, acousticness: 0.45, tempo: 94 },
    workout: { energy: 0.92, valence: 0.62, danceability: 0.78, acousticness: 0.08, tempo: 132 },
    focus: { energy: 0.38, valence: 0.4, danceability: 0.35, acousticness: 0.72, tempo: 74 },
  };

  const base = presets[mood] || presets.happy;

  return {
    energy: clamp(base.energy + ((randA - 0.5) * 0.2), 0, 1),
    valence: clamp(base.valence + ((randB - 0.5) * 0.25), 0, 1),
    danceability: clamp(base.danceability + ((randC - 0.5) * 0.2), 0, 1),
    acousticness: clamp(base.acousticness + ((randA - 0.5) * 0.2), 0, 1),
    instrumentalness: clamp(randB * 0.25, 0, 1),
    speechiness: clamp(0.03 + (randC * 0.14), 0, 1),
    liveness: clamp(0.08 + (randA * 0.28), 0, 1),
    tempo: Math.round(clamp(base.tempo + ((randB - 0.5) * 18), 55, 180)),
    loudness: -Math.round((4 + (randC * 8)) * 100) / 100,
    mode: randA > 0.45 ? 1 : 0,
  };
}

async function fetchTerm({ term, mood, country = 'US', limit = DEFAULT_LIMIT_PER_TERM }) {
  const response = await axios.get(ITUNES_URL, {
    params: {
      term,
      media: 'music',
      entity: 'song',
      country,
      limit,
    },
    timeout: 20000,
  });

  return (response.data.results || []).map((item) => ({
    ...item,
    _seedMood: mood,
    _seedCountry: country,
  }));
}

const seedSongs = async () => {
  try {
    await connectDB();

    const shouldReset = process.argv.includes('--reset');

    console.log(`Fetching from iTunes (${SEARCH_TERMS.length} terms)...`);
    const termResults = await Promise.all(SEARCH_TERMS.map((entry) => fetchTerm(entry)));

    const flattened = termResults.flat();
    const uniqueTracks = [];
    const seenKeys = new Set();

    flattened.forEach((item) => {
      if (!item.previewUrl) return;

      const dedupeKey = `${item.trackId || ''}:${item.trackName || ''}:${item.artistName || ''}`
        .toLowerCase();

      if (!dedupeKey || seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);
      uniqueTracks.push(item);
    });

    const mappedSongs = uniqueTracks.slice(0, 800).map((item) => {
      const genre = mapGenre(item.primaryGenreName);
      const mood = inferMood(genre, item._seedMood);
      const key = `${item.trackId || item.trackName}:${item.artistName}`;
      const features = buildAudioFeatures(key, mood);
      const popularity = Math.round(50 + (hashToUnit(key) * 50));

      return {
        name: item.trackName,
        artist: item.artistName,
        album: item.collectionName || 'Unknown Album',
        genre,
        duration: item.trackTimeMillis || 180000,
        ...features,
        popularity,
        explicit: item.trackExplicitness === 'explicit',
        mood,
        moodConfidence: 0.75,
        spotifyId: null,
        imageUrl: (item.artworkUrl100 || '').replace('100x100bb.jpg', '512x512bb.jpg'),
        previewUrl: item.previewUrl,
        externalUrl: item.trackViewUrl,
        source: 'itunes',
        sourceId: String(item.trackId),
      };
    });

    if (!mappedSongs.length) {
      throw new Error('No playable tracks fetched from seed source');
    }

    if (shouldReset) {
      await Song.deleteMany({ source: 'itunes' });
      await Song.insertMany(mappedSongs, { ordered: false });
    } else {
      const bulkOps = mappedSongs.map((song) => ({
        updateOne: {
          filter: { source: song.source, sourceId: song.sourceId },
          update: { $setOnInsert: song },
          upsert: true,
        },
      }));
      await Song.bulkWrite(bulkOps, { ordered: false });
    }

    const moodCounts = mappedSongs.reduce((acc, song) => {
      acc[song.mood] = (acc[song.mood] || 0) + 1;
      return acc;
    }, {});

    const totalInDb = await Song.countDocuments({});
    const hindiInDb = await Song.countDocuments({
      $or: [
        { genre: { $in: ['hindi', 'bollywood', 'punjabi'] } },
        { name: { $regex: 'hindi|bollywood|punjabi', $options: 'i' } },
      ],
    });

    console.log(`Fetched ${mappedSongs.length} unique songs with playable previews.`);
    console.log('Mood distribution:', moodCounts);
    console.log(`Total songs in DB: ${totalInDb}`);
    console.log(`Hindi/Bollywood/Punjabi songs in DB: ${hindiInDb}`);
    console.log(`Database ${shouldReset ? 'reseeded' : 'expanded'} successfully`);
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
};

seedSongs();
