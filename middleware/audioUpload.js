const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const mongoose = require('mongoose');
const Song = require('../models/Song');
const { storageRoot, maxFileBytes, maxLibraryBytes, maxLibraryFiles, mimeTypes, removeAudio } = require('../utils/audioStorage');

const receive = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => fs.mkdir(storageRoot, { recursive: true }, (error) => done(error, storageRoot)),
    filename: (_req, file, done) => done(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  fileFilter: (_req, file, done) => {
    if (!mimeTypes[path.extname(file.originalname).toLowerCase()]) return done(Object.assign(new Error('Choose an MP3, M4A, WAV, FLAC, or OGG file.'), { status: 415 }));
    return done(null, true);
  },
  limits: { fileSize: maxFileBytes, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
}).single('audio');

// A DB lease serializes quota checks across requests/processes for each user.
module.exports = async (req, res, next) => {
  const leases = mongoose.connection.collection('audio_upload_leases');
  const owner = String(req.user._id);
  const leaseId = crypto.randomUUID();
  let acquired = false;
  let released = false;
  const release = async () => {
    if (!acquired || released) return;
    released = true;
    await leases.deleteOne({ _id: owner, leaseId }).catch(() => {});
  };
  try {
    await leases.deleteOne({ _id: owner, expiresAt: { $lt: new Date() } });
    try {
      await leases.insertOne({ _id: owner, leaseId, expiresAt: new Date(Date.now() + 15 * 60000) });
      acquired = true;
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'An upload is already in progress. Try again when it finishes.' });
      throw error;
    }
    res.once('finish', release);
    res.once('close', release);
    const [usage] = await Song.aggregate([
      { $match: { uploadedBy: req.user._id, deletedAt: null } },
      { $group: { _id: null, bytes: { $sum: '$fileSize' }, count: { $sum: 1 } } },
    ]);
    req.audioUsage = usage || { bytes: 0, count: 0 };
    if (req.audioUsage.bytes >= maxLibraryBytes || req.audioUsage.count >= maxLibraryFiles) {
      return res.status(413).json({ message: 'Your upload library is full. Delete a track before uploading another.' });
    }
    receive(req, res, async (error) => {
      if (error) {
        if (req.file) await removeAudio(req.file.filename).catch(() => {});
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400).json({
          message: error.code === 'LIMIT_FILE_SIZE' ? 'Each song must be 100 MB or smaller.' : error.message,
        });
      }
      next();
    });
  } catch (error) { await release(); next(error); }
};
