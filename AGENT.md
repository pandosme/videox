# AGENT.md — VideoX Developer & LLM Context Guide

This file exists to help an AI agent (or any new developer) quickly understand the VideoX project structure, conventions, and key design decisions. Read this before making changes.

---

## What This Project Is

**VideoX** is a self-hosted recording engine for **Axis IP cameras**. It is **not** a full VMS UI — it is infrastructure. It provides:

- Continuous H.264 passthrough recording into 60-second MP4 segments
- LL-HLS live streaming (~1–2 s latency)
- A RESTful API for integration with external systems
- A built-in React web UI for camera and system management
- Retention management with automatic cleanup

The intended consumer is **integrators** — VideoX is the backend, they build the client experience on top of the API.

---

## Repository Layout

```
videox/
├── src/                     # Node.js backend
│   ├── server.js            # Entry point — Express setup, startup sequence, graceful shutdown
│   ├── config/
│   │   └── database.js      # Mongoose connection manager + health monitoring
│   ├── middleware/
│   │   ├── auth/
│   │   │   ├── authenticate.js   # Dual-auth: session cookie OR Bearer API token
│   │   │   └── authorize.js      # Role check (admin / operator / viewer)
│   │   ├── errorHandler/
│   │   │   └── errorHandler.js   # Centralised error + 404 handlers
│   │   └── validation/           # express-validator chains (imported by routes)
│   ├── models/              # Mongoose schemas
│   │   ├── Camera.js        # Camera config + credentials + status
│   │   ├── Recording.js     # Segment metadata (path, times, size, flags)
│   │   ├── User.js          # User accounts (bcrypt passwords)
│   │   ├── ApiToken.js      # Long-lived API tokens
│   │   ├── AuditLog.js      # Audit trail
│   │   └── SystemConfig.js  # Key-value system settings (e.g. storagePath)
│   ├── routes/              # Express routers — thin, delegate to services
│   │   ├── auth.js          # Login / logout / session check
│   │   ├── cameras.js       # Camera CRUD + connection test + snapshot
│   │   ├── recordings.js    # Segment list, play-by-time (stream), protect, delete
│   │   ├── live.js          # Start / stop / status of HLS streams
│   │   ├── export.js        # Clip export across multiple segments
│   │   ├── storage.js       # Disk usage + per-camera breakdown
│   │   ├── events.js        # Event timeline (placeholder / InfluxDB)
│   │   ├── users.js         # User CRUD (admin only)
│   │   ├── system.js        # Health check + system info
│   │   └── apiTokens.js     # API token management
│   ├── services/
│   │   ├── camera/
│   │   │   └── vapixService.js      # VAPIX HTTP-Digest calls to Axis cameras
│   │   ├── recording/
│   │   │   └── recordingManager.js  # Spawns/tracks FFmpeg recording processes
│   │   ├── stream/
│   │   │   └── hlsStreamManager.js  # LL-HLS: FFmpeg + blocking-reload protocol
│   │   └── retention/
│   │       └── retentionManager.js  # Cron-based cleanup of old segments
│   └── utils/
│       ├── encryption.js    # AES-256-CBC for camera passwords (env: ENCRYPTION_KEY)
│       ├── jwt.js           # JWT generation/verification (legacy — sessions now preferred)
│       ├── logger.js        # Winston + daily-rotate-file
│       └── validators.js    # Reusable express-validator helpers
│
├── frontend/                # React 18 + Vite SPA (built into frontend/dist/)
│   ├── src/
│   │   ├── App.jsx          # Route definitions + ProtectedRoute wrapper
│   │   ├── main.jsx         # React 18 root + providers
│   │   ├── pages/           # One file per page (see Pages section below)
│   │   ├── components/      # Reusable UI components grouped by domain
│   │   ├── services/        # Axios wrappers per resource (mirrors backend routes)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   # Logged-in user state + login/logout helpers
│   │   │   └── ToastContext.jsx  # App-wide toast notifications
│   │   ├── hooks/           # Custom React hooks
│   │   └── utils/
│   │       └── dateFormatter.js
│   └── vite.config.js       # Vite config (dev proxy → localhost:3302)
│
├── docker-compose.yml       # Production: videox + mongodb containers
├── docker-compose.dev.yml   # Development overrides
├── Dockerfile               # Multi-stage build: build frontend → copy into Node image
├── package.json             # Backend dependencies + npm scripts
├── setup.sh                 # First-run convenience script
├── test/                    # Manual test scripts (not Jest)
│   ├── export-test.js       # Tests the export-clip API
│   └── verify-timestamps.sh # Extracts frames to verify timestamp accuracy
│
├── API.md                   # Full REST API reference (endpoints, auth, examples)
├── ARCHITECTURE.md          # Detailed component design + data models + deployment
├── CHANGELOG.md             # Version history
└── AGENT.md                 # This file
```

---

## Backend Key Concepts

### Startup Sequence (`src/server.js`)

`startup()` runs in order:
1. Connect MongoDB (retry × 5, 5 s interval — exits with code 2 on failure)
2. Check `SystemConfig` for an overriding `storagePath`
3. Create storage directory and verify write access
4. `hlsStreamManager.initialize()` — clears stale HLS segments from previous run
5. `recordingManager.initialize()` — resumes recording for any camera with `recordingState: 'recording'`
6. `retentionManager.initialize()` — schedules cron cleanup
7. Start HTTP server on `0.0.0.0:3302`

Graceful shutdown (`SIGTERM`/`SIGINT`) stops streams → recordings → retention → DB → exit 0.

### Authentication (`src/middleware/auth/`)

Two methods, checked in `authenticate.js` in this order:

| Method | Mechanism | Set by |
|---|---|---|
| Session | `express-session` cookie + `MongoStore` | Browser login (`POST /api/auth/login`) |
| API Token | `Authorization: Bearer <token>` | Admin creates via UI or `POST /api/tokens` |

`req.authType` is set to `'session'` or `'apiToken'`. `req.user` is populated with the user document.

### Recording (`src/services/recording/recordingManager.js`)

- One FFmpeg process per active camera
- **H.264 passthrough** (`-c:v copy -c:a copy`) — no transcoding, Zipstream preserved
- Segments: `-f segment -segment_time 60 -reset_timestamps 1`
- File path pattern: `{STORAGE_PATH}/recordings/{cameraId}/{YYYY}/{MM}/{DD}/{HH}/segment_{unixms}.mp4`
- On FFmpeg exit (unexpected): auto-restart after 10 s
- After each segment closes: creates a `Recording` document in MongoDB

### Live Streaming (`src/services/stream/hlsStreamManager.js`)

- LL-HLS: FFmpeg writes fMP4 parts (500 ms) to `{STORAGE_PATH}/hls/{cameraId}/`
- `EventEmitter` + `fs.watch` per stream — zero polling for part availability
- Blocking-reload endpoint: `GET /hls/:cameraId/playlist.m3u8?_HLS_msn=N&_HLS_part=P`
  - Holds the response until part P of MSN N is written, then replies immediately
  - Timeout: 10 s → HTTP 408
- Static segment serving via `express.static` on `/hls`
- Streams are on-demand: started by `POST /api/live/:cameraId/start`, stopped after idle timeout

### VAPIX Integration (`src/services/camera/vapixService.js`)

- HTTP Digest auth via `digest-fetch`
- Used for: device info, stream profiles, snapshot, RTSP URL construction, setting H.264 GOV
- GOV is set when a camera is added: `fps × 2` (e.g. 25 fps → GOV 50 = keyframe every 2 s)
- Modern API: `videoencoder.cgi`; legacy fallback: `param.cgi`

### Camera Credential Encryption

Passwords are encrypted with **AES-256-CBC** using `ENCRYPTION_KEY` from the environment before storage in MongoDB. The `encryption.js` utility handles encrypt/decrypt; routes and services always call `decrypt()` before using credentials.

### Retention (`src/services/retention/retentionManager.js`)

- Cron schedule from `CLEANUP_SCHEDULE` env var (default: `0 */6 * * *`)
- Deletes `Recording` documents + physical files where `retentionDate < now` and `protected !== true`
- Global retention default: `GLOBAL_RETENTION_DAYS` (default 30)

---

## Frontend Key Concepts

### Pages (`frontend/src/pages/`)

| Page | Route | Purpose |
|---|---|---|
| `Login.jsx` | `/login` | Auth form |
| `Dashboard.jsx` | `/` | System overview (cameras, storage, recent events) |
| `Cameras.jsx` | `/cameras` | Camera CRUD, connection test, snapshot |
| `LiveView.jsx` | `/live` | 2×2 LL-HLS player grid (Video.js + VHS) |
| `Playback.jsx` | `/playback` | Camera + date selector, 24-h timeline, Video.js player |
| `Recordings.jsx` | `/recordings` | Segment browser, protect/delete, inline playback |
| `Events.jsx` | `/events` | Event timeline |
| `Storage.jsx` | `/storage` | Disk usage + per-camera breakdown |
| `Settings.jsx` | `/settings` | System config + user management (admin) |

### API Service Layer (`frontend/src/services/`)

Each file is an Axios wrapper for one backend resource:

| File | Backend routes |
|---|---|
| `api.js` | Axios instance configured with `withCredentials: true` and base URL |
| `cameras.js` | `/api/cameras` |
| `recordings.js` | `/api/recordings` |
| `live.js` | `/api/live` |
| `storage.js` | `/api/storage` |
| `system.js` | `/api/system` |
| `apiTokens.js` | `/api/tokens` |

### Video.js / LL-HLS

Live streams use Video.js with `@videojs/http-streaming` (VHS). Key config:
- `html5.vhs.llhls: true`
- `html5.vhs.overrideNative: true` (required for LL-HLS in Safari)
- Source type: `application/vnd.apple.mpegurl`
- Playlist URL: `/hls/{cameraId}/playlist.m3u8`

---

## Data Models (Quick Reference)

### Camera (MongoDB)
```
_id: serial number (String)
name, address, port (554), credentials {username, password(encrypted)}
streamSettings {profile, resolution, fps, bitrate}
recordingSettings, retentionDays (default 30), active (Boolean)
status {connectionState, recordingState, lastSeen}
metadata {model, firmware, location, tags[], capabilities{}}
```

### Recording (MongoDB)
```
cameraId, filename, filePath (absolute), startTime, endTime
duration (seconds), size (bytes)
status: 'recording' | 'completed' | 'error'
protected (Boolean), retentionDate (Date)
eventTags [], metadata {resolution, codec, bitrate, fps}
```

### User (MongoDB)
```
username (unique), password (bcrypt), role: 'admin'|'operator'|'viewer'
active, lastLogin, createdAt, updatedAt
```

### ApiToken (MongoDB)
```
name, token (hashed), userId, expiresAt (nullable), lastUsed, active
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `STORAGE_PATH` | Yes | Absolute path for recordings, HLS, logs |
| `SESSION_SECRET` | Yes | Express-session signing key (32+ chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 key for camera passwords (32 chars) |
| `ADMIN_USERNAME` | Yes | Admin account created on first run |
| `ADMIN_PASSWORD` | Yes | Admin account password |
| `NODE_ENV` | No | `development` or `production` |
| `API_PORT` | No | HTTP port (default: 3302) |
| `LOG_LEVEL` | No | Winston log level (default: `info`) |
| `GLOBAL_RETENTION_DAYS` | No | Default retention period (default: 30) |
| `CLEANUP_SCHEDULE` | No | Cron expression (default: `0 */6 * * *`) |
| `MAX_CONCURRENT_STREAMS` | No | HLS stream limit (default: 20) |
| `MAX_CONCURRENT_EXPORTS` | No | Clip export concurrency (default: 3) |

---

## FFmpeg Usage Summary

VideoX spawns FFmpeg processes directly (not via `fluent-ffmpeg` pipelines) for:

| Use case | Key flags |
|---|---|
| Recording | `-c:v copy -c:a copy -f segment -segment_time 60 -reset_timestamps 1` |
| LL-HLS | `-f hls -hls_time 2 -hls_flags delete_segments+append_list -hls_segment_type fmp4 -hls_part_duration 0.5` |
| Playback (stream-by-time) | Two-pass seek: input `-ss` to keyframe + output `-ss` for precision |
| Export clip | Two-pass seek across multiple segment files, re-encode for exact trim |

---

## API Surface (Summary)

Full detail is in [API.md](./API.md). Key endpoint groups:

| Prefix | Purpose |
|---|---|
| `POST /api/auth/login` | Login (returns session cookie) |
| `GET /api/cameras` | List cameras |
| `POST /api/cameras` | Add camera (triggers VAPIX device info + GOV config) |
| `GET /api/recordings` | List segments with filters |
| `GET /api/recordings/stream-by-time` | Stream MP4 starting at a timestamp |
| `POST /api/export/clip` | Export MP4 clip across segments |
| `POST /api/live/:id/start` | Start LL-HLS stream |
| `GET /hls/:id/playlist.m3u8` | LL-HLS playlist (supports blocking reload) |
| `GET /api/storage` | Disk usage + per-camera breakdown |
| `GET /api/system/health` | Health check (public, no auth) |
| `POST /api/tokens` | Create API token |

Authentication: session cookie (browser) or `Authorization: Bearer <token>` (integrations).

---

## Conventions & Patterns

- **Routes are thin** — validation + auth middleware → delegate to service or model query → `res.json(result)`.
- **Services own FFmpeg processes** — `recordingManager` and `hlsStreamManager` are singletons with an in-memory `Map` of active processes.
- **Errors bubble to `errorHandler.js`** — routes use `next(err)` or `throw` inside `async` handlers wrapped with try/catch.
- **Logging**: always use `logger` from `src/utils/logger.js` — never `console.log`.
- **Camera passwords** are always decrypted immediately before use, never logged.
- **MongoDB `_id` for cameras** is the Axis serial number (string), not an auto-generated ObjectId.
- **Time** — the API accepts epoch seconds, ISO 8601, or ISO without milliseconds. Internally stored as `Date` objects in MongoDB.
- **Frontend state** — React Context (`AuthContext`, `ToastContext`) for global state; local `useState`/`useEffect` for component state. No Redux.

---

## Common Dev Tasks

### Run backend locally (without Docker)
```bash
# Requires: MongoDB running locally, FFmpeg in PATH
cp docker-compose.yml .env   # or create .env manually
npm install
npm run dev
```

### Run frontend locally
```bash
cd frontend
npm install
npm run dev   # Proxies /api and /hls to localhost:3302
```

### Build and run with Docker
```bash
docker-compose up -d --build
```

### View logs
```bash
docker-compose logs -f videox
# or from storage path:
tail -f videox-storage/logs/videox.log
```

### Run export/timestamp tests
```bash
node test/export-test.js
bash test/verify-timestamps.sh
```

---

## Known Design Decisions & Trade-offs

| Decision | Reason |
|---|---|
| H.264 passthrough (`-c:v copy`) | Zero CPU per camera, preserves Axis Zipstream (30–80 % smaller). Requires camera to output consistent keyframes — VideoX sets GOV via VAPIX on add. |
| 60-second segments | Balance between seek granularity and file count. |
| LL-HLS with fMP4 parts | Reduces live latency from 5–10 s (TS segments) to ~1–2 s without RTSP-direct complexity. |
| Blocking-reload in server | Required by LL-HLS spec — server holds client until new part is ready, removes need for aggressive polling. |
| Session + API token dual auth | Browser sessions are ergonomic for the web UI; API tokens are needed for headless integrations without password management. |
| MongoDB camera `_id` = serial | Makes camera identity stable across address/name changes; Axis serials are globally unique. |
| AES-256 credential encryption | Camera passwords are sensitive; in-DB encryption with env-key separation limits exposure from DB dumps. |
| No InfluxDB in default deploy | Events/metrics via InfluxDB are scaffolded but optional. The docker-compose.yml does not include InfluxDB; events routes return placeholder data unless InfluxDB is configured. |
