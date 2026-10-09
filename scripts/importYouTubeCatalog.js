require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Song = require('../models/Song');
const catalog = require('../data/bollywood-youtube.json');

const officialChannels = new Set([
  'UCq-Fj5jknLsUf-MWSy4_brA', 'UC56gTxNs4f9xZ7Pa2i5xNzg', 'UC3MLnJtqc_phABBriLRhtgQ',
  'UCJrDMFOdv1I2k8n9oK_V21w', 'UCFFbwnve3yF62-tVXkTyHqg', 'UCbTLwN10NoCU4WDzLf1JMOA',
  'UCWi_65E_L8tQZ34C6wVAlpQ', 'UC_A7K2dXFsTMAciGmnNxy-Q', 'UCF1JIbMUs6uqoZEY1Haw0GQ',
  'UCP6uH_XlsxrXwZQ4DlqbqPg', 'UCRm96I5kmb_iGFofE5N691w',
]);

function validateCatalog(tracks) {
  if (!tracks.length) throw new Error('Empty video catalog.');
  const ids = new Set();
  const legacyIds = new Set();
  for (const track of tracks) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(track.youtubeVideoId || '') || track.sourceId !== track.youtubeVideoId
      || track.source !== 'youtube' || !officialChannels.has(track.youtubeChannelId)
      || !track.name || !track.artist || !Number.isFinite(track.duration) || track.duration < 180000
      || track.duration > 1200000 || track.previewUrl || track.audioUrl
      || track.externalUrl !== `https://www.youtube.com/watch?v=${track.youtubeVideoId}`) {
      throw new Error(`Invalid official video: ${track.name || 'unknown'}`);
    }
    if (ids.has(track.sourceId) || legacyIds.has(track.legacyItunesId)) throw new Error('Duplicate catalog track.');
    ids.add(track.sourceId); legacyIds.add(track.legacyItunesId);
  }
}

function songDocument(track) {
  const { legacyItunesId, videoTitle, verifiedAt, ...song } = track;
  return song;
}

async function main() {
  validateCatalog(catalog);
  if (process.argv.includes('--verify')) {
    for (const track of catalog) {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(track.externalUrl)}&format=json`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`YouTube metadata unavailable: ${track.name} (${response.status})`);
      const metadata = await response.json();
      if (metadata.author_name !== track.youtubeChannel) throw new Error(`Publisher changed: ${track.name}`);
    }
    console.log(`Verified all ${catalog.length} official video metadata links. Regional playback must be checked in the player.`);
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await Song.init();
  const previous = await Song.collection.find({ source: 'itunes', sourceId: { $in: catalog.map(t => t.legacyItunesId) } }).toArray();
  if (previous.length) {
    const directory = path.resolve(__dirname, '../backups');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `before-youtube-${Date.now()}.ejson`);
    fs.writeFileSync(file, mongoose.mongo.BSON.EJSON.stringify(previous), { flag: 'wx' });
    console.log(`Preview metadata backup: ${file}`);
  }
  let created = 0; let updated = 0; let deleted = 0;
  for (const track of catalog) {
    // Match the original document to preserve playlists and listening history.
    // Raw lookup includes tombstones so a deleted song is never recreated.
    const existing = await Song.collection.findOne({ $or: [
      { source: 'youtube', sourceId: track.sourceId }, { source: 'itunes', sourceId: track.legacyItunesId },
    ] });
    if (existing?.deletedAt) { deleted += 1; continue; }
    if (existing) {
      await Song.updateOne({ _id: existing._id, deletedAt: null }, {
        $set: songDocument(track), $unset: { previewUrl: '', audioUrl: '', license: '', licenseUrl: '' },
      }, { runValidators: true });
      updated += 1;
    } else { await Song.create(songDocument(track)); created += 1; }
  }
  console.log(JSON.stringify({ created, updated, skippedDeleted: deleted, fullVideos: await Song.countDocuments({ source: 'youtube' }) }));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { validateCatalog, songDocument };
