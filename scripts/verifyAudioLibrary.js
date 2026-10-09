// Integration tests use an isolated MongoDB database and temporary audio directory.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const testDb = `music_audio_test_${Date.now()}`;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-audio-test-'));
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${testDb}`;
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.AUDIO_STORAGE_DIR = directory;
process.env.AUDIO_USER_QUOTA_MB = '2';

const app = require('../server');
const Song = require('../models/Song');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const Recommendation = require('../models/Recommendation');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; console.log(`PASS ${label}`); };

function wav(seconds = 90) {
  const rate = 8000;
  const dataSize = rate * seconds * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF'); bytes.writeUInt32LE(36 + dataSize, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < dataSize / 2; i += 1) bytes.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / rate) * 1000), 44 + i * 2);
  return bytes;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Song.init();
  const users = await User.create([
    { name: 'Audio Tester', email: 'owner@example.test', password: 'Audio-Test-123!' },
    { name: 'Other Tester', email: 'other@example.test', password: 'Audio-Test-123!' },
    { name: 'Admin Tester', email: 'admin@example.test', password: 'Audio-Test-123!', role: 'admin' },
  ]);
  const token = (user) => jwt.sign({ id: String(user._id), type: 'access' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const owner = token(users[0]); const other = token(users[1]); const admin = token(users[2]);
  const upload = (bytes, filename, fields = { rightsConfirmed: 'true' }) => {
    let req = request(app).post('/api/songs/upload').set('Authorization', `Bearer ${owner}`);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach('audio', bytes, filename);
  };
  check((await request(app).post('/api/songs/upload')).status === 401, 'unauthenticated uploads rejected');
  check((await request(app).get('/api/songs/not-an-id/audio')).status === 400, 'invalid song IDs rejected');
  check((await upload(Buffer.from('not audio'), 'fake.exe')).status === 415, 'unsupported extensions rejected');
  check((await upload(Buffer.from('not audio'), 'fake.mp3')).status === 415, 'fake audio content rejected');
  check((await upload(wav(1), 'rights.wav', {})).status === 400, 'upload permission confirmation required');
  check(fs.readdirSync(directory).length === 0, 'rejected uploads leave no files');
  const result = await upload(wav(), 'Full recording.wav', { rightsConfirmed: 'true', name: 'Full recording', artist: 'Test artist' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const song = result.body.song;
  check(song.duration === 90000 && song.audioUrl && song.source === 'upload', '90-second recording uploaded with real duration');
  check(!song.storageKey && !song.fileHash && !song.fileSize, 'storage internals not exposed');
  check((await upload(wav(), 'duplicate.wav')).status === 409, 'duplicate audio rejected');
  check((await upload(wav(50), 'quota.wav')).status === 413, 'per-user storage quota enforced');
  check(fs.readdirSync(directory).length === 1, 'duplicate and quota rejection clean up disk files');
  const stream = await request(app).get(song.audioUrl).set('Range', 'bytes=1100000-1100099');
  check(stream.status === 206 && stream.headers['content-range'] === 'bytes 1100000-1100099/1440044', 'byte-range seeking past 60 seconds supported');
  check((await request(app).get(song.audioUrl).set('Range', 'bytes=9999999-')).status === 416, 'invalid audio ranges rejected');
  check((await request(app).get('/api/songs?mine=true').set('Authorization', `Bearer ${other}`)).body.total === 0, 'My uploads filtered to signed-in owner');
  check((await request(app).get('/api/songs?playback=full&q=Full')).body.total === 1, 'full-track search returns uploaded song');
  check((await request(app).delete(`/api/songs/${song._id}`).set('Authorization', `Bearer ${other}`)).status === 403, 'another user cannot delete an upload');
  const playlist = await Playlist.create({ name: 'Test playlist', owner: users[0]._id, songs: [{ song: song._id }] });
  await User.updateOne({ _id: users[0]._id }, { $push: { listeningHistory: { songId: song._id } } });
  await Recommendation.create({ user: users[0]._id, sourcesSong: song._id, recommendedSong: song._id });
  check((await request(app).delete(`/api/songs/${song._id}`).set('Authorization', `Bearer ${owner}`)).status === 200, 'owner can delete an upload');
  check((await request(app).get(song.audioUrl)).status === 404, 'deleted audio cannot be streamed');
  check(fs.readdirSync(directory).length === 0, 'uploaded file physically removed');
  check((await Playlist.findById(playlist._id)).songs.length === 0 && (await User.findById(users[0]._id)).listeningHistory.length === 0 && await Recommendation.countDocuments() === 0, 'playlist, history, and recommendation references cleaned');
  check((await request(app).delete(`/api/songs/${song._id}`).set('Authorization', `Bearer ${owner}`)).status === 200, 'deletion is safely retryable');
  const catalog = await Song.create({ name: 'Licensed catalog test', artist: 'Test', genre: 'Test', duration: 120000, source: 'incompetech', sourceId: 'TEST-ISRC', audioUrl: 'https://incompetech.com/example.mp3' });
  check((await request(app).delete(`/api/songs/${catalog._id}`).set('Authorization', `Bearer ${owner}`)).status === 403, 'catalog deletion requires admin');
  check((await request(app).delete(`/api/songs/${catalog._id}`).set('Authorization', `Bearer ${admin}`)).status === 200, 'admin can delete catalog tracks');
  await Song.bulkWrite([{ updateOne: { filter: { source: 'incompetech', sourceId: 'TEST-ISRC' }, update: { $setOnInsert: { name: 'Resurrection attempt' } }, upsert: true } }]);
  check((await request(app).get('/api/songs?playback=full')).body.total === 0, 'catalog re-import does not resurrect deletions');
  console.log(`Audio library integration: ${checks} checks passed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // Only the unique test DB and temporary files created by this script are removed.
  if (mongoose.connection.name === testDb) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) === fs.realpathSync(os.tmpdir()) && path.basename(resolved).startsWith('music-audio-test-')) fs.rmSync(resolved, { recursive: true, force: true });
});
