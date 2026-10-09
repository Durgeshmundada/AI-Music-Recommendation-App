# AI Music Recommendation App - Full Project Details

## 1) Project Overview

This project is an end-to-end AI-powered music recommendation platform with:

- A secure backend API (Node.js + Express + MongoDB)
- A modern frontend web app (React + Vite)
- Personalized recommendation logic based on audio features and user behavior
- Playlist management, listening history, and gamification (daily challenges)

The app lets users discover songs, play previews, generate smart mixes, build playlists, and get personalized "For You" recommendations.

## 2) AI-Assisted Development Note (Important)

This project was completed with significant AI assistance.

My role was to guide the AI through the entire development lifecycle:

- Defined product requirements and feature scope
- Directed architecture and module-level implementation
- Reviewed and validated generated code
- Tested behavior and requested fixes/refinements
- Decided final business logic, UX flow, and production configuration

Short statement you can reuse:

"This project was built with AI assistance; I led the process by defining requirements, guiding implementation decisions, and validating the final system."

## 3) Problem Statement

Most music apps provide large catalogs but weak personalization for small/independent projects. This system was built to provide:

- Fast discovery (search + filtering)
- Personalized song recommendations
- Mood-based playlist generation
- User engagement through progress and challenge mechanics

## 4) Core Objectives

- Build a full-stack music product with production-ready backend patterns
- Support authentication, user state, and protected resources
- Implement explainable recommendation logic
- Track user interactions to improve personalization
- Provide an attractive and usable frontend listening experience

## 5) High-Level Architecture

### Frontend

- React 18 (Vite)
- React Router for protected/public routes
- Axios API client with retries for transient failures
- Context-based state management with `AuthContext` for auth/session state
- Context-based state management with `PlayerContext` for queue, playback, history, shuffle/repeat

### Backend

- Node.js + Express REST API
- MongoDB with Mongoose schemas/models
- JWT-based access + refresh token auth
- Middleware-driven security and validation
- Recommendation engine with score composition and cache layer

### Supporting Services

- Redis (optional) for caching recommendations/search
- iTunes Search API for external song enrichment and playable previews

## 6) Tech Stack

### Backend

- `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`
- `helmet`, `cors`, `express-rate-limit`, `mongo-sanitize`, `cookie-parser`
- `ioredis` (cache), `winston` (logging)
- `jest`, `supertest`, `eslint`, `prettier`

### Frontend

- `react`, `react-dom`, `react-router-dom`, `axios`, `vite`

## 7) Main Functional Modules

### 7.1 Authentication and Account

Implemented APIs and flows for:

- Register / Login / Logout
- Refresh token flow
- Change password
- Forgot password + reset password via one-time token
- Email verification request + verify token
- Fetch authenticated profile (`/auth/me`)

Security details:

- Access token and refresh token separation
- HttpOnly cookies supported
- Password hashing via bcrypt
- Token type validation (`access` vs `refresh`)

### 7.2 Song Catalog and Search

Features:

- Browse songs with filters: genre, mood, energy range
- Facets endpoint for available genres/moods
- Search by song/artist with fuzzy ranking
- Optional external sync from iTunes when local results are low
- Search result caching for performance

Search logic combines:

- Regex matching
- Token matching
- Levenshtein-based fuzzy similarity
- Popularity-aware scoring

### 7.3 Recommendation Engine

The recommendation system combines multiple signals:

- Content similarity via cosine similarity on audio features (`energy`, `valence`, `danceability`, `acousticness`, `instrumentalness`)
- User taste profile from recent listening history
- Mood/genre/artist affinity
- Popularity trending signal

Final score is weighted:

- Content-based: `0.58`
- Taste profile: `0.20`
- Mood match: `0.08`
- Genre match: `0.08`
- Artist match: `0.03`
- Trending: `0.03`

Outputs include:

- Ranked recommendations
- Strength percentage
- Human-readable reasons (explainability)

### 7.4 Personalization Features

- "Smart Mix" per selected seed track
- "For You" recommendations generated from recent listening seeds
- Mood playlist generation by target duration (minutes)
- Recommendation interaction tracking: clicked/played/skipped

### 7.5 Playlists

Users can:

- Create playlist
- Rename/update playlist metadata
- Add/remove songs
- Reorder songs with explicit ordering API
- Delete playlists

Ownership checks are enforced per playlist.

### 7.6 Listening History and Telemetry

When songs are played:

- Song-level `playCount` is incremented
- User `listeningHistory` stores `songId`, timestamp (`playedAt`), and duration listened

This history powers personalization and "continue listening" views.

### 7.7 Gamification (Daily Challenge)

Implemented daily challenge system:

- Deterministic challenge generation by UTC date key (`YYYY-MM-DD`)
- Goals include target plays, artists, mood matches, and high-energy plays
- XP rewards + streak logic
- Claim history and leaderboard endpoints

Timezone policy:

- Fully UTC-based to prevent client/server mismatch.

## 8) Backend API Surface (Summary)

### Auth routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email/request`
- `POST /api/auth/verify-email`
- `GET /api/auth/me`
- `GET /api/auth/challenge/status`
- `GET /api/auth/challenge/history`
- `GET /api/auth/challenge/leaderboard`
- `POST /api/auth/challenge/claim`

### Songs routes

- `GET /api/songs`
- `GET /api/songs/facets`
- `GET /api/songs/search`
- `GET /api/songs/recent`
- `GET /api/songs/continue`
- `GET /api/songs/:id`
- `POST /api/songs`
- `POST /api/songs/:id/play`

### Recommendation routes

- `GET /api/recommendations`
- `GET /api/recommendations/smart`
- `GET /api/recommendations/for-you`
- `GET /api/recommendations/mood`
- `POST /api/recommendations/:recommendationId/track`

### Playlist routes

- `POST /api/playlists`
- `GET /api/playlists`
- `PATCH /api/playlists/:id`
- `POST /api/playlists/:playlistId/songs`
- `DELETE /api/playlists/:playlistId/songs/:songId`
- `PATCH /api/playlists/:playlistId/reorder`
- `DELETE /api/playlists/:id`

## 9) Data Model Summary

### `User`

- Identity/auth fields: name, email, password hash, role
- Verification status
- Listening history
- Gamification stats and claim metadata

### `Song`

- Metadata: name, artist, album, genre, duration
- Audio features: energy, valence, danceability, etc.
- Preview/image/external links
- Play metrics: popularity, playCount

### `Recommendation`

- Source song + recommended song + user context
- Algorithm sub-scores
- Final score and strength
- Tracking flags (clicked/played/skipped)

### `Playlist`

- Owner
- Name/description/mood
- Ordered song list

## 10) Security and Reliability Measures

- `helmet` security headers
- CORS origin allowlist
- Route-specific rate limiting (auth, recovery, challenge claim, search)
- Payload size restrictions
- NoSQL sanitization
- Error handling with environment-based message exposure
- Health endpoint with DB connectivity status
- Graceful shutdown for process signals
- Structured request logging

## 11) Performance and Scalability Considerations

- Redis-backed cache for recommendations and search
- Cache invalidation after recommendation interaction updates
- Lean Mongo queries for lighter payloads where appropriate
- Bounded query params (limit/skip/min/max)
- External API fallback only when needed

## 12) Testing and Code Quality

- Jest test setup with coverage thresholds (global 70% targets)
- Unit tests for recommendation math and controller behavior
- Controller tests for playlist edge cases and challenge logic
- ESLint + Prettier configured for consistency

## 13) Build, Deployment, and Distribution

- Backend run modes: `npm run dev` (nodemon), `npm start` (node)
- Frontend build: `npm run build:frontend`
- Windows executable packaging: `npm run build:exe` (via `pkg`)
- Share bundle created under `dist-exe/share` with quick-start scripts

## 14) Local Setup (Quick Commands)

```bash
npm install
npm run seed
npm run dev
```

In a separate terminal:

```bash
cd client
npm install
npm run dev
```

## 15) Notable Strengths of This Project

- Full-stack integration from auth to recommendations to playback UX
- Explainable recommendation output (reasons + score components)
- Practical production hardening (rate limits, security middleware, graceful shutdown)
- Realistic user engagement loop (history -> personalization -> challenge rewards)

## 16) Resume/Portfolio Wording (AI-Guided Version)

Option A:

"Designed and directed an AI-assisted full-stack music recommendation platform (React, Node.js, MongoDB), defining requirements, validating generated code, and shipping secure auth, personalized recommendation pipelines, playlists, and gamification features."

Option B:

"Led development of an AI-assisted music recommendation app by guiding AI implementation, reviewing architecture decisions, and integrating production-ready backend security, caching, and personalized recommendation logic."
