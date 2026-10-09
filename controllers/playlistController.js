const Playlist = require('../models/Playlist');

async function getOwnedPlaylistOrError(playlistId, userId, res) {
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    res.status(404).json({ message: 'Playlist not found' });
    return null;
  }

  if (playlist.owner.toString() !== userId.toString()) {
    res.status(403).json({ message: 'Not authorized' });
    return null;
  }

  return playlist;
}

exports.createPlaylist = async (req, res) => {
  try {
    const { name, description, mood } = req.body;

    const playlist = await Playlist.create({
      name,
      description,
      mood,
      owner: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Playlist created',
      playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create playlist', error: error.message });
  }
};

exports.getUserPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user._id })
      .populate('songs.song')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: playlists.length,
      playlists,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch playlists', error: error.message });
  }
};

exports.addSongToPlaylist = async (req, res) => {
  try {
    const { songId } = req.body;
    const { playlistId } = req.params;

    const playlist = await getOwnedPlaylistOrError(playlistId, req.user._id, res);
    if (!playlist) {
      return;
    }

    const existing = playlist.songs.find((entry) => entry.song?.toString() === songId);
    if (existing) {
      return res.status(409).json({ message: 'Song already exists in this playlist' });
    }

    playlist.songs.push({ song: songId });
    await playlist.save();

    res.json({
      success: true,
      message: 'Song added to playlist',
      playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add song', error: error.message });
  }
};

exports.updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, mood } = req.body;

    const playlist = await getOwnedPlaylistOrError(id, req.user._id, res);
    if (!playlist) {
      return;
    }

    if (typeof name === 'string' && name.trim()) {
      playlist.name = name.trim();
    }
    if (typeof description === 'string') {
      playlist.description = description.trim();
    }
    if (typeof mood === 'string' || mood === null) {
      playlist.mood = mood || undefined;
    }

    await playlist.save();

    res.json({
      success: true,
      message: 'Playlist updated',
      playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update playlist', error: error.message });
  }
};

exports.removeSongFromPlaylist = async (req, res) => {
  try {
    const { playlistId, songId } = req.params;
    const playlist = await getOwnedPlaylistOrError(playlistId, req.user._id, res);
    if (!playlist) {
      return;
    }

    const initialCount = playlist.songs.length;
    playlist.songs = playlist.songs.filter((entry) => entry.song?.toString() !== songId);

    if (playlist.songs.length === initialCount) {
      return res.status(404).json({ message: 'Song not found in this playlist' });
    }

    await playlist.save();

    res.json({
      success: true,
      message: 'Song removed from playlist',
      playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove song from playlist', error: error.message });
  }
};

exports.reorderPlaylistSongs = async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { orderedSongIds } = req.body;
    const playlist = await getOwnedPlaylistOrError(playlistId, req.user._id, res);
    if (!playlist) {
      return;
    }

    if (!Array.isArray(orderedSongIds) || !orderedSongIds.length) {
      return res.status(400).json({ message: 'orderedSongIds array is required' });
    }

    const currentEntries = playlist.songs || [];
    const entryBySongId = new Map(currentEntries.map((entry) => [entry.song?.toString(), entry]));

    const reordered = [];
    orderedSongIds.forEach((songId) => {
      const entry = entryBySongId.get(String(songId));
      if (entry) {
        reordered.push(entry);
        entryBySongId.delete(String(songId));
      }
    });

    // Append remaining songs that were not explicitly ordered.
    entryBySongId.forEach((entry) => reordered.push(entry));

    playlist.songs = reordered;
    await playlist.save();

    res.json({
      success: true,
      message: 'Playlist order updated',
      playlist,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reorder playlist', error: error.message });
  }
};

exports.deletePlaylist = async (req, res) => {
  try {
    const playlist = await getOwnedPlaylistOrError(req.params.id, req.user._id, res);
    if (!playlist) {
      return;
    }

    await Playlist.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Playlist deleted',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete playlist', error: error.message });
  }
};
