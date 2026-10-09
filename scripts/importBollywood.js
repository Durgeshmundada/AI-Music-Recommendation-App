require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const favorites = require('../data/bollywood-favorites.json');
const Song = require('../models/Song');

const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const titleAliases = { yehishqhai: 'yeishqhai', aankhonmeinteri: 'ajabsi', gulabiaankhen: 'gulabiankhen', gulabiankhenjoteridekhi: 'gulabiankhen' };
const baseTitle = (text) => { const key = normalize(String(text).replace(/\s*\(from\b.*$/i, '')); return titleAliases[key] || key; };
const artistKey = (text) => normalize(String(text).replace(/\bmohd\b/gi, 'Mohammed'));
const excluded = /\b(lofi|lo-fi|remix|slowed|sped|karaoke|instrumental|cover|tribute|unplugged|reprise|mashup|live|arabic|tamil|telugu|kannada|malayalam|revival|jhankar)\b/i;

function chooseTrack(results, [title, artist, film]) {
  const expected = baseTitle(title);
  return results.filter((item) => item.kind === 'song' && item.previewUrl && item.trackViewUrl && item.trackTimeMillis > 60000
    && !excluded.test(item.trackName)
    && (baseTitle(item.trackName) === expected || (expected.length > 13 && baseTitle(item.trackName).startsWith(expected)))
    && artistKey(item.artistName).includes(artistKey(artist)))
    .sort((a, b) => Number(normalize(b.collectionName).includes(normalize(film))) - Number(normalize(a.collectionName).includes(normalize(film))))[0];
}

function songFromTrack(item, wanted, index) {
  return { name: item.trackName, artist: item.artistName, album: item.collectionName, genre: 'bollywood', duration: item.trackTimeMillis,
    source: 'itunes', sourceId: String(item.trackId), previewUrl: item.previewUrl, externalUrl: item.trackViewUrl,
    imageUrl: item.artworkUrl100?.replace('100x100bb', '512x512bb'), mood: wanted[3], featuredRank: favorites.length - index,
    popularity: 0, explicit: item.trackExplicitness === 'explicit', attribution: 'Preview provided courtesy of iTunes.',
  };
}

async function main() {
  const staged = path.join(__dirname, '../data/bollywood-staged.json');
  let tracks = [];
  if (process.argv.includes('--use-staged')) {
    tracks = JSON.parse(fs.readFileSync(staged, 'utf8'));
  } else {
    const missed = [];
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    for (let index = 0; index < favorites.length; index += 1) {
      const wanted = favorites[index];
      try {
        const { data } = await axios.get('https://itunes.apple.com/search', {
          params: { term: `${wanted[0]} ${wanted[1]}`, country: 'IN', media: 'music', entity: 'song', limit: 20 }, timeout: 20000,
        });
        const item = chooseTrack(data.results || [], wanted);
        if (!item) { missed.push(wanted); console.log(`SKIP ${wanted[0]}: no matching original recording`); }
        else {
          tracks.push(songFromTrack(item, wanted, index));
          console.log(`MATCH ${wanted[0]} — ${item.artistName}`);
        }
      } catch (error) { missed.push(wanted); console.log(`SKIP ${wanted[0]}: ${error.message}`); }
      // Stay below the public Search API's approximate 20 requests/minute limit.
      fs.writeFileSync(staged, JSON.stringify(tracks, null, 2));
      if (index < favorites.length - 1) await new Promise((resolve) => setTimeout(resolve, 3200));
    }
    fs.writeFileSync(path.join(__dirname, '../data/bollywood-unmatched.json'), JSON.stringify(missed, null, 2));
  }
  if (process.argv.includes('--stage-only')) { console.log(`Staged ${tracks.length} verified original recordings.`); return; }
  if (!tracks.length) throw new Error('No verified tracks; no database changes made.');
  await mongoose.connect(process.env.MONGODB_URI);
  await Song.init();
  const result = await Song.bulkWrite(tracks.map((track) => ({ updateOne: {
    filter: { source: track.source, sourceId: track.sourceId }, update: { $setOnInsert: track }, upsert: true,
  } })), { ordered: false });
  console.log(JSON.stringify({ imported: result.upsertedCount, alreadyPresent: result.matchedCount, total: await Song.countDocuments() }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { chooseTrack, songFromTrack };
