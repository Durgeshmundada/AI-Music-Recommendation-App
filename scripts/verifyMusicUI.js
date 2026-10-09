require('dotenv').config();
const { chromium } = require('@playwright/test');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const User = require('../models/User');
const Song = require('../models/Song');
const Recommendation = require('../models/Recommendation');
const { removeAudio } = require('../utils/audioStorage');
let browser;
let tester;

function makeAudio() {
  const bytes = Buffer.alloc(1440044);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const password = `Qa-${crypto.randomBytes(16).toString('hex')}!`;
  tester = await User.create({ name: 'Library QA', email: `library-qa-${Date.now()}@example.test`, password, isEmailVerified: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5002');
  await page.getByLabel('Email', { exact: true }).fill(tester.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  assert.equal(new URL(page.url()).hostname, 'localhost', 'Local playback must use a hostname, not a numeric loopback origin');
  await page.getByRole('button', { name: 'Music library & uploads', exact: true }).click();
  await page.locator('.library-track').first().waitFor();
  assert.equal(await page.locator('.library-track').count(), 30);
  console.log('PASS library loads 30 Bollywood favorites per page');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByText('Page 2 of', { exact: false }).waitFor();
  console.log('PASS catalog pagination');
  await page.getByLabel('Choose downloaded songs').setInputFiles({ name: 'Browser QA tone.wav', mimeType: 'audio/wav', buffer: makeAudio() });
  await page.getByLabel('I have permission to share these recordings with everyone using this app.').check();
  await page.getByRole('button', { name: 'Upload 1 song', exact: true }).click();
  await page.getByText('1 song added.', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Play Browser QA tone', exact: true }).click();
  await page.waitForFunction(() => { const audio = document.querySelector('audio'); return audio?.duration === 90 && audio.currentTime > 1 && !audio.paused; }, { timeout: 20000 });
  console.log('PASS upload and full-length local playback');
  const slider = page.getByLabel('Seek track');
  const bounds = await slider.boundingBox();
  await slider.click({ position: { x: bounds.width * 0.8, y: bounds.height / 2 } });
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 60);
  console.log('PASS seeking beyond one minute');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Browser QA tone', exact: true }).click();
  await page.getByText('Your collection starts here', { exact: true }).waitFor();
  assert.equal(await page.locator('audio').count(), 0);
  console.log('PASS delete button removes track and stops playback');
  await page.getByLabel('Track type').selectOption('bollywood');
  await page.getByLabel('Search library').fill('Tum Hi Ho');
  await page.getByRole('button', { name: 'Play Tum Hi Ho', exact: true }).click();
  await page.locator('iframe[title="Full song: Tum Hi Ho"]').waitFor({ timeout: 30000 });
  const videoBounds = await page.locator('.youtube-frame iframe').boundingBox();
  assert.ok(videoBounds.width >= 200 && videoBounds.height >= 200);
  assert.equal(await page.locator('audio').count(), 0, 'Videos must never silently fall back to previews');
  try {
    await page.waitForFunction(() => {
      const seek = document.querySelector('[aria-label="Seek track"]');
      return Number(seek?.max) > 180 && Number(seek?.value) > 1;
    }, null, { timeout: 45000 });
  } catch (error) {
    fs.mkdirSync(path.join(__dirname, '../logs/ui'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../logs/ui/youtube-playback-failure.png') });
    console.error('Player diagnostics:', await page.locator('.player-bar').innerText());
    console.error('YouTube frame:', await page.locator('.youtube-frame iframe').getAttribute('src'));
    throw error;
  }
  const videoSeek = page.getByLabel('Seek track');
  const videoSeekBounds = await videoSeek.boundingBox();
  await videoSeek.click({ position: { x: videoSeekBounds.width * 0.5, y: videoSeekBounds.height / 2 } });
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 60);
  const afterSeek = Number(await videoSeek.inputValue());
  await page.waitForFunction((previous) => Number(document.querySelector('[aria-label="Seek track"]')?.value) > previous + 1, afterSeek);
  assert.ok(await page.locator('.youtube-caption a').getAttribute('href').then((url) => url.startsWith('https://www.youtube.com/watch?v=')));
  assert.ok(await page.getByRole('button', { name: /^Repeat/ }).isEnabled());
  console.log('PASS official YouTube playback and advancing playback beyond 60 seconds; no preview audio');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Search library').fill('');
  await page.getByLabel('Sort tracks').selectOption('popular');
  await page.locator('.library-track').nth(29).waitFor();
  await page.getByRole('button', { name: 'Play this page', exact: true }).click();
  await page.getByText('Queue: 29', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('iframe[title="Full song: Channa Mereya"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 1, null, { timeout: 45000 });
  await page.getByRole('button', { name: 'Prev', exact: true }).click();
  await page.locator('iframe[title="Full song: Tum Hi Ho"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Seek track"]')?.value) > 1, null, { timeout: 45000 });
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat All', exact: true }).click();
  await page.getByLabel('Seek track').focus();
  await page.getByLabel('Seek track').press('End');
  await page.waitForFunction(() => {
    const seek = document.querySelector('[aria-label="Seek track"]');
    return Number(seek?.value) > 0 && Number(seek?.value) < 5;
  }, null, { timeout: 20000 });
  await page.getByRole('button', { name: 'Repeat One', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  console.log('PASS video queue, next, previous, and repeat at the real end of a song');
  await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0; });
  fs.mkdirSync(path.join(__dirname, '../logs/ui'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '../logs/ui/bollywood-desktop.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileVideo = await page.locator('.youtube-frame iframe').boundingBox();
  assert.ok(mobileVideo.width >= 200 && mobileVideo.height >= 200);
  await page.screenshot({ path: path.join(__dirname, '../logs/ui/bollywood-mobile.png'), fullPage: true });
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(sizes.content <= sizes.viewport + 1, `Mobile overflow: ${JSON.stringify(sizes)}`);
  assert.deepEqual(errors, []);
  console.log('PASS mobile layout and no JavaScript errors');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (tester) {
    const uploads = await Song.collection.find({ uploadedBy: tester._id }).toArray();
    for (const track of uploads) await removeAudio(track.storageKey);
    await Song.collection.deleteMany({ uploadedBy: tester._id });
    await Recommendation.deleteMany({ user: tester._id });
    await User.deleteOne({ _id: tester._id });
  }
  await mongoose.disconnect();
});
