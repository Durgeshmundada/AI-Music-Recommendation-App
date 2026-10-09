import { parseWebStream } from 'music-metadata';
import { database, rows, statement } from '../db/index.js';

const MAX_BYTES = 100 * 1024 * 1024;
const QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const mimeTypes = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg' };
const fail = (status, message) => Object.assign(new Error(message), { status });
const trim = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 250) : fallback;

function validSignature(bytes, extension) {
  const text = new TextDecoder('ascii').decode(bytes);
  return { mp3: text.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224),
    wav: text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE', flac: text.startsWith('fLaC'),
    ogg: text.startsWith('OggS'), m4a: text.slice(4, 8) === 'ftyp' }[extension];
}

export async function upload(request, env, user) {
  if (request.headers.get('x-rights-confirmed') !== 'true') throw fail(400, 'Confirm that you have permission to share this recording.');
  let filename;
  try { filename = decodeURIComponent(request.headers.get('x-upload-filename') || ''); }
  catch { throw fail(400, 'Invalid filename.'); }
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!filename || filename.length > 500 || !mimeTypes[extension]) throw fail(415, 'Choose an MP3, M4A, WAV, FLAC, or OGG recording.');
  const length = Number(request.headers.get('content-length'));
  if (!Number.isInteger(length) || length < 44) throw fail(411, 'A complete audio file with a known size is required.');
  if (length > MAX_BYTES) throw fail(413, 'File exceeds 100 MB.');
  if (!request.body) throw fail(400, 'No audio file was received.');

  // Recover interrupted uploads belonging only to this user; pending writes
  // count against quotas until this cleanup succeeds.
  const expired = await rows(env, "SELECT id, storage_key FROM uploads WHERE owner_id = ? AND state = 'uploading' AND created_at < ?", user._id, Date.now() - 30 * 60000);
  for (const row of expired) {
    await env.BUCKET.delete(row.storage_key);
    await statement(env, "DELETE FROM uploads WHERE id = ? AND state = 'uploading'", row.id).run();
  }
  const id = crypto.randomUUID();
  const key = `audio/${user._id}/${id}.${extension}`;
  const reserved = await statement(env, `INSERT INTO uploads (id, owner_id, storage_key, file_bytes, state, created_at)
    SELECT ?, ?, ?, ?, 'uploading', ? WHERE
    (SELECT COALESCE(SUM(file_bytes), 0) FROM uploads WHERE owner_id = ?) + ? <= ?
    AND (SELECT COUNT(*) FROM uploads WHERE owner_id = ?) < 1000
    AND NOT EXISTS (SELECT 1 FROM uploads WHERE owner_id = ? AND state = 'uploading')`,
  id, user._id, key, length, Date.now(), user._id, length, QUOTA_BYTES, user._id, user._id).run();
  if (!reserved.meta.changes) throw fail(409, 'Another upload is in progress, or your 5 GB / 1,000-song quota is full.');

  try {
    // Stream bytes to object storage without buffering a 100 MB file in the Worker.
    const stored = await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: mimeTypes[extension] } });
    if (!stored || stored.size !== length || stored.size > MAX_BYTES) throw fail(413, 'Audio file size is invalid.');
    const headerObject = await env.BUCKET.get(key, { range: { offset: 0, length: 12 } });
    if (!headerObject || !validSignature(new Uint8Array(await headerObject.arrayBuffer()), extension)) throw fail(415, 'File content does not match a supported audio format.');
    const object = await env.BUCKET.get(key);
    let metadata;
    try { metadata = await parseWebStream(object.body, { mimeType: mimeTypes[extension], size: stored.size }, { duration: true, skipCovers: true }); }
    catch { throw fail(415, 'This audio file is damaged or unsupported.'); }
    const seconds = metadata.format.duration;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 21600 || !metadata.format.sampleRate || !metadata.format.numberOfChannels) throw fail(415, 'Choose a valid recording up to six hours long.');
    const song = { _id: id, name: trim(metadata.common.title, filename.replace(/\.[^.]+$/, '')),
      artist: trim(metadata.common.artist, 'Unknown artist'), album: trim(metadata.common.album, ''),
      genre: trim(metadata.common.genre?.[0], 'uploaded'), source: 'upload', uploadedBy: user._id,
      duration: Math.round(seconds * 1000), audioUrl: `/api/songs/${id}/audio`, createdAt: new Date().toISOString(), featuredRank: 0 };
    try {
      await statement(env, "UPDATE uploads SET state = 'ready', file_hash = ?, song_json = ? WHERE id = ?", stored.etag, JSON.stringify(song), id).run();
    } catch (error) {
      if (/UNIQUE constraint failed/.test(error.message)) throw fail(409, 'You already uploaded this recording.');
      throw error;
    }
    return song;
  } catch (error) {
    // Keep the reservation if cleanup fails, allowing a later retry to recover it.
    await env.BUCKET.delete(key);
    await statement(env, 'DELETE FROM uploads WHERE id = ?', id).run();
    throw error;
  }
}

export async function removeUpload(env, user, id) {
  const row = await statement(env, 'SELECT owner_id, storage_key FROM uploads WHERE id = ?', id).first();
  if (!row) throw fail(404, 'Song not found.');
  if (row.owner_id !== user._id && user.role !== 'admin') throw fail(403, 'You can delete only your own uploaded songs.');
  await statement(env, "UPDATE uploads SET state = 'deleting' WHERE id = ?", id).run();
  await env.BUCKET.delete(row.storage_key);
  await database(env).batch([
    statement(env, 'DELETE FROM playlist_songs WHERE song_id = ?', id),
    statement(env, 'DELETE FROM listening_history WHERE song_id = ?', id),
    statement(env, 'DELETE FROM uploads WHERE id = ?', id),
  ]);
}

export async function streamAudio(request, env, id) {
  const row = await statement(env, "SELECT storage_key, file_bytes FROM uploads WHERE id = ? AND state = 'ready'", id).first();
  if (!row) throw fail(404, 'Recording not found.');
  const rangeHeader = request.headers.get('range');
  let range;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.file_bytes}` } });
    const start = match[1] ? Number(match[1]) : Math.max(0, row.file_bytes - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), row.file_bytes - 1) : row.file_bytes - 1;
    if (!Number.isSafeInteger(start) || start >= row.file_bytes || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.file_bytes}` } });
    range = { offset: start, length: end - start + 1 };
  }
  const object = request.method === 'HEAD' ? await env.BUCKET.head(row.storage_key) : await env.BUCKET.get(row.storage_key, range ? { range } : undefined);
  if (!object) throw fail(404, 'Recording not found.');
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', ETag: object.httpEtag,
    'Content-Length': String(range?.length || object.size), 'X-Content-Type-Options': 'nosniff' });
  object.writeHttpMetadata(headers);
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
}
