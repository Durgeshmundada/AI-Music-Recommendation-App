/* Artist-published metadata and full recordings; retain attribution on every track. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const Song = require('../models/Song');

const sourceUrl = 'https://incompetech.com/music/royalty-free/pieces.json';
const genres = { 2: 'African', 3: 'Blues', 4: 'Classical', 5: 'Contemporary', 6: 'Disco', 7: 'Electronica', 8: 'Funk', 9: 'Holiday', 10: 'Horror', 11: 'Jazz', 12: 'Latin', 13: 'Modern', 14: 'Musical', 15: 'Polka', 16: 'Pop', 18: 'Reggae', 19: 'Rock', 20: 'Silent Film Score', 21: 'Ska', 22: 'Soundtrack', 23: 'Stings', 24: 'Unclassifiable', 25: 'World', 26: 'Urban' };
const featured = ['Carefree', 'Monkeys Spinning Monkeys', 'Sneaky Snitch', 'Cipher', 'Wallpaper', 'Local Forecast - Elevator', 'Inspired', 'Life of Riley', 'Investigations', 'Dream Culture', 'Electrodoodle', 'Sunshine', 'Funkorama', 'There It Is', 'Floating Cities', 'Ever Mindful'];

function normalize(piece) {
  if (!piece.title || !piece.isrc || !piece.filename || /[/\\]/.test(piece.filename) || !piece.filename.endsWith('.mp3')) return null;
  const duration = String(piece.length).split(':').reduce((sum, part) => sum * 60 + Number(part), 0) * 1000;
  // Exclude short stings: the library is for complete listening sessions.
  if (!Number.isFinite(duration) || duration < 60000) return null;
  const feel = String(piece.feel || '').toLowerCase();
  const mood = /driving|action|intense|aggressive/.test(feel) ? 'energetic'
    : /grooving|bouncy/.test(feel) ? 'party'
      : /bright|uplifting|humorous/.test(feel) ? 'happy'
        : /somber|dark/.test(feel) ? 'sad' : /calm|relaxed/.test(feel) ? 'calm' : 'focus';
  const energy = { energetic: 0.85, party: 0.75, happy: 0.65, sad: 0.35, calm: 0.25, focus: 0.4 }[mood];
  return {
    name: String(piece.title).slice(0, 200), artist: 'Kevin MacLeod', album: 'Incompetech', genre: genres[piece.genre] || 'Other', duration,
    source: 'incompetech', sourceId: piece.isrc,
    audioUrl: `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(piece.filename)}`,
    externalUrl: `https://incompetech.com/music/royalty-free/index.html?isrc=${encodeURIComponent(piece.isrc)}`,
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: `“${piece.title}” — Kevin MacLeod (incompetech.com). Licensed under Creative Commons Attribution 4.0. Recording unchanged.`,
    mood, energy, valence: mood === 'happy' ? 0.85 : mood === 'sad' ? 0.2 : 0.5,
    danceability: mood === 'party' ? 0.8 : 0.4, tempo: Number.parseFloat(piece.bpm) || undefined,
    featuresEstimated: true, popularity: 0,
    featuredRank: featured.includes(piece.title) ? 100 - featured.indexOf(piece.title) : 0,
  };
}

async function main() {
  const local = process.argv.find((arg) => arg.startsWith('--file='));
  const pieces = local ? JSON.parse(fs.readFileSync(path.resolve(local.slice(7)), 'utf8'))
    : (await axios.get(sourceUrl, { timeout: 45000, family: 4, maxContentLength: 10 * 1024 * 1024 })).data;
  if (!Array.isArray(pieces)) throw new Error('Unexpected catalog response');
  const tracks = [...new Map(pieces.map(normalize).filter(Boolean).map((track) => [track.sourceId, track])).values()];
  if (!tracks.length) throw new Error('No full tracks found; no changes made');
  await mongoose.connect(process.env.MONGODB_URI);
  await Song.init();
  // Insert only: never overwrite uploads, edits, or deleted-track tombstones.
  const result = await Song.bulkWrite(tracks.map((track) => ({ updateOne: {
    filter: { source: track.source, sourceId: track.sourceId }, update: { $setOnInsert: track }, upsert: true,
  } })), { ordered: false });
  const report = { sourceUrl, importedAt: new Date().toISOString(), sourceEntries: pieces.length, eligibleFullTracks: tracks.length, inserted: result.upsertedCount, existing: result.matchedCount, minimumDurationSeconds: 60, license: 'CC BY 4.0', catalogPage: 'https://incompetech.com/music/royalty-free/music.html' };
  fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../data/catalog-import-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { normalize };
