const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const storageRoot = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(__dirname, '../storage/audio'));
const maxFileBytes = 100 * 1024 * 1024;
const maxLibraryBytes = Number(process.env.AUDIO_USER_QUOTA_MB || 5120) * 1024 * 1024;
const maxLibraryFiles = Number(process.env.AUDIO_USER_MAX_FILES || 1000);
const mimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

function audioPath(key) {
  if (!/^[a-f0-9-]{36}\.(mp3|wav|flac|ogg|m4a)$/.test(key || '')) throw new Error('Invalid audio storage key');
  return path.join(storageRoot, key);
}

async function removeAudio(key) {
  if (!key) return;
  try { await fs.promises.unlink(audioPath(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function inspectAudio(file) {
  const handle = await fs.promises.open(file.path, 'r');
  const header = Buffer.alloc(12);
  try { await handle.read(header, 0, 12, 0); } finally { await handle.close(); }
  const ext = path.extname(file.filename);
  const valid = {
    '.mp3': header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 255 && (header[1] & 224) === 224),
    '.wav': header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE',
    '.flac': header.toString('ascii', 0, 4) === 'fLaC',
    '.ogg': header.toString('ascii', 0, 4) === 'OggS',
    '.m4a': header.toString('ascii', 4, 8) === 'ftyp',
  }[ext];
  if (!valid) throw Object.assign(new Error('File content does not match a supported audio format.'), { status: 415 });
  const { parseFile } = await import('music-metadata');
  let metadata;
  try { metadata = await parseFile(file.path, { duration: true, skipCovers: true }); }
  catch { throw Object.assign(new Error('This audio file is damaged or unsupported.'), { status: 415 }); }
  const seconds = metadata.format.duration;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 6 * 3600 || !metadata.format.sampleRate || !metadata.format.numberOfChannels) {
    throw Object.assign(new Error('A valid audio recording up to six hours is required.'), { status: 415 });
  }
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file.path), hash);
  return { metadata, duration: Math.round(seconds * 1000), fileHash: hash.digest('hex') };
}

module.exports = { storageRoot, maxFileBytes, maxLibraryBytes, maxLibraryFiles, mimeTypes, audioPath, removeAudio, inspectAudio };
