# VideoX — Axis Camera Recording Engine

VideoX is a self-hosted recording engine for **Axis IP cameras**. It continuously records camera streams to disk, provides Low-Latency HLS (LL-HLS) live streaming, and exposes a RESTful API so you can build custom integrations on top of a solid recording infrastructure.

> **VideoX is a recording engine, not a full VMS.** It gives you the recording backend and a management web UI. You build the playback experiences on top of the API.

---

## Table of Contents

1. [What VideoX Does](#what-videox-does)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Configuration Reference](#configuration-reference)
5. [Web Interface](#web-interface)
6. [Operating VideoX](#operating-videox)
7. [Storage Management](#storage-management)
8. [API Integration](#api-integration)
9. [Backup & Recovery](#backup--recovery)
10. [Upgrading](#upgrading)
11. [Troubleshooting](#troubleshooting)
12. [Security](#security)
13. [System Requirements](#system-requirements)
14. [Camera Requirements](#camera-requirements)
15. [Technology Stack](#technology-stack)
16. [Documentation](#documentation)

---

## What VideoX Does

| Capability | Detail |
|---|---|
| **Continuous Recording** | 60-second MP4 segments, H.264 passthrough — no re-encoding |
| **Zipstream Preservation** | Axis Zipstream compression is kept intact (30–80 % smaller files) |
| **LL-HLS Live Streaming** | ~1–2 second live latency via HTTP (works in any browser) |
| **Recording Playback** | Frame-accurate seeking via two-pass FFmpeg; stream any time range |
| **Clip Export** | Export an MP4 clip spanning multiple recording segments |
| **Retention Management** | Automatic deletion of old recordings on a configurable schedule |
| **Camera GOV Configuration** | Automatically sets the H.264 keyframe interval on each Axis camera at add time |
| **Dual Authentication** | Session cookies for the web UI; Bearer API tokens for integrations |
| **Storage View** | Per-camera disk usage, model, serial, and recording age at a glance |
| **RESTful API** | Every function exposed via JSON API — suitable for custom client apps |

---

## Requirements

- **Docker** and **Docker Compose** (v2) on the host
- **Axis cameras** accessible from the VideoX host over the network
- Outbound HTTP (port 80/443) from VideoX host to cameras (VAPIX)
- VideoX initiates outbound RTSP connections to cameras (port 554) — no inbound RTSP needed

---

## Installation

### 1. Create a directory

```bash
mkdir videox && cd videox
```

### 2. Download the Docker Compose file

```bash
curl -O https://raw.githubusercontent.com/pandosme/videox/main/docker-compose.yml
```

### 3. Edit `docker-compose.yml`

Open the file and set the **required** values:

```yaml
ADMIN_USERNAME: admin                  # Your admin username
ADMIN_PASSWORD: change_this_password   # Strong password — change this

SESSION_SECRET: <generate below>       # 32+ character random string
ENCRYPTION_KEY: <generate below>       # Exactly 32 character random string
```

Generate security keys:
```bash
# SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"

# ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"
```

Set your storage path (left side of the volume mapping):
```yaml
volumes:
  - /your/storage/path:/var/lib/videox-storage
```

### 4. Start VideoX

```bash
docker compose up -d
```

### 5. Open the web interface

Navigate to `http://<host-ip>:3302` and log in with the credentials you set above.

### 6. Add your first camera

In the web UI, go to **Cameras → Add Camera** and fill in:
- IP address or hostname
- RTSP port (default: 554)
- Camera username and password

VideoX will connect, retrieve device information, configure the H.264 keyframe interval via VAPIX, and begin recording immediately once you enable it.

---

## Configuration Reference

All settings live in `docker-compose.yml` under the `environment:` section of the `videox` service.

### Required

| Variable | Description |
|---|---|
| `ADMIN_USERNAME` | Admin account username (created on first start) |
| `ADMIN_PASSWORD` | Admin account password |
| `SESSION_SECRET` | Random string for signing session cookies (32+ characters) |
| `ENCRYPTION_KEY` | Random string for encrypting camera passwords in the database (32 characters) |
| `MONGODB_URI` | MongoDB connection string (default: `mongodb://mongodb:27017/videox`) |
| `STORAGE_PATH` | Absolute path **inside the container** where recordings, HLS files, and logs are stored |

### Optional

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `API_PORT` | `3302` | HTTP port the server listens on |
| `LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |
| `GLOBAL_RETENTION_DAYS` | `30` | How many days to keep recordings (per-camera override available in UI) |
| `CLEANUP_SCHEDULE` | `0 */6 * * *` | Cron expression for the retention cleanup job |
| `MAX_CONCURRENT_STREAMS` | `20` | Maximum simultaneous live HLS streams |
| `MAX_CONCURRENT_EXPORTS` | `3` | Maximum simultaneous clip exports |

---

## Web Interface

The web UI is served from the same port as the API (`http://<host>:3302`).

### Pages

| Page | Description |
|---|---|
| **Dashboard** | System overview — active cameras, recording status, storage usage |
| **Cameras** | Add, edit, delete cameras; test connection; capture snapshots; start/stop recording |
| **Live View** | 2×2 grid of live camera streams (LL-HLS, ~1–2 s latency) |
| **Playback** | Select a camera and date, click a point on the 24-hour timeline, and play back recordings |
| **Recordings** | Browse and search all recording segments; protect or delete individual segments |
| **Events** | Event timeline from cameras |
| **Storage** | Per-camera disk usage, model, serial number, and age of oldest recording |
| **Settings** | System configuration, user management (admin), API token management |

### User Roles

| Role | Capabilities |
|---|---|
| `admin` | Full access — camera management, recording control, user management, system settings |
| `operator` | Camera view, live streaming, recording playback, event viewing |
| `viewer` | Live streaming and recording playback only (read-only) |

---

## Operating VideoX

### Start / Stop

```bash
# Start in background
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# View live logs
docker compose logs -f videox
```

### Recording Control

Recording is managed per camera from the **Cameras** page or via the API.

- Recordings **resume automatically** on server restart for any camera that was recording before shutdown.
- Segments are 60 seconds each, stored as MP4 with H.264 passthrough (no re-encoding).
- File path inside the container:  
  `{STORAGE_PATH}/recordings/{cameraSerial}/{YYYY}/{MM}/{DD}/{HH}/segment_{timestamp}.mp4`

### Live Streaming

Live streams start on demand when a client opens the **Live View** page (or calls `POST /api/live/:cameraId/start`). Streams stop automatically after a configured idle timeout when no clients are connected.

HLS files are stored temporarily in `{STORAGE_PATH}/hls/` and cleaned up automatically as the stream progresses.

### Retention

The retention manager runs on the schedule defined by `CLEANUP_SCHEDULE`. It deletes recording segments (database record + physical file) where the recording end time is older than the configured retention period.

**Protected recordings are never deleted.** To protect a recording, use the **Recordings** page or `PATCH /api/recordings/:id/protect`.

### API Tokens

API tokens allow external systems to authenticate without using a username and password. Create and manage tokens in **Settings → API Keys**.

- Tokens are displayed **only once** at creation — copy and store them securely.
- Tokens can be set to never expire, or given a specific expiry date.
- Revoke any token at any time from the Settings page.

---

## Storage Management

### Directory Structure

```
{STORAGE_PATH}/
├── recordings/
│   └── {cameraSerial}/
│       └── {YYYY}/{MM}/{DD}/{HH}/
│           └── segment_{unixms}.mp4
├── hls/
│   └── {cameraSerial}/     # Temporary LL-HLS segments (active streams only)
└── logs/
    └── videox.log          # Application log (daily rotation)
```

### Storage Estimates

Axis Zipstream is fully preserved — actual consumption depends on the camera's configured bitrate and scene activity.

| Scenario | Approximate |
|---|---|
| Low-activity, Zipstream-optimised | 5–10 MB/hour per camera |
| Typical indoor camera | 10–20 MB/hour per camera |
| High-resolution, busy scene | 20–40 MB/hour per camera |

Example: 10 cameras × 15 MB/hr average × 24 h × 30 days ≈ **108 GB**

### Changing the Storage Path

Edit the volume mapping in `docker-compose.yml`:

```yaml
volumes:
  - /mnt/nas/videox-storage:/var/lib/videox-storage
```

Then restart: `docker compose down && docker compose up -d`

### Monitoring Disk Usage

```bash
# System health + disk space (no auth required)
curl http://localhost:3302/api/system/health

# Per-camera breakdown (auth required)
curl -b cookies.txt http://localhost:3302/api/storage
```

---

## API Integration

VideoX exposes its full functionality via a REST API — the intended integration point for custom clients, playback UIs, and automation.

### Quick Start

```bash
# 1. Login and save a session cookie
curl -c cookies.txt -X POST http://localhost:3302/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'

# 2. List cameras
curl -b cookies.txt http://localhost:3302/api/cameras

# 3. Stream a recording starting at a specific time (epoch seconds)
curl -b cookies.txt \
  "http://localhost:3302/api/recordings/stream-by-time?cameraId=<serial>&startTime=<epoch>" \
  --output clip.mp4

# 4. Export a time-range clip
curl -b cookies.txt -X POST http://localhost:3302/api/export/clip \
  -H "Content-Type: application/json" \
  -d '{"cameraId":"<serial>","startTime":<epoch>,"endTime":<epoch>}' \
  --output export.mp4
```

For Bearer token auth (headless / integrations):
```bash
curl http://localhost:3302/api/cameras \
  -H "Authorization: Bearer <your-api-token>"
```

Full API reference: **[API.md](./API.md)**

---

## Backup & Recovery

### Back up the database

```bash
docker exec videox-mongodb mongodump --out /dump
docker cp videox-mongodb:/dump ./mongodb-backup-$(date +%Y%m%d)
```

### Restore the database

```bash
docker cp ./mongodb-backup-20260301 videox-mongodb:/dump
docker exec videox-mongodb mongorestore /dump
```

### Back up recordings

```bash
# rsync to another location (recommended — faster, resumable)
rsync -av /path/to/videox-storage/recordings/ backup-host:/backups/videox/
```

### What to back up

| Data | Location | Priority |
|---|---|---|
| Camera configs, users, tokens | MongoDB Docker volume `mongodb-data` | Critical |
| Recording segments | `{STORAGE_PATH}/recordings/` | Important |
| Application logs | `{STORAGE_PATH}/logs/` | Optional |

---

## Upgrading

```bash
# Pull the latest image
docker compose pull

# Restart with the new image (data is preserved)
docker compose up -d

# Confirm the new version is running
docker compose logs videox | grep "VideoX starting"
```

MongoDB data (Docker volume) and recordings (host-mounted path) are preserved across upgrades.

---

## Troubleshooting

### Container fails to start

```bash
docker compose logs videox          # Check startup error messages
docker compose config               # Validate compose file syntax
df -h                               # Check available disk space
```

**Common causes:**
- Missing required environment variable — verify all variables in [Configuration Reference](#configuration-reference) are set
- MongoDB not yet healthy — VideoX retries 5× with 5 s delay; if MongoDB is slow, wait and retry
- Storage path not writable — ensure the host directory exists and the container user can write to it

### Cannot reach the web interface

```bash
docker compose ps                              # Is the container running?
curl http://localhost:3302/api/system/health   # Test from the host
```

Check that port 3302 is not blocked by a firewall or in use by another process.

### Recording not starting

```bash
docker compose logs videox | grep -i "ffmpeg\|recording\|error"
ping <camera-ip>   # Can VideoX reach the camera?
```

**Common causes:**
- Wrong camera credentials — edit the camera in the UI and use "Test Connection"
- Camera unreachable — verify network routing and no firewall blocking RTSP (port 554)
- Unsupported stream profile — check the camera's configured stream profiles

### Live stream won't load

```bash
docker compose logs videox | grep -i "hls\|stream"
```

- Confirm the stream was started via the Live View page or `POST /api/live/:cameraId/start`
- Verify `{STORAGE_PATH}/hls/` exists and has free space
- On Safari, ensure the player has `overrideNative: true` (the built-in UI handles this automatically)

### MongoDB connection issues

```bash
docker compose logs videox-mongodb   # Check MongoDB container logs
docker compose restart               # Restart both services
```

### Recordings larger than expected

Zipstream is preserved in passthrough mode, but the actual bitrate depends on the camera's video profile settings. Log in to the Axis device web interface and configure the stream profile to use Zipstream with an appropriate target bitrate.

---

## Security

**VideoX is designed for trusted local networks.** Observe these guidelines:

- **Change default credentials** immediately — update `ADMIN_USERNAME` and `ADMIN_PASSWORD` before first use
- **Generate strong keys** — use the commands in the [Installation](#installation) section for `SESSION_SECRET` and `ENCRYPTION_KEY`
- **Do not expose port 3302 directly to the internet** — use an NGINX reverse proxy with TLS for external access
- **Set `NODE_ENV=production`** when deploying behind HTTPS — this enables the `Secure` flag on session cookies
- **Camera passwords** are stored AES-256-CBC encrypted in MongoDB; never share or expose `ENCRYPTION_KEY`
- **Use API tokens, not passwords**, for integrations — tokens can be revoked individually without changing the admin password

### NGINX Reverse Proxy (HTTPS)

```nginx
server {
    listen 443 ssl;
    server_name videox.example.com;

    ssl_certificate     /etc/letsencrypt/live/videox.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/videox.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3302;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        # Needed for video streaming responses
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

---

## System Requirements

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB | 500 GB+ |
| Network | 100 Mbps | 1 Gbps |
| OS | Linux with Docker | Ubuntu 22.04 LTS / Debian 12 |

CPU load per recording camera is very low — VideoX uses H.264 passthrough, so FFmpeg muxes rather than transcodes.

---

## Camera Requirements

- **Brand**: Axis Communications only (VAPIX API required)
- **Protocols**: HTTP/HTTPS (VAPIX) and RTSP
- **User account**: Local account on the camera with Operator or Administrator role
- **Network**: Camera must be directly reachable from the VideoX host
- **VAPIX version**: 3.0 or newer
- **Zipstream**: Fully compatible — compression is preserved in recordings

---

## Technology Stack

| Component | Technology |
|---|---|
| Backend runtime | Node.js 20 |
| API framework | Express.js |
| Database | MongoDB 7 |
| Video processing | FFmpeg |
| Frontend | React 18 + Vite |
| Video playback | Video.js + VHS (LL-HLS) |
| Containerisation | Docker + Docker Compose |

---

## Documentation

| Document | Contents |
|---|---|
| [API.md](./API.md) | Complete REST API reference — endpoints, authentication, request/response examples |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data models, service internals, deployment patterns |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [AGENT.md](./AGENT.md) | Developer/LLM guide — code structure, conventions, design decisions |

---

## Support

- **Issues**: https://github.com/pandosme/videox/issues
- **Docker Hub**: https://hub.docker.com/r/pandosme/videox

---

## License

MIT — see [LICENSE](./LICENSE) for details.
