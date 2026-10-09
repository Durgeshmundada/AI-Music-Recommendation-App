// ===============================
// Recommendation Engine
// Production-Ready Version with Caching
// ===============================

const Song = require('../models/Song');
const Recommendation = require('../models/Recommendation');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

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

  features.forEach(feature => {
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

// Generate recommendations for a song
async function generateRecommendations(songId, userId, n = 10) {
  try {
    // Validate inputs
    if (!songId || !userId) {
      throw new Error('songId and userId required');
    }

    if (n < 1 || n > 50) {
      throw new Error('n must be between 1 and 50');
    }

    // Get source song (select only needed fields)
    const sourceSong = await Song.findById(songId).select(
      'energy valence danceability acousticness instrumentalness'
    );

    if (!sourceSong) {
      throw new Error('Song not found');
    }

    // Get candidate songs (batch query is more efficient)
    const candidateSongs = await Song.find({ _id: { $ne: songId } })
      .select('energy valence danceability acousticness instrumentalness')
      .lean()
      .exec();

    if (!candidateSongs.length) {
      logger.warn(`No candidate songs found for recommendation`);
      return [];
    }

    // Calculate similarity scores
    const scored = candidateSongs.map(song => {
      const similarity = cosineSimilarity(sourceSong, song);
      return {
        recommendedSong: song._id,
        sourcesSong: songId,
        user: userId,
        finalScore: similarity,
        strength: Math.round(similarity * 100),
        algorithms: {
          contentBased: similarity,
          collaborative: 0,
          deepLearning: 0,
          mood: 0,
          trending: 0,
          timeOfDay: 0,
        },
        reasons: ['Similar audio features'],
      };
    });

    // Sort by score and take top N
    const recommendations = scored
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, n);

    return recommendations;
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
    // Check cache first
    const cacheKey = `recommendations:${userId}:${songId}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug(`Cache hit for recommendations: ${cacheKey}`);
      return JSON.parse(cached);
    }

    // Generate recommendations
    const recommendations = await generateRecommendations(songId, userId, n);

    // Prepare payloads for database
    const bulkOps = recommendations.map(rec => ({
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

    // Bulk write to database
    if (bulkOps.length > 0) {
      await Recommendation.bulkWrite(bulkOps);
    }

    // Fetch from database with population
    const dbRecommendations = await Recommendation.find({
      sourcesSong: songId,
      user: userId,
    })
      .populate('recommendedSong', 'name artist imageUrl popularity')
      .limit(n)
      .sort({ finalScore: -1 })
      .lean()
      .exec();

    // Cache result
    await cache.set(cacheKey, JSON.stringify(dbRecommendations), 3600); // 1 hour TTL

    return dbRecommendations;
  } catch (error) {
    logger.error('Error fetching recommendations with cache:', error);
    throw error;
  }
}

// Invalidate cache for a user
async function invalidateUserCache(userId) {
  try {
    const pattern = `recommendations:${userId}:*`;
    await cache.deletePattern(pattern);
    logger.info(`Invalidated cache for user: ${userId}`);
  } catch (error) {
    logger.error('Error invalidating cache:', error);
    // Don't throw - cache errors shouldn't break the app
  }
}

module.exports = {
  cosineSimilarity,
  generateRecommendations,
  getRecommendationsWithCache,
  invalidateUserCache,
};
