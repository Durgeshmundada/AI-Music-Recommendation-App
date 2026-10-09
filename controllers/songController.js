const Song = require('../models/Song');
const User = require('../models/User');
const cache = require('../utils/cache');
const { searchAndNormalizeITunesTracks } = require('../utils/itunesService');

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toBoundedFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa.length) return bb.length;
  if (!bb.length) return aa.length;

  const matrix = Array.from({ length: aa.length + 1 }, () => new Array(bb.length + 1).fill(0));

  for (let i = 0; i <= aa.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bb.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aa.length][bb.length];
}

function fuzzySimilarity(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q.length || !t.length) return 0;

  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 0.88;

  const dist = levenshteinDistance(q, t);
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - (dist / maxLen));
}

function buildSongFilter({ genre, mood, minEnergy, maxEnergy }) {
  const filter = {};
  if (genre) filter.genre = genre;
  if (mood) filter.mood = mood;

  if (minEnergy !== null || maxEnergy !== null) {
    filter.energy = {};
    if (minEnergy !== null) filter.energy.$gte = minEnergy;
    if (maxEnergy !== null) filter.energy.$lte = maxEnergy;
  }

  return filter;
}

function buildSort(sortValue) {
  const map = {
    popular: { featuredRank: -1, popularity: -1, _id: 1 },
    latest: { createdAt: -1 },
    energy: { energy: -1, popularity: -1 },
    dance: { danceability: -1, popularity: -1 },
    tempo: { tempo: -1, popularity: -1 },
  };

  return map[sortValue] || map.popular;
}

function buildSearchScorer(query, song) {
  const normalizedQuery = normalizeText(query);
  const name = normalizeText(song.name);
  const artist = normalizeText(song.artist);

  const nameScore = fuzzySimilarity(normalizedQuery, name);
  const artistScore = fuzzySimilarity(normalizedQuery, artist);

  const tokenHits = normalizedQuery
    .split(' ')
    .filter(Boolean)
    .reduce((sum, token) => {
      if (name.includes(token)) return sum + 1;
      if (artist.includes(token)) return sum + 0.8;
      return sum;
    }, 0);

  const tokenScore = normalizedQuery ? Math.min(tokenHits / normalizedQuery.split(' ').filter(Boolean).length, 1) : 0;
  const popularity = (song.popularity || 0) / 100;

  return (nameScore * 0.48) + (artistScore * 0.3) + (tokenScore * 0.12) + (popularity * 0.1);
}

async function buildRecentSongsForUser(userId, limit, includeResume = false) {
  const user = await User.findById(userId)
    .select('listeningHistory')
    .lean()
    .exec();

  const history = user?.listeningHistory || [];
  if (!history.length) return [];

  const latestBySong = new Map();

  history.forEach((entry) => {
    const songId = String(entry.songId || '');
    if (!songId) return;

    const playedAt = entry.playedAt ? new Date(entry.playedAt) : new Date(0);
    const existing = latestBySong.get(songId);

    if (!existing || playedAt > existing.playedAt) {
      latestBySong.set(songId, {
        songId,
        playedAt,
        duration: toBoundedInt(entry.duration, 0, 0, 3600),
      });
    }
  });

  const ordered = [...latestBySong.values()]
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, limit);

  const songs = await Song.find({ _id: { $in: ordered.map((item) => item.songId) } })
    .lean()
    .exec();
  const songById = new Map(songs.map((song) => [String(song._id), song]));

  return ordered
    .map((item) => {
      const song = songById.get(item.songId);
      if (!song) return null;
      return {
        ...song,
        lastPlayedAt: item.playedAt,
        ...(includeResume ? { resumeFromSec: item.duration || 0 } : {}),
      };
    })
    .filter(Boolean);
}

exports.getAllSongs = async (req, res) => {
  try {
    const {
      genre,
      mood,
      sort = 'popular',
      minEnergy,
      maxEnergy,
      limit = 50,
      skip = 0,
    } = req.query;

    const boundedLimit = toBoundedInt(limit, 50, 1, 100);
    const boundedSkip = toBoundedInt(skip, 0, 0, 1000000);
    const minEnergyValue = minEnergy !== undefined ? toBoundedFloat(minEnergy, 0, 0, 1) : null;
    const maxEnergyValue = maxEnergy !== undefined ? toBoundedFloat(maxEnergy, 1, 0, 1) : null;

    const filter = buildSongFilter({
      genre,
      mood,
      minEnergy: minEnergyValue,
      maxEnergy: maxEnergyValue,
    });

    if ([genre, mood, req.query.q].some((value) => value !== undefined && typeof value !== 'string')) {
      return res.status(400).json({ message: 'Filters must be text.' });
    }
    if (req.query.playback === 'full') filter.$and = [{ $or: [
      { audioUrl: { $type: 'string', $ne: '' } }, { youtubeVideoId: { $type: 'string', $ne: '' } },
    ] }];
    if (req.query.playback === 'preview') filter.$and = [
      { $or: [{ audioUrl: { $exists: false } }, { audioUrl: '' }] },
      { $or: [{ youtubeVideoId: { $exists: false } }, { youtubeVideoId: '' }] },
      { previewUrl: { $type: 'string', $ne: '' } },
    ];
    if (req.query.mine === 'true') {
      if (!req.user) return res.status(401).json({ message: 'Sign in to view your uploads.' });
      filter.uploadedBy = req.user._id;
    }
    if (req.query.q?.trim()) {
      const regex = new RegExp(escapeRegex(req.query.q.trim().slice(0, 200)), 'i');
      filter.$or = [{ name: regex }, { artist: regex }, { album: regex }];
    }

    const songs = await Song.find(filter)
      .limit(boundedLimit)
      .skip(boundedSkip)
      .sort(buildSort(sort));

    const total = await Song.countDocuments(filter);

    res.json({
      success: true,
      count: songs.length,
      total,
      songs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch songs', error: error.message });
  }
};

exports.getSongFacets = async (_req, res) => {
  try {
    const [genres, moods] = await Promise.all([
      Song.distinct('genre'),
      Song.distinct('mood'),
    ]);

    res.json({
      success: true,
      genres: genres.filter(Boolean).sort(),
      moods: moods.filter(Boolean).sort(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch facets', error: error.message });
  }
};

exports.getSongById = async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    res.json({
      success: true,
      song,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch song', error: error.message });
  }
};

exports.searchSongs = async (req, res) => {
  try {
    const {
      q,
      limit = 20,
      external = 'false',
      genre,
      mood,
      minEnergy,
      maxEnergy,
    } = req.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ message: 'Search query required' });
    }

    const searchQuery = q.trim().slice(0, 200);
    const safeQuery = escapeRegex(searchQuery);
    const normalizedQ = normalizeText(searchQuery);
    const boundedLimit = toBoundedInt(limit, 20, 1, 50);
    const useExternal = String(external).toLowerCase() !== 'false';
    const minEnergyValue = minEnergy !== undefined ? toBoundedFloat(minEnergy, 0, 0, 1) : null;
    const maxEnergyValue = maxEnergy !== undefined ? toBoundedFloat(maxEnergy, 1, 0, 1) : null;
    const filter = buildSongFilter({
      genre,
      mood,
      minEnergy: minEnergyValue,
      maxEnergy: maxEnergyValue,
    });

    const cacheKey = `songs:search:v2:${normalizedQ}:${genre || ''}:${mood || ''}:${minEnergyValue ?? ''}:${maxEnergyValue ?? ''}:${boundedLimit}:${useExternal}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        fromCache: true,
      });
    }

    const tokens = normalizedQ.split(' ').filter(Boolean).map(escapeRegex);
    const tokenRegex = tokens.length ? new RegExp(tokens.join('|'), 'i') : null;

    const baseQuery = {
      ...filter,
      $or: [
        { name: { $regex: safeQuery, $options: 'i' } },
        { artist: { $regex: safeQuery, $options: 'i' } },
        ...(tokenRegex
          ? [
            { name: { $regex: tokenRegex } },
            { artist: { $regex: tokenRegex } },
          ]
          : []),
      ],
    };

    const candidateLimit = Math.min(Math.max(boundedLimit * 6, 80), 300);
    let candidateSongs = await Song.find(baseQuery)
      .sort({ popularity: -1 })
      .limit(candidateLimit)
      .lean()
      .exec();

    // Fallback fuzzy pass on filtered catalog when strict regex is too narrow.
    if (candidateSongs.length < boundedLimit) {
      const fallbackPool = await Song.find(filter)
        .sort({ popularity: -1 })
        .limit(300)
        .lean()
        .exec();

      const seen = new Set(candidateSongs.map((song) => String(song._id)));
      fallbackPool.forEach((song) => {
        const id = String(song._id);
        if (!seen.has(id)) {
          candidateSongs.push(song);
          seen.add(id);
        }
      });
    }

    const ranked = candidateSongs
      .map((song) => ({
        song,
        score: buildSearchScorer(searchQuery, song),
      }))
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.song.popularity || 0) - (a.song.popularity || 0);
      });

    let songs = ranked.slice(0, boundedLimit).map((item) => item.song);
    let externalSynced = 0;

    if (useExternal && songs.length < boundedLimit) {
      try {
        const externalSongs = await searchAndNormalizeITunesTracks({
          query: searchQuery,
          limit: boundedLimit,
        });

        if (externalSongs.length) {
          const ops = externalSongs.map((song) => ({
            updateOne: {
              filter: { source: 'itunes', sourceId: song.externalUrl },
              update: { $setOnInsert: { ...song, source: 'itunes', sourceId: song.externalUrl } },
              upsert: true,
            },
          }));
          await Song.bulkWrite(ops, { ordered: false });
          externalSynced = externalSongs.length;

          const refreshed = await Song.find(baseQuery)
            .sort({ popularity: -1 })
            .limit(candidateLimit)
            .lean()
            .exec();

          songs = refreshed
            .map((song) => ({
              song,
              score: buildSearchScorer(searchQuery, song),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, boundedLimit)
            .map((item) => item.song);
        }
      } catch (externalError) {
        console.warn('External song sync failed:', externalError.message);
      }
    }

    const payload = {
      success: true,
      count: songs.length,
      songs,
      externalSynced,
      fromCache: false,
    };

    await cache.set(cacheKey, JSON.stringify(payload), 60 * 2);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Search failed', error: error.message });
  }
};

exports.getRecentSongs = async (req, res) => {
  try {
    const limit = toBoundedInt(req.query.limit, 12, 1, 50);
    const songs = await buildRecentSongsForUser(req.user._id, limit, false);

    res.json({
      success: true,
      count: songs.length,
      songs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch recent songs', error: error.message });
  }
};

exports.getContinueListeningSongs = async (req, res) => {
  try {
    const limit = toBoundedInt(req.query.limit, 8, 1, 30);
    let songs = await buildRecentSongsForUser(req.user._id, limit * 2, true);

    songs = songs
      .filter((song) => (song.resumeFromSec || 0) > 0)
      .slice(0, limit);

    if (!songs.length) {
      songs = (await buildRecentSongsForUser(req.user._id, limit, true)).slice(0, limit);
    }

    res.json({
      success: true,
      count: songs.length,
      songs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch continue listening songs', error: error.message });
  }
};

exports.addSong = async (req, res) => {
  try {
    const song = await Song.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Song added successfully',
      song,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add song', error: error.message });
  }
};

// Track a play event for a song and update basic listening history
exports.playSong = async (req, res) => {
  try {
    const { id } = req.params;

    const song = await Song.findByIdAndUpdate(
      id,
      { $inc: { playCount: 1 } },
      { new: true }
    );

    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    if (req.user) {
      const duration = toBoundedInt(req.body?.duration, 0, 0, 3600);
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $push: {
            listeningHistory: {
              songId: song._id,
              playedAt: new Date(),
              duration,
            },
          },
        },
        { new: false }
      );
    }

    res.json({
      success: true,
      message: 'Play tracked',
      song,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to track play', error: error.message });
  }
};
