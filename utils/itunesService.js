const axios = require('axios');

const ITUNES_URL = 'https://itunes.apple.com/search';

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

function inferMood(genre, fallbackMood = 'happy') {
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

function mapITunesTrackToSong(item) {
  const genre = mapGenre(item.primaryGenreName);
  const mood = inferMood(genre);
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
  };
}

function normalizeTrack(item) {
  if (!item || !item.trackName || !item.artistName || !item.previewUrl) return null;
  return mapITunesTrackToSong(item);
}

async function fetchITunesTracks({ term, country = 'IN', limit = 40 }) {
  const response = await axios.get(ITUNES_URL, {
    params: {
      term,
      media: 'music',
      entity: 'song',
      country,
      limit: clamp(limit, 1, 60),
    },
    timeout: 20000,
  });

  return (response.data.results || [])
    .map(normalizeTrack)
    .filter(Boolean);
}

async function searchAndNormalizeITunesTracks({ query, limit = 30 }) {
  const q = String(query || '').trim();
  if (!q) return [];

  const [india, indiaHindi, us] = await Promise.all([
    fetchITunesTracks({ term: q, country: 'IN', limit }),
    fetchITunesTracks({ term: `${q} hindi bollywood`, country: 'IN', limit: Math.max(10, Math.floor(limit / 2)) }),
    fetchITunesTracks({ term: q, country: 'US', limit: Math.max(10, Math.floor(limit / 2)) }),
  ]);

  const merged = [...india, ...indiaHindi, ...us];
  const seen = new Set();
  const deduped = [];

  merged.forEach((song) => {
    const key = `${song.name}:${song.artist}:${song.album}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(song);
  });

  return deduped.slice(0, clamp(limit * 2, 1, 100));
}

module.exports = {
  searchAndNormalizeITunesTracks,
};
