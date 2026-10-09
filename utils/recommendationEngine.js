// ===============================
// Recommendation Engine
// Production-Ready Version with Caching + Taste Profiling
// ===============================

const Song = require('../models/Song');
const User = require('../models/User');
const Recommendation = require('../models/Recommendation');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function toPercent(value) {
  return Math.round(clamp(value) * 100);
}

// Calculate cosine similarity between two songs
function cosineSimilarity(song1, song2) {
  const features = [
    'energy',
    'valence',
    'danceability',
    'acousticness',
    'instrumentalness',
  ];

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  features.forEach((feature) => {
    const val1 = song1[feature] || 0;
    const val2 = song2[feature] || 0;
    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  });

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
}

function incrementCount(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntries(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

async function buildTasteProfile(userId) {
  const profile = {
    avg: {
      energy: 0.5,
      valence: 0.5,
      danceability: 0.5,
      acousticness: 0.5,
      instrumentalness: 0.5,
    },
    topGenres: [],
    topMoods: [],
    topArtists: [],
  };

  const user = await User.findById(userId).select('listeningHistory').lean().exec();
  const history = (user?.listeningHistory || []).slice(-150);
  if (!history.length) {
    return profile;
  }

  const uniqueSongIds = [...new Set(history.map((entry) => String(entry.songId)).filter(Boolean))];
  if (!uniqueSongIds.length) {
    return profile;
  }

  const songs = await Song.find({ _id: { $in: uniqueSongIds } })
    .select('energy valence danceability acousticness instrumentalness genre mood artist')
    .lean()
    .exec();

  if (!songs.length) {
    return profile;
  }

  const byId = new Map(songs.map((song) => [String(song._id), song]));
  const genreCounts = new Map();
  const moodCounts = new Map();
  const artistCounts = new Map();

  let total = 0;
  const sum = {
    energy: 0,
    valence: 0,
    danceability: 0,
    acousticness: 0,
    instrumentalness: 0,
  };

  history.forEach((entry) => {
    const song = byId.get(String(entry.songId));
    if (!song) return;

    total += 1;
    sum.energy += song.energy || 0;
    sum.valence += song.valence || 0;
    sum.danceability += song.danceability || 0;
    sum.acousticness += song.acousticness || 0;
    sum.instrumentalness += song.instrumentalness || 0;

    incrementCount(genreCounts, song.genre);
    incrementCount(moodCounts, song.mood);
    incrementCount(artistCounts, song.artist);
  });

  if (total > 0) {
    profile.avg = {
      energy: sum.energy / total,
      valence: sum.valence / total,
      danceability: sum.danceability / total,
      acousticness: sum.acousticness / total,
      instrumentalness: sum.instrumentalness / total,
    };
  }

  profile.topGenres = topEntries(genreCounts, 4);
  profile.topMoods = topEntries(moodCounts, 4);
  profile.topArtists = topEntries(artistCounts, 6);

  return profile;
}

function similarityToProfile(candidate, profile) {
  return cosineSimilarity(candidate, profile.avg);
}

function buildReasons({ sourceSong, candidate, profile, components }) {
  const reasons = [];

  if (components.contentBased >= 0.78) {
    reasons.push('Very close audio DNA');
  } else if (components.contentBased >= 0.62) {
    reasons.push('Strong audio-feature match');
  }

  if (candidate.genre && candidate.genre === sourceSong.genre) {
    reasons.push('Same genre as your source track');
  }

  if (candidate.mood && candidate.mood === sourceSong.mood) {
    reasons.push('Shares the same mood profile');
  }

  if (candidate.artist && profile.topArtists.includes(candidate.artist)) {
    reasons.push('Artist appears in your recent listening');
  }

  if (candidate.genre && profile.topGenres.includes(candidate.genre)) {
    reasons.push('Genre matches your recent taste');
  }

  if (candidate.mood && profile.topMoods.includes(candidate.mood)) {
    reasons.push('Mood aligns with your listening pattern');
  }

  if (reasons.length === 0) {
    reasons.push('Balanced recommendation from your taste profile');
  }

  return reasons.slice(0, 3);
}

// Generate recommendations for a song
async function generateRecommendations(songId, userId, n = 10) {
  try {
    if (!songId || !userId) {
      throw new Error('songId and userId required');
    }

    if (n < 1 || n > 50) {
      throw new Error('n must be between 1 and 50');
    }

    const sourceSong = await Song.findById(songId).select(
      'energy valence danceability acousticness instrumentalness genre mood artist popularity'
    );

    if (!sourceSong) {
      throw new Error('Song not found');
    }

    const [candidateSongs, tasteProfile] = await Promise.all([
      Song.find({ _id: { $ne: songId }, $or: [{ audioUrl: { $type: 'string', $ne: '' } }, { youtubeVideoId: { $type: 'string', $ne: '' } }, { previewUrl: { $type: 'string', $ne: '' } }] })
        .select('energy valence danceability acousticness instrumentalness genre mood artist popularity')
        .lean()
        .exec(),
      buildTasteProfile(userId),
    ]);

    if (!candidateSongs.length) {
      logger.warn('No candidate songs found for recommendation');
      return [];
    }

    const scored = candidateSongs.map((candidate) => {
      const contentBased = clamp(cosineSimilarity(sourceSong, candidate));
      const tasteMatch = clamp(similarityToProfile(candidate, tasteProfile));
      const mood = candidate.mood && tasteProfile.topMoods.includes(candidate.mood) ? 1 : 0;
      const genre = candidate.genre && tasteProfile.topGenres.includes(candidate.genre) ? 1 : 0;
      const artist = candidate.artist && tasteProfile.topArtists.includes(candidate.artist) ? 1 : 0;
      const trending = clamp((candidate.popularity || 0) / 100);

      const finalScore = clamp(
        (contentBased * 0.58)
        + (tasteMatch * 0.2)
        + (mood * 0.08)
        + (genre * 0.08)
        + (artist * 0.03)
        + (trending * 0.03)
      );

      const components = {
        contentBased,
        collaborative: clamp((tasteMatch + genre + mood) / 3),
        deepLearning: clamp((contentBased * 0.6) + (tasteMatch * 0.4)),
        mood,
        trending,
        timeOfDay: 0,
      };

      return {
        recommendedSong: candidate._id,
        sourcesSong: songId,
        user: userId,
        finalScore,
        strength: toPercent(finalScore),
        algorithms: components,
        reasons: buildReasons({
          sourceSong,
          candidate,
          profile: tasteProfile,
          components,
        }),
      };
    });

    return scored
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, n);
  } catch (error) {
    logger.error('Error generating recommendations:', {
      error: error.message,
      songId,
      userId,
    });
    throw error;
  }
}

// Get recommendations with caching
async function getRecommendationsWithCache(songId, userId, n = 10) {
  try {
    const cacheKey = `recommendations:v5:${userId}:${songId}:${n}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug(`Cache hit for recommendations: ${cacheKey}`);
      return JSON.parse(cached);
    }

    const recommendations = await generateRecommendations(songId, userId, n);

    const bulkOps = recommendations.map((rec) => ({
      updateOne: {
        filter: {
          user: rec.user,
          sourcesSong: rec.sourcesSong,
          recommendedSong: rec.recommendedSong,
        },
        update: { $set: rec },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await Recommendation.bulkWrite(bulkOps);
    }

    const dbRecommendations = await Recommendation.find({
      sourcesSong: songId,
      user: userId,
      recommendedSong: { $in: recommendations.map((rec) => rec.recommendedSong) },
    })
      .populate('recommendedSong', 'name artist imageUrl popularity genre mood energy valence danceability audioUrl previewUrl youtubeVideoId youtubeChannel youtubeChannelId duration source license licenseUrl attribution externalUrl')
      .limit(n)
      .sort({ finalScore: -1 })
      .lean()
      .exec();

    await cache.set(cacheKey, JSON.stringify(dbRecommendations), 60 * 30);

    return dbRecommendations;
  } catch (error) {
    logger.error('Error fetching recommendations with cache:', error);
    throw error;
  }
}

// Invalidate cache for a user
async function invalidateUserCache(userId) {
  try {
    const pattern = `recommendations:*:${userId}:*`;
    await cache.deletePattern(pattern);
    logger.info(`Invalidated cache for user: ${userId}`);
  } catch (error) {
    logger.error('Error invalidating cache:', error);
  }
}

module.exports = {
  cosineSimilarity,
  generateRecommendations,
  getRecommendationsWithCache,
  invalidateUserCache,
};
