# AI Music Studio — hosted app

This is the cloud deployment of the existing React music app. It retains the official YouTube player, 72 Bollywood songs, queue, repeat, shuffle, search, recommendations, playlists, full audio uploads, and deletion. Uploaded recordings stay in object storage; playlists, listening history, upload ownership, quotas and catalog deletion records stay in the hosted database.

The site is public: anyone can browse, search, play full tracks, and use recommendations without an account. ChatGPT/Sites sign-in protects uploads, deletion, saved playlists, and listening history. Personal endpoints reject anonymous requests; all writes retain server-side ownership checks. Local MongoDB accounts and local uploaded files are not uploaded to the new deployment. `OWNER_EMAIL`, configured as a runtime secret through Sites, grants catalog administration to the verified site owner's email.

## Development

Use Node 22.12 or newer. Run `npm ci`, `npm run db:generate` after schema changes, `npm run build`, then `npm test`. Install the test browser with `npx playwright install chromium` if needed. Build emits a self-contained Cloudflare-compatible ES module under `dist/server/index.js`; generated browser assets are bundled inside the Worker. The deployment-specific source manifest, `.openai/hosting.json`, stays local and is excluded from Git. Configure your own Sites project when deploying a clone. Generated Drizzle migrations are schema-only and must be preserved after publication.

The upload endpoint streams original files up to 100 MB to object storage, validates format and duration, rejects duplicates, and enforces a 5 GB / 1,000-track quota per user. Files are shared with people who have access to the site. Byte-range playback supports seeking; deleting a file removes its playlist/history references. Only its owner or the studio administrator may delete an upload. Catalog deletion is restricted to the administrator and persists across deployments.

YouTube may show ads, block autoplay, or restrict particular videos by region. The visible player includes a direct YouTube link and retry control. Published music-video edits may differ in length from album recordings. No video extraction, audio mirroring, or 30-second preview fallback is used.

The optional browser WebMCP tool `get_music_player_state` only reads the visible player and queue. Unsupported browsers simply skip registration.
