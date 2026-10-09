require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Song = require('../models/Song');
const { audioPath, removeAudio } = require('../utils/audioStorage');
const cache = require('../utils/cache');

async function main() {
  if (!process.argv.includes('--confirm-replace-all')) throw new Error('This clears every song. Supply --confirm-replace-all only for an authorized library replacement.');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const songs = await Song.collection.find({}).toArray();
  const ids = songs.map((song) => song._id);
  const backup = path.resolve(__dirname, '../backups', `library-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const backupRoot = path.resolve(__dirname, '../backups');
  if (!backup.startsWith(backupRoot + path.sep)) throw new Error('Invalid backup path');
  fs.mkdirSync(path.join(backup, 'audio'), { recursive: true });
  const payload = {
    songs,
    playlists: await db.collection('playlists').find({ 'songs.song': { $in: ids } }).toArray(),
    listeningHistory: await db.collection('users').find({ 'listeningHistory.songId': { $in: ids } }, { projection: { _id: 1, listeningHistory: 1 } }).toArray(),
    recommendations: await db.collection('recommendations').find({ $or: [{ sourcesSong: { $in: ids } }, { recommendedSong: { $in: ids } }] }).toArray(),
  };
  fs.writeFileSync(path.join(backup, 'library.ejson'), mongoose.mongo.BSON.EJSON.stringify(payload, { relaxed: false }));
  const stored = songs.filter((song) => song.storageKey);
  for (const song of stored) {
    const source = audioPath(song.storageKey);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backup, 'audio', song.storageKey));
  }
  // Snapshot is on disk before any mutation. Keep accounts and playlist names.
  await db.collection('playlists').updateMany({ 'songs.song': { $in: ids } }, { $pull: { songs: { song: { $in: ids } } } });
  await db.collection('users').updateMany({ 'listeningHistory.songId': { $in: ids } }, { $pull: { listeningHistory: { songId: { $in: ids } } } });
  await db.collection('recommendations').deleteMany({ $or: [{ sourcesSong: { $in: ids } }, { recommendedSong: { $in: ids } }] });
  const removed = await Song.collection.deleteMany({ _id: { $in: ids } });
  for (const song of stored) await removeAudio(song.storageKey);
  await cache.init();
  await cache.deletePattern('songs:*');
  await cache.deletePattern('recommendations:*');
  console.log(JSON.stringify({ removedSongs: removed.deletedCount, remainingSongs: await Song.collection.countDocuments(), backup }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await cache.close(); await mongoose.disconnect(); });
