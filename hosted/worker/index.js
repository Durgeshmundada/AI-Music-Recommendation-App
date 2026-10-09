import assets from '../.sites-runtime/assets.json';
import { database, rows, statement } from '../db/index.js';
import { catalog, songs, recommendations } from './catalog.js';
import { upload, removeUpload, streamAudio } from './audio.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const problem = (status, message) => Object.assign(new Error(message), { status });
const bounded = (value, fallback, maximum) => Number.isFinite(Number(value)) && value !== null ? Math.min(maximum, Math.max(0, Math.floor(Number(value)))) : fallback;

async function identity(request, env) {
  // These identity headers are supplied and authenticated by Sites dispatch.
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
  const userId = Array.from(bytes.slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
  let name = request.headers.get('oai-authenticated-user-full-name');
  if (name && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = null; }
  }
  return { _id: userId, name: name || email.split('@')[0], email, role: env.OWNER_EMAIL && email.toLowerCase() === env.OWNER_EMAIL.toLowerCase() ? 'admin' : 'user', isEmailVerified: true };
}

async function body(request) {
  if (Number(request.headers.get('content-length') || 0) > 32768) throw problem(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw problem(400, 'A JSON request is required.');
  let length = 0; let text = ''; const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 32768) { await reader.cancel(); throw problem(413, 'Request is too large.'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) { if (error.status) throw error; throw problem(400, 'Invalid JSON request.'); }
}

async function rateLimit(env, user, route) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  const key = `${user._id}:${route}:${hour}`;
  const maximum = route === 'upload' ? 100 : 1000;
  const result = await statement(env, `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`, key, (hour + 1) * 3600000, maximum).first();
  if (!result) throw problem(429, 'Too many requests. Please try again later.');
  await statement(env, 'DELETE FROM rate_limits WHERE expires_at < ?', now).run();
}

function playlistName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw problem(400, 'Enter a playlist name of 1–100 characters.');
  return value.trim();
}

async function handleAPI(request, env) {
  const url = new URL(request.url); const pathname = url.pathname; const method = request.method;
  if (pathname === '/api/health' && method === 'GET') {
    await statement(env, 'SELECT 1 FROM uploads LIMIT 1').all();
    return json({ status: 'ok', database: 'ok', storage: env.BUCKET ? 'ok' : 'unavailable' });
  }
  const user = await identity(request, env);
  if (pathname === '/api/auth/me' && method === 'GET') return json({ user });
  const audioRoute = /^\/api\/songs\/([a-f0-9-]{36})\/audio$/.exec(pathname);
  const publicRead = (method === 'GET' && ['/api/songs', '/api/songs/facets', '/api/recommendations/smart', '/api/recommendations/for-you'].includes(pathname))
    || (audioRoute && ['GET', 'HEAD'].includes(method));
  if (!user && (!publicRead || url.searchParams.get('mine') === 'true')) throw problem(401, 'Sign in to manage uploads, playlists, and listening history.');
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw problem(403, 'This request must come from your music studio.');
    await rateLimit(env, user, pathname === '/api/songs/upload' ? 'upload' : 'write');
  }
  if (pathname === '/api/songs/upload' && method === 'POST') return json({ song: await upload(request, env, user), success: true }, 201);
  if (audioRoute && ['GET', 'HEAD'].includes(method)) return streamAudio(request, env, audioRoute[1]);
  const deleteRoute = /^\/api\/songs\/([^/]+)$/.exec(pathname);
  if (deleteRoute && method === 'DELETE') {
    const id = deleteRoute[1];
    if (catalog.some(song => song._id === id)) {
      if (user.role !== 'admin') throw problem(403, 'Only the studio owner can remove catalog songs.');
      await database(env).batch([
        statement(env, 'INSERT OR IGNORE INTO removed_catalog (song_id, deleted_by, deleted_at) VALUES (?, ?, ?)', id, user._id, Date.now()),
        statement(env, 'DELETE FROM playlist_songs WHERE song_id = ?', id),
        statement(env, 'DELETE FROM listening_history WHERE song_id = ?', id),
      ]);
    } else await removeUpload(env, user, id);
    return json({ success: true });
  }

  const library = await songs(env);
  const songById = new Map(library.map(song => [song._id, song]));
  if (pathname === '/api/songs' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase().slice(0, 200).trim();
    const genre = url.searchParams.get('genre'); const mood = url.searchParams.get('mood');
    const playback = url.searchParams.get('playback'); const mine = url.searchParams.get('mine') === 'true';
    const minimumEnergy = url.searchParams.get('minEnergy');
    const filtered = library.filter(song => (!q || `${song.name} ${song.artist} ${song.album}`.toLowerCase().includes(q))
      && (!genre || song.genre === genre) && (!mood || song.mood === mood)
      && (!mine || song.uploadedBy === user?._id) && playback !== 'preview'
      && (!minimumEnergy || (typeof song.energy === 'number' && song.energy >= Number(minimumEnergy))));
    if (url.searchParams.get('sort') === 'latest') filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else filtered.sort((a, b) => (b.featuredRank || 0) - (a.featuredRank || 0));
    const skip = bounded(url.searchParams.get('skip'), 0, 1000000); const limit = bounded(url.searchParams.get('limit'), 30, 100);
    const selected = filtered.slice(skip, skip + limit);
    return json({ success: true, songs: selected, total: filtered.length, count: selected.length });
  }
  if (pathname === '/api/songs/facets' && method === 'GET') return json({ genres: [...new Set(library.map(s => s.genre))].sort(), moods: [...new Set(library.map(s => s.mood).filter(Boolean))] });
  if (['/api/songs/recent', '/api/songs/continue'].includes(pathname) && method === 'GET') {
    const recent = await rows(env, 'SELECT song_id, resume_seconds FROM listening_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100', user._id);
    const items = recent.map(row => songById.has(row.song_id) ? { ...songById.get(row.song_id), resumeFromSec: row.resume_seconds } : null).filter(Boolean);
    return json({ songs: items.slice(0, bounded(url.searchParams.get('limit'), 8, 100)) });
  }
  const playRoute = /^\/api\/songs\/([^/]+)\/play$/.exec(pathname);
  if (playRoute && method === 'POST') {
    const song = songById.get(playRoute[1]); if (!song) throw problem(404, 'Song not found.');
    const data = await body(request); const duration = bounded(data.duration, 0, Math.floor(song.duration / 1000));
    await database(env).batch([
      statement(env, 'INSERT INTO listening_history (user_id, song_id, played_at, resume_seconds) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, song_id) DO UPDATE SET played_at = excluded.played_at, resume_seconds = excluded.resume_seconds', user._id, song._id, Date.now(), duration),
      statement(env, 'DELETE FROM listening_history WHERE user_id = ? AND song_id NOT IN (SELECT song_id FROM listening_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100)', user._id, user._id),
    ]);
    return json({ success: true });
  }
  if (['/api/recommendations/smart', '/api/recommendations/for-you'].includes(pathname) && method === 'GET') {
    let seed = songById.get(url.searchParams.get('songId'));
    if (!seed && user && pathname.endsWith('for-you')) {
      const recent = await statement(env, 'SELECT song_id FROM listening_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 1', user._id).first();
      seed = songById.get(recent?.song_id);
    }
    if (pathname.endsWith('smart') && !seed) throw problem(404, 'Select an available song for your mix.');
    return json({ recommendations: recommendations(library, seed, bounded(url.searchParams.get('n'), 12, 50)) });
  }
  if (pathname === '/api/playlists') {
    if (method === 'GET') {
      const lists = await rows(env, 'SELECT * FROM playlists WHERE owner_id = ? ORDER BY updated_at DESC', user._id);
      const entries = await rows(env, 'SELECT ps.* FROM playlist_songs ps JOIN playlists p ON p.id = ps.playlist_id WHERE p.owner_id = ? ORDER BY ps.position', user._id);
      return json({ playlists: lists.map(list => ({ _id: list.id, name: list.name, owner: user._id,
        songs: entries.filter(e => e.playlist_id === list.id && songById.has(e.song_id)).map(e => ({ song: songById.get(e.song_id) })) })) });
    }
    if (method === 'POST') {
      const data = await body(request); const id = crypto.randomUUID(); const name = playlistName(data.name);
      const inserted = await statement(env, 'INSERT INTO playlists (id, owner_id, name, created_at, updated_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM playlists WHERE owner_id = ?) < 200', id, user._id, name, Date.now(), Date.now(), user._id).run();
      if (!inserted.meta.changes) throw problem(409, 'You can keep up to 200 playlists.');
      return json({ playlist: { _id: id, name, songs: [] } }, 201);
    }
  }
  const listRoute = /^\/api\/playlists\/([a-f0-9-]{36})(?:\/(songs|reorder)(?:\/([^/]+))?)?$/.exec(pathname);
  if (listRoute) {
    const [, id, action, songId] = listRoute;
    const list = await statement(env, 'SELECT * FROM playlists WHERE id = ? AND owner_id = ?', id, user._id).first();
    if (!list) throw problem(404, 'Playlist not found.');
    if (!action && method === 'DELETE') { await statement(env, 'DELETE FROM playlists WHERE id = ? AND owner_id = ?', id, user._id).run(); return json({ success: true }); }
    if (!action && method === 'PATCH') { const data = await body(request); await statement(env, 'UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', playlistName(data.name), Date.now(), id).run(); return json({ success: true }); }
    if (action === 'songs' && method === 'POST') {
      const data = await body(request); if (!songById.has(data.songId)) throw problem(404, 'Song not found.');
      await statement(env, 'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM playlist_songs WHERE playlist_id = ? HAVING COUNT(*) < 1000', id, data.songId, id).run();
      return json({ success: true });
    }
    if (action === 'songs' && songId && method === 'DELETE') { await statement(env, 'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', id, songId).run(); return json({ success: true }); }
    if (action === 'reorder' && method === 'PATCH') {
      const data = await body(request); const existing = await rows(env, 'SELECT song_id FROM playlist_songs WHERE playlist_id = ?', id);
      const ids = data.orderedSongIds;
      if (!Array.isArray(ids) || ids.length !== existing.length || new Set(ids).size !== ids.length || existing.some(row => !ids.includes(row.song_id))) throw problem(400, 'Provide each playlist song exactly once.');
      if (ids.length) await database(env).batch(ids.map((song, index) => statement(env, 'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?', index, id, song)));
      return json({ success: true });
    }
  }
  throw problem(404, 'This page or action was not found.');
}

function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return secure(await handleAPI(request, env));
      if (!['GET', 'HEAD'].includes(request.method)) return secure(json({ message: 'Method not allowed.' }, 405));
      const asset = assets[url.pathname] || (!url.pathname.includes('.') ? assets['/index.html'] : null);
      if (!asset) return secure(json({ message: 'Not found.' }, 404));
      return secure(new Response(request.method === 'HEAD' ? null : asset.body, { headers: { 'Content-Type': asset.mime, 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'private, no-store' } }));
    } catch (error) {
      if (!error.status) console.error('Music studio request failed', error.message);
      return secure(json({ success: false, message: error.status ? error.message : 'The music service is temporarily unavailable. Please retry.' }, error.status || 503));
    }
  },
};
