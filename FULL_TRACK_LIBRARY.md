# Bollywood music library and full-length uploads

Open the app and select **Music library & uploads**. The default view shows **Bollywood favorites**. Select **My uploads** to manage files you added or **Full tracks** for videos and complete uploaded recordings.

## Catalog

The current library contains **72 Bollywood favorites**, all using official YouTube videos instead of iTunes previews. The verified manifest is `data/bollywood-youtube.json`, including publisher channel IDs, video titles, actual video durations, and verification timestamps.

At the user's request, all 2,264 previous songs were removed before importing the Bollywood selection. A recovery snapshot (Extended JSON plus any locally uploaded audio) is stored in `backups/library-2026-10-09T06-47-42-166Z`. User accounts and playlist names were preserved; song references and listening history for removed tracks were cleared.

The selection spans modern favorites and classic Hindi film songs. Original-artist music videos, lyric videos, and official audio videos are embedded from T-Series, Sony Music India, YRF, Tips, Zee Music Company, Saregama, Ishtar and Shemaroo. Video lengths are approximately 3–8 minutes. A publisher's music-video edit can differ from its album recording; the displayed duration matches the selected video. Ordering is editorial, not a live popularity ranking.

Run `npm run catalog:bollywood` (also `npm run seed`) to import the manifest. Existing Bollywood preview records are upgraded in place, preserving their IDs and playlist references. Previous preview metadata is backed up before migration. Imports preserve user uploads and deletion tombstones. `npm run catalog:verify` checks official publisher names against YouTube's oEmbed metadata without modifying the database. Metadata availability does not guarantee playback in every region. The older iTunes and Incompetech importers are legacy tools and are not run by the default seed command.

The official YouTube IFrame player remains visible at a minimum 200×200 pixels, with native controls, branding and ads. It supports next/previous, queues, shuffle, repeat, seeking and volume. Playback pauses when the browser tab is hidden. Videos are never downloaded, extracted into audio, or silently replaced by previews. YouTube can require interaction/sign-in, show ads, or restrict a video by region or embedding settings. Errors offer a direct **Open on YouTube** link and a reload button. Internet access to YouTube is required. Uploads continue to use the app's audio player.

## Upload and delete

- Sign in, choose downloaded files, confirm sharing permission, and press **Upload songs**. Files are added to this app's **shared library**, visible/playable by everyone using the app; uploads are not private storage.
- Supported formats: MP3, M4A, WAV, FLAC, OGG. Browser codec support varies. Each file can be up to 100 MB and six hours long. Original files are preserved; no transcoding, clipping, or synthetic fallback audio.
- File tags supply title, artist, album, and genre. Missing titles use the filename; missing artists display as Unknown artist. You can select many files; the client uploads sequentially and reports failures individually.
- Server checks include authentication, extension/signature validation, audio metadata parsing, SHA-256 duplicate detection, disk streaming, rate limiting, and a per-user database lease around storage quota checks. Failed uploads remove temporary files.
- Default per-user quota is 5 GB / 1,000 files. Configure `AUDIO_USER_QUOTA_MB` and `AUDIO_USER_MAX_FILES`. `AUDIO_STORAGE_DIR` selects persistent disk storage (default: `storage/audio`). Library pagination supports larger catalogs without loading every track into the browser.
- Uploaders can delete their own tracks; admins can delete catalog tracks and any upload. A confirmation appears before deletion. Deletion hides the track, removes playlist/history/recommendation references, clears caches, and removes the local recording. A minimal tombstone remains to prevent re-import. Deletion can be retried if storage cleanup fails.
- `GET /api/songs/:id/audio` supports HTTP byte ranges for seeking. Audio is only served for active uploads; the storage directory itself is not exposed.

## Run and deploy

Use Node **22.12+** (tested with Node 24), MongoDB, and a persistent filesystem. Redis is optional.

```sh
npm ci
npm --prefix client ci
npm run catalog:bollywood
npm run build:frontend
npm start
```

The backend serves the built frontend and API on port 5002 (or `PORT`). Production builds use the same origin for API requests. For a separate API host, set `VITE_PUBLIC_API_URL` at build time and configure `FRONTEND_URL` / `ALLOWED_ORIGINS` on the backend. `VITE_API_URL` is only used by the development frontend.

The server CSP allows the official YouTube script/frame origins. Preserve `Referrer-Policy: strict-origin-when-cross-origin` at your proxy/CDN; stripping the embedding site's origin can cause YouTube error 153. Keep iframe controls unobstructed and do not hide the video while playing.

For local use, open **http://localhost:5002** (built app) or **http://localhost:5173** (Vite). The frontend redirects `127.0.0.1` to `localhost` on the same port: YouTube rejected music embeds on the numeric loopback origin during testing, while the real `localhost` origin worked. This may require signing in once on the hostname; no authentication data is copied between origins.

Before public deployment, configure HTTPS at the reverse proxy, `NODE_ENV=production`, strong access/refresh JWT secrets, and the exact frontend origin. Forward the original Host and `X-Forwarded-Proto` headers. Set the proxy upload limit above 100 MB (e.g. 105 MB), allow uploads up to five minutes, and preserve Range/Content-Range headers. Back up MongoDB **and** the audio directory; ephemeral serverless disks are unsuitable. For multiple application replicas, use shared persistent storage and a shared rate limiter, or move audio to object storage. Monitor free disk space, database backups, logs, and source availability.

This change validates the music-library flows; it is not a certification that every pre-existing application feature is production-ready. Public load testing, backup restoration, deployment monitoring, and the existing account/email flows still need environment-specific verification. The old Node 18 `pkg` executable builder is a legacy path and has not been updated or validated for the new Node 22+ audio parser. Deploy the Node service described above.

## Verification

- `npm test -- --runInBand`: existing unit tests plus catalog validation against duplicate entries, unofficial channels, malformed video IDs and short clips.
- `npm run test:audio`: 24 integration assertions against a unique temporary local MongoDB database. Includes fake-file rejection, a real 90-second WAV, playback beyond 60 seconds, quotas, unauthorized deletion, cleanup, and import tombstones. Deletes only its own temporary database/files.
- `npm run test:ui`: local browser smoke test using installed Microsoft Edge and the running app at `http://127.0.0.1:5002` (override `APP_URL`). Creates/removes a disposable QA account and fixture; checks Bollywood pagination, upload, uploaded audio playback, seeking, deletion, real YouTube playback past 60 seconds, official links, minimum player size and mobile overflow. Requires local MongoDB, Edge and network access to YouTube; playback restrictions can make this external-service check fail. Screenshots go to `logs/ui`.
- `npm audit --omit=dev` and `npm --prefix client audit`: no known vulnerabilities in the tested runtime/frontend dependency trees at implementation time. Backend development tools still have audit findings; they are excluded from a runtime-only install.

Video, audio and artwork belong to their respective rights holders and play through the official platform. Integration reference: [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).
