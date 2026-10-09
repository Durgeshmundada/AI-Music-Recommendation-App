# AI Music Recommendation App

Discover music with content-based recommendations, mood mixes, playlists, and a curated catalog of 72 Bollywood songs played through official YouTube videos. Signed-in users can upload full-length audio, manage their tracks, and track listening activity and daily challenges.

## Applications

- **Local app:** Express, MongoDB, JWT authentication, and a React/Vite frontend in `client/`.
- **Hosted app:** The separate implementation in [`hosted/`](hosted/README.md) uses a Cloudflare-compatible Worker, D1, R2, and Sites authentication. It does not share local accounts or uploaded files.
- **Python experiments:** Standalone recommendation scripts in the repository root. These are not required to run either web app.

## Run locally

Requirements: Node.js **22.12+**, npm, and MongoDB. Redis is optional. Use Node 24 to match CI.

```sh
npm ci
npm --prefix client ci
cp .env.example .env
cp client/.env.example client/.env
```

On Windows PowerShell, use `Copy-Item` instead of `cp` if preferred. Edit `.env`, set `MONGODB_URI`, and replace both `JWT_SECRET` and `JWT_REFRESH_SECRET` with separate random values. Generate each with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

With MongoDB running, import the curated catalog and start the backend:

```sh
npm run seed
npm run dev
```

In another terminal:

```sh
npm --prefix client run dev
```

Open **http://localhost:5173**. The example configuration uses **http://localhost:5002/api** for the backend. The catalog needs internet access to YouTube; embedding and playback availability depend on YouTube and the viewer's region.

For a production frontend build served by Express:

```sh
npm run build:frontend
npm start
```

Open **http://localhost:5002**. Configure production secrets, HTTPS, allowed origins, and persistent upload storage before deployment. See [music library and deployment details](FULL_TRACK_LIBRARY.md).

## Checks

```sh
npm run lint
npm test -- --runInBand
npm run build:frontend
npm run test:audio
```

The audio integration check requires MongoDB on `127.0.0.1:27017`; it creates and removes its own test database and temporary audio files. Hosted build and test instructions are in [`hosted/README.md`](hosted/README.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `server.js`, `config/` | Express entry point and configuration |
| `controllers/`, `routes/`, `middleware/` | API endpoints, authentication, validation, uploads |
| `models/`, `utils/` | MongoDB schemas and recommendation logic |
| `client/` | React player and application UI |
| `data/` | Curated song metadata |
| `scripts/`, `__tests__/` | Catalog tools and automated checks |
| `hosted/` | Hosted Worker implementation and database migrations |

Local environment files, uploads, backups, logs, dependencies, builds, model binaries, and CSV datasets are excluded from Git. To run the optional Python experiments, install their Python dependencies and provide the dataset filenames referenced by each script (`spotify_songs.csv` or `spotify_songs_fixed.csv`); generated model files remain local.

Historical audit documents and `*.IMPROVED.js` files are reference material, not the active application. Start with this README and `FULL_TRACK_LIBRARY.md` for current setup instructions.
