const path = require('path');
const mongoose = require('mongoose');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const User = require('../models/User');
const Recommendation = require('../models/Recommendation');
const cache = require('../utils/cache');
const { inspectAudio, removeAudio, audioPath, mimeTypes, maxLibraryBytes } = require('../utils/audioStorage');

const clean = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback);

exports.uploadSong = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: 'Choose an audio file to upload.' });
  let committed = false;
  try {
    if (req.body.rightsConfirmed !== 'true') throw Object.assign(new Error('Confirm you have permission to share this recording.'), { status: 400 });
    const { metadata, duration, fileHash } = await inspectAudio(req.file);
    if (await Song.findOne({ uploadedBy: req.user._id, fileHash }).select('_id')) throw Object.assign(new Error('You already uploaded this audio file.'), { status: 409 });
    if (req.audioUsage.bytes + req.file.size > maxLibraryBytes) throw Object.assign(new Error('This file exceeds your remaining upload storage.'), { status: 413 });
    const id = new mongoose.Types.ObjectId();
    const song = await Song.create({
      _id: id,
      name: clean(req.body.name, clean(metadata.common.title, path.parse(req.file.originalname).name)),
      artist: clean(req.body.artist, clean(metadata.common.artist, 'Unknown artist')),
      album: clean(metadata.common.album, 'Your uploads'),
      genre: clean(req.body.genre, clean(metadata.common.genre?.[0], 'Other')),
      duration,
      audioUrl: `/api/songs/${id}/audio`,
      source: 'upload',
      uploadedBy: req.user._id,
      storageKey: req.file.filename,
      fileSize: req.file.size,
      fileHash,
      popularity: 0,
    });
    committed = true;
    await Promise.all([cache.deletePattern('songs:*'), cache.deletePattern('recommendations:*')]);
    const data = song.toObject();
    ['storageKey', 'fileHash', 'fileSize', 'deletedAt'].forEach((key) => delete data[key]);
    return res.status(201).json({ success: true, song: data });
  } catch (error) {
    if (!committed) await removeAudio(req.file.filename).catch(() => {});
    if (error.code === 11000) return res.status(409).json({ message: 'You already uploaded this audio file.' });
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
};

exports.streamSong = async (req, res, next) => {
  try {
    const song = await Song.findById(req.params.id).select('+storageKey');
    if (!song || song.source !== 'upload' || !song.storageKey) return res.status(404).json({ message: 'Audio not found.' });
    res.type(mimeTypes[path.extname(song.storageKey)]);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(audioPath(song.storageKey), { cacheControl: true, maxAge: 0, acceptRanges: true }, (error) => {
      if (error && !res.headersSent) {
        if (error.code === 'ENOENT') return res.status(404).json({ message: 'Audio file is missing.' });
        next(error);
      }
    });
  } catch (error) { next(error); }
};

exports.deleteSong = async (req, res, next) => {
  try {
    // Include tombstones to make cleanup safely retryable after a disk/DB failure.
    const id = new mongoose.Types.ObjectId(req.params.id);
    const song = await Song.collection.findOne({ _id: id });
    if (!song) return res.status(404).json({ message: 'Song not found.' });
    if (req.user.role !== 'admin' && String(song.uploadedBy || '') !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own uploads. Catalog tracks require an admin.' });
    }
    await Song.updateOne({ _id: id }, { $set: { deletedAt: song.deletedAt || new Date() } });
    await Promise.all([
      Playlist.updateMany({ 'songs.song': id }, { $pull: { songs: { song: id } } }),
      User.updateMany({ 'listeningHistory.songId': id }, { $pull: { listeningHistory: { songId: id } } }),
      Recommendation.deleteMany({ $or: [{ sourcesSong: id }, { recommendedSong: id }] }),
      cache.deletePattern('songs:*'),
      cache.deletePattern('recommendations:*'),
    ]);
    await removeAudio(song.storageKey);
    return res.json({ success: true, message: 'Song deleted.' });
  } catch (error) { next(error); }
};
