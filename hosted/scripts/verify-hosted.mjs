import { Miniflare } from 'miniflare';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';

const state = await fs.mkdtemp(path.join(os.tmpdir(), 'music-hosted-test-'));
const runtime = new Miniflare({ modules: true, scriptPath: path.resolve('dist/server/index.js'),
  compatibilityDate: '2026-07-01', d1Databases: ['DB'], r2Buckets: ['BUCKET'],
  d1Persist: path.join(state, 'db'), r2Persist: path.join(state, 'objects'),
  bindings: { OWNER_EMAIL: 'admin@example.test' } });
let browser; let server; let checks = 0;
const identity = { 'oai-authenticated-user-id': 'test-listener', 'oai-authenticated-user-email': 'listener@example.test', 'oai-authenticated-user-full-name': 'Music QA' };
const other = { 'oai-authenticated-user-id': 'test-other', 'oai-authenticated-user-email': 'other@example.test' };
const admin = { 'oai-authenticated-user-id': 'test-admin', 'oai-authenticated-user-email': 'admin@example.test' };
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); };
const fetchApp = (url, options = {}, user = identity) => runtime.dispatchFetch(`http://localhost${url}`, { ...options, headers: { ...user, ...options.headers } });
const jsonRequest = (method, data) => ({ method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(data) });
function wav(seconds = 90) {
  const bytes = Buffer.alloc(44 + seconds * 16000);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function upload(bytes, name = 'Full recording.wav', options = {}) {
  return fetchApp('/api/songs/upload', { method: 'POST', body: bytes, headers: {
    'Content-Length': String(bytes.length), 'Content-Type': 'application/octet-stream',
    'X-Rights-Confirmed': 'true', 'X-Upload-Filename': encodeURIComponent(name), ...options,
  } });
}

try {
  const db = await runtime.getD1Database('DB');
  for (const file of (await fs.readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await fs.readFile(path.join('drizzle', file), 'utf8');
    for (const part of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(part).run();
  }
  check((await fetchApp('/api/health')).ok, 'hosted database and storage initialize');
  check((await fetchApp('/api/songs', {}, {})).ok, 'public library is available without signing in');
  check((await fetchApp('/api/auth/me', {}, {}).then(r => r.json())).user === null, 'anonymous bootstrap returns no fabricated user');
  for (const route of ['/api/playlists', '/api/songs/recent', '/api/songs/continue', '/api/songs?mine=true']) {
    check((await fetchApp(route, {}, {})).status === 401, `anonymous requests cannot read personal data: ${route}`);
  }
  for (const [method, route] of [['POST', '/api/songs/upload'], ['POST', '/api/playlists'], ['DELETE', '/api/songs/yt_Umqb9KENgmk'], ['POST', '/api/songs/yt_Umqb9KENgmk/play']]) {
    check((await fetchApp(route, jsonRequest(method, {}), {})).status === 401, `anonymous writes are rejected: ${method} ${route}`);
  }
  check((await fetchApp('/api/recommendations/for-you', {}, {}).then(r => r.json())).recommendations.length === 12, 'guests can receive recommendations without private history');
  const profile = await fetchApp('/api/auth/me').then(r => r.json());
  check(profile.user.email === 'listener@example.test' && profile.user.role === 'user', 'platform identity maps to a durable user');
  const all = await fetchApp('/api/songs?playback=full&limit=100').then(r => r.json());
  check(all.total === 72 && all.songs.every(s => s.youtubeVideoId && !s.previewUrl), 'all 72 original songs use full official videos');
  check((await fetchApp('/api/songs?playback=preview').then(r => r.json())).total === 0, 'no 30-second preview catalog remains');
  check((await fetchApp('/api/songs?q=Tum%20Hi%20Ho').then(r => r.json())).total === 1, 'title search and full-track filtering work');
  check((await fetchApp('/api/songs?skip=30&limit=30').then(r => r.json())).songs[0]._id !== all.songs[0]._id, 'catalog pagination works');
  const listResponse = await fetchApp('/api/playlists', jsonRequest('POST', { name: 'Favorite songs' }));
  assert.equal(listResponse.status, 201, await listResponse.clone().text());
  const list = (await listResponse.json()).playlist;
  await fetchApp(`/api/playlists/${list._id}/songs`, jsonRequest('POST', { songId: all.songs[0]._id }));
  await fetchApp(`/api/playlists/${list._id}/songs`, jsonRequest('POST', { songId: all.songs[1]._id }));
  const reordered = [all.songs[1]._id, all.songs[0]._id];
  check((await fetchApp(`/api/playlists/${list._id}/reorder`, jsonRequest('PATCH', { orderedSongIds: reordered }))).ok, 'playlist order can be saved');
  const readLists = await fetchApp('/api/playlists').then(r => r.json());
  check(readLists.playlists[0].songs[0].song._id === reordered[0], 'saved playlist order persists on read');
  check((await fetchApp(`/api/playlists/${list._id}`, { method: 'DELETE' }, other)).status === 404, 'another user cannot delete your playlist');
  check((await fetchApp('/api/playlists', {}, other).then(r => r.json())).playlists.length === 0, 'playlists are isolated by user');
  check((await fetchApp('/api/playlists', { ...jsonRequest('POST', { name: 'Bad origin' }), headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' } })).status === 403, 'cross-origin writes are rejected');
  await fetchApp(`/api/songs/${all.songs[0]._id}/play`, jsonRequest('POST', { duration: 65 }));
  check((await fetchApp('/api/songs/continue').then(r => r.json())).songs[0].resumeFromSec === 65, 'listening history persists');
  check((await fetchApp(`/api/recommendations/smart?songId=${all.songs[0]._id}`).then(r => r.json())).recommendations.length === 12, 'recommendations return playable songs');
  check((await upload(Buffer.alloc(100), 'invalid.mp3')).status === 415, 'fake audio is rejected');
  check((await upload(wav(1), 'rights.wav', { 'X-Rights-Confirmed': 'false' })).status === 400, 'upload sharing consent is required');
  const uploaded = await upload(wav());
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const song = (await uploaded.json()).song;
  check(song.duration === 90000 && song.source === 'upload', 'full audio streams to object storage and metadata is verified');
  const guestRange = await fetchApp(song.audioUrl, { headers: { Range: 'bytes=1100000-1100099' } }, {});
  check(guestRange.status === 206 && (await guestRange.arrayBuffer()).byteLength === 100, 'guests can stream shared recordings beyond one minute');
  check((await upload(wav())).status === 409, 'duplicate uploads are rejected and cleaned up');
  const range = await fetchApp(song.audioUrl, { headers: { Range: 'bytes=1100000-1100099' } });
  check(range.status === 206 && (await range.arrayBuffer()).byteLength === 100 && range.headers.get('content-range') === 'bytes 1100000-1100099/1440044', 'range playback seeks beyond 60 seconds');
  check((await fetchApp(song.audioUrl, { headers: { Range: 'bytes=99999999-' } })).status === 416, 'invalid audio ranges are rejected');
  check((await fetchApp(`/api/songs/${song._id}`, { method: 'DELETE' }, other)).status === 403, 'another user cannot delete your audio');
  check((await fetchApp('/api/songs?mine=true', {}, other).then(r => r.json())).total === 0, 'My uploads is scoped to the current user');
  await fetchApp(`/api/playlists/${list._id}/songs`, jsonRequest('POST', { songId: song._id }));
  check((await fetchApp(`/api/songs/${song._id}`, { method: 'DELETE' })).ok, 'uploader can delete a recording');
  check((await fetchApp(song.audioUrl)).status === 404, 'deleted audio is unavailable');
  check((await (await runtime.getR2Bucket('BUCKET')).list()).objects.length === 0, 'deleted and rejected files leave no objects');
  check((await fetchApp(`/api/songs/${all.songs[0]._id}`, { method: 'DELETE' })).status === 403, 'catalog deletion is restricted to the studio owner');
  check((await fetchApp(`/api/songs/${all.songs[71]._id}`, { method: 'DELETE' }, admin)).ok, 'studio owner can delete a catalog track');
  check((await fetchApp('/api/songs?limit=100').then(r => r.json())).total === 71, 'catalog deletion persists without changing the manifest');
  await db.prepare('DELETE FROM removed_catalog').run(); // Isolated test database only.

  // This loopback-only test gateway simulates Sites' verified identity headers.
  // It is not part of the production Worker or the deployment archive.
  server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const requestBody = Buffer.concat(chunks);
      const anonymous = (req.headers.cookie || '').split(';').some(value => value.trim() === 'test-guest=1');
      const headers = { ...req.headers, ...(anonymous ? {} : identity) }; delete headers.host;
      const response = await runtime.dispatchFetch(`http://localhost:5413${req.url}`, { method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : requestBody });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) { for await (const chunk of response.body) res.write(Buffer.from(chunk)); }
      res.end();
    } catch (error) { console.error(error); res.writeHead(500); res.end('Test gateway failed'); }
  });
  await new Promise(resolve => server.listen(5413, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5413');
  await page.getByRole('button', { name: 'Music library & uploads', exact: true }).click();
  await page.locator('.library-track').nth(29).waitFor();
  check(await page.locator('.library-track').count() === 30, 'hosted frontend loads songs after platform sign-in');
  await page.getByLabel('Choose downloaded songs').setInputFiles({ name: 'Cloud QA.wav', mimeType: 'audio/wav', buffer: wav(91) });
  await page.getByLabel('I have permission to share these recordings with everyone using this app.').check();
  await page.getByRole('button', { name: 'Upload 1 song', exact: true }).click();
  await page.getByText('1 song added.', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Play Cloud QA', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio')?.duration === 91 && document.querySelector('audio')?.currentTime > 1);
  await page.getByLabel('Seek track').fill('65');
  await page.getByLabel('Seek track').press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 60);
  check(true, 'hosted upload button plays the full recording past one minute');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Cloud QA', exact: true }).click();
  await page.getByText('Your collection starts here', { exact: true }).waitFor();
  check(await page.locator('audio').count() === 0, 'hosted delete button removes the recording and stops playback');
  await page.getByLabel('Track type').selectOption('bollywood');
  await page.getByLabel('Sort tracks').selectOption('popular');
  await page.locator('.library-track').nth(29).waitFor();
  await page.getByRole('button', { name: 'Play this page', exact: true }).click();
  await page.locator('iframe[title="Full song: Tum Hi Ho"]').waitFor();
  await page.getByText('Queue: 29', { exact: true }).waitFor();
  if (process.env.TEST_YOUTUBE === '1') {
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.max) > 180, null, { timeout: 45000 });
    await page.getByLabel('Seek track').fill('65');
    await page.getByLabel('Seek track').press('ArrowRight');
    if (await page.getByRole('button', { name: 'Play', exact: true }).isVisible()) await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 67, null, { timeout: 45000 });
    check(true, 'real YouTube video playback advances past one minute');
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('iframe[title="Full song: Channa Mereya"]').waitFor();
  await page.getByRole('button', { name: 'Prev', exact: true }).click();
  await page.locator('iframe[title="Full song: Tum Hi Ho"]').waitFor();
  check(true, 'video queue, next and previous select the correct official videos');
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat All', exact: true }).click();
  if (process.env.TEST_YOUTUBE === '1') {
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.max) > 180, null, { timeout: 45000 });
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 1, null, { timeout: 45000 });
    const ending = Number(await page.getByLabel('Seek track').getAttribute('max')) - 3;
    await page.getByLabel('Seek track').fill(String(Math.floor(ending)));
    await page.getByLabel('Seek track').press('ArrowRight');
    await page.waitForFunction(() => { const s = document.querySelector('[aria-label="Seek track"]'); return Number(s?.value) > 0 && Number(s?.value) < 8; }, null, { timeout: 45000 });
    check(true, 'repeat-one restarts the full song at its actual end');
  }
  const video = await page.locator('.youtube-frame iframe').boundingBox();
  check(video.width >= 200 && video.height >= 200 && await page.locator('audio').count() === 0, 'official video stays visible with no preview fallback');
  await fs.mkdir('logs', { recursive: true });
  await page.screenshot({ path: 'logs/hosted-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileVideo = await page.locator('.youtube-frame iframe').boundingBox();
  check(mobileVideo.width >= 200 && mobileVideo.height >= 200, 'mobile video meets the minimum player dimensions');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile screen has no horizontal overflow');
  await page.screenshot({ path: 'logs/hosted-mobile.png' });
  check(errors.length === 0, `no frontend exceptions (${errors.join(', ')})`);
  await page.close();
  const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Scope test authentication to our loopback origin, never to YouTube requests.
  await guest.addCookies([{ url: 'http://localhost:5413', name: 'test-guest', value: '1' }]);
  const guestPage = await guest.newPage();
  const guestErrors = []; guestPage.on('pageerror', error => guestErrors.push(error.message));
  await guestPage.goto('http://localhost:5413/');
  await guestPage.locator('.library-track').nth(29).waitFor();
  check(guestPage.url().endsWith('/app') && await guestPage.getByRole('heading', { name: 'Your Bollywood listening room' }).isVisible(), 'fresh anonymous browser opens the library without a login redirect');
  check(await guestPage.locator('.delete-track-btn').count() === 0 && await guestPage.locator('input[type="file"]').count() === 0, 'guests see sign-in links instead of upload/delete controls');
  await guestPage.getByLabel('Search library').fill('Tum Hi Ho');
  await guestPage.waitForFunction(() => document.querySelectorAll('.library-track').length === 1);
  await guestPage.getByRole('button', { name: 'Play Tum Hi Ho', exact: true }).click();
  await guestPage.locator('iframe[title="Full song: Tum Hi Ho"]').waitFor();
  if (process.env.TEST_YOUTUBE === '1') {
    await guestPage.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.max) > 180, null, { timeout: 45000 });
    if (await guestPage.getByRole('button', { name: 'Play', exact: true }).isVisible()) await guestPage.getByRole('button', { name: 'Play', exact: true }).click();
    await guestPage.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 1, null, { timeout: 45000 });
    await guestPage.getByLabel('Seek track').fill('65');
    await guestPage.getByLabel('Seek track').press('ArrowRight');
    await guestPage.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 67, null, { timeout: 45000 });
    check(true, 'anonymous visitor plays the real full video past one minute');
  }
  await guestPage.getByRole('button', { name: 'Playlists', exact: true }).click();
  check(await guestPage.getByRole('link', { name: 'Sign in for playlists' }).isVisible(), 'saving playlists offers optional sign-in');
  check(await guestPage.locator('.inline-error').count() === 0 && guestErrors.length === 0, 'guest browsing produces no authentication errors or frontend exceptions');
  await guestPage.getByRole('button', { name: 'Music library & uploads', exact: true }).click();
  await guestPage.setViewportSize({ width: 390, height: 844 });
  check(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'guest mobile layout fits the screen');
  await guestPage.screenshot({ path: 'logs/public-mobile.png' });
  await guest.close();
  console.log(`${checks} hosted app checks passed.`);
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      console.error((await page.locator('body').innerText()).slice(-4000));
      await fs.mkdir('logs', { recursive: true });
      await page.screenshot({ path: 'logs/hosted-failure.png' });
    }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await runtime.dispose();
  const resolved = await fs.realpath(state);
  if (path.dirname(resolved) === await fs.realpath(os.tmpdir()) && path.basename(resolved).startsWith('music-hosted-test-')) await fs.rm(resolved, { recursive: true, force: true });
}
