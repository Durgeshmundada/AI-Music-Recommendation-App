const Recommendation = require('../models/Recommendation');
const Song = require('../models/Song');
const User = require('../models/User');
const {
  getRecommendationsWithCache,
  invalidateUserCache,
} = require('../utils/recommendationEngine');

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// Fetch existing recommendations for a song for the current user
exports.getRecommendations = async (req, res) => {
  try {
    const { songId, n = 10 } = req.query;

    if (!songId) {
      return res.status(400).json({ message: 'Song ID required' });
    }

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const limit = toBoundedInt(n, 10, 1, 50);

    const recommendations = await Recommendation.find({
      sourcesSong: songId,
      user: req.user._id,
    })
      .populate('recommendedSong')
      .limit(limit)
      .sort({ finalScore: -1 });

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get recommendations', error: error.message });
  }
};

// Generate fresh recommendations using taste-aware engine + cache
exports.getSmartRecommendations = async (req, res) => {
  try {
    const { songId, n = 10 } = req.query;

    if (!songId) {
      return res.status(400).json({ message: 'Song ID required' });
    }

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const limit = toBoundedInt(n, 10, 1, 50);
    const recommendations = await getRecommendationsWithCache(songId, req.user._id, limit);

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate smart recommendations', error: error.message });
  }
};

// Build a personalized set using recent listening seeds
exports.getForYouRecommendations = async (req, res) => {
  try {
    const { n = 12 } = req.query;
    const limit = toBoundedInt(n, 12, 1, 30);

    const user = await User.findById(req.user._id)
      .select('listeningHistory')
      .lean()
      .exec();

    const recentSongIds = [...new Set(
      (user?.listeningHistory || [])
        .slice(-20)
        .reverse()
        .map((entry) => String(entry.songId))
        .filter(Boolean)
    )].slice(0, 3);

    // Fallback seed from trending songs if no history exists
    if (!recentSongIds.length) {
      const seedSongs = await Song.find()
        .sort({ featuredRank: -1, popularity: -1 })
        .limit(1)
        .select('_id')
        .lean();
      if (seedSongs.length) {
        recentSongIds.push(String(seedSongs[0]._id));
      }
    }

    if (!recentSongIds.length) {
      return res.json({
        success: true,
        count: 0,
        recommendations: [],
      });
    }

    const merged = [];
    for (const seedSongId of recentSongIds) {
      // eslint-disable-next-line no-await-in-loop
      const recs = await getRecommendationsWithCache(seedSongId, req.user._id, limit);
      merged.push(...recs);
    }

    const seen = new Set();
    const unique = [];
    merged
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .forEach((rec) => {
        const id = String(rec?.recommendedSong?._id || rec?.recommendedSong || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        unique.push(rec);
      });

    res.json({
      success: true,
      count: Math.min(unique.length, limit),
      recommendations: unique.slice(0, limit),
      seeds: recentSongIds,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate for-you recommendations', error: error.message });
  }
};

// Generate a mood-based playlist similar to Spotify mood mixes
exports.getMoodPlaylist = async (req, res) => {
  try {
    const { mood, minutes = 30 } = req.query;

    if (!mood) {
      return res.status(400).json({ message: 'Mood is required' });
    }

    const targetMinutes = toBoundedInt(minutes, 30, 5, 240);
    const targetMs = targetMinutes * 60 * 1000;

    const fullTracks = { $or: [{ audioUrl: { $type: 'string', $ne: '' } }, { youtubeVideoId: { $type: 'string', $ne: '' } }] };
    let songs = await Song.find({ mood, ...fullTracks })
      .sort({ popularity: -1 })
      .limit(200);

    if (!songs.length) {
      songs = await Song.find(fullTracks).sort({ featuredRank: -1, popularity: -1 }).limit(200);
    }

    const playlist = [];
    let totalDuration = 0;

    for (const song of songs) {
      if (totalDuration >= targetMs) break;
      playlist.push(song);
      totalDuration += song.duration || 0;
    }

    res.json({
      success: true,
      mood,
      requestedMinutes: targetMinutes,
      actualMinutes: Math.round(totalDuration / 60000),
      count: playlist.length,
      songs: playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate mood playlist', error: error.message });
  }
};

exports.trackRecommendation = async (req, res) => {
  try {
    const { recommendationId } = req.params;
    const { action, duration } = req.body;
    const allowedActions = ['clicked', 'played', 'skipped'];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({ message: 'Invalid action value' });
    }

    const update = { [action]: true };
    if (action === 'played') {
      update.playDuration = toBoundedInt(duration, 0, 0, 7200);
    }

    const recommendation = await Recommendation.findByIdAndUpdate(
      recommendationId,
      update,
      { new: true }
    );

    if (!recommendation) {
      return res.status(404).json({ message: 'Recommendation not found' });
    }

    res.json({
      success: true,
      message: 'Recommendation tracked',
      recommendation,
    });

    if (recommendation.user) {
      invalidateUserCache(recommendation.user.toString()).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to track recommendation', error: error.message });
  }
};
