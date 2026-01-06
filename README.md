# VideoX - Axis Camera Recording Engine

A lightweight recording engine for Axis IP cameras that provides continuous recording with a RESTful API for client applications.

## What is VideoX?

VideoX is **not a complete VMS** - it's a backend recording engine that:
- Records continuously from Axis cameras (60-second MP4 segments)
- Provides RESTful API for live streaming, playback, and exports
- Manages storage with configurable retention policies
- Runs as Docker container or with npm/Node.js

**VideoX does not include a UI** - you need a separate client application to manage cameras and view recordings. Install [videox-client](https://github.com/pandosme/videox-client) to manage one or more server instances.

## Architecture

```
┌─────────────────┐
│  videox-client  │  ← Separate repository (management UI)
│   (React App)   │
└────────┬────────┘
         │ HTTP/REST API
         ↓
┌─────────────────┐
│     VideoX      │  ← This repository (recording engine)
│  Recording API  │
├─────────────────┤
│    MongoDB      │  (embedded or external)
└────────┬────────┘
         │ VAPIX/RTSP
         ↓
┌─────────────────┐
│  Axis Cameras   │
└─────────────────┘
```

## Features

- **Continuous Recording**: Automatic 60-second MP4 segments organized by camera/date/time
  - Forced keyframes every 2 seconds for precise timestamp seeking
  - H.264 encoding with optimized parameters for recording
- **Live Streaming**: HLS streaming with 2-second segments
- **Recording Playback**: Browse and stream recorded segments via API
  - Timestamp-based seeking for frame-accurate playback
  - Dual-mode support: FFmpeg seeking or byte-range requests
- **Export Clips**: Extract clips from recordings with FFmpeg
  - Two-pass seeking for fast and accurate clip exports
  - Frame-accurate trimming to exact timestamps
  - Spans multiple segments seamlessly
- **Retention Management**: Automatic cleanup based on configurable retention periods
- **Storage Management**: Monitor disk usage per camera
- **Camera Management**: Add/remove Axis cameras via VAPIX API
- **Authentication**: Session-based authentication for web UI, API keys for external clients
- **Axis Zipstream Support**: Optimized for Axis compressed streams

## Quick Start

### Prerequisites

**For Docker deployment:**
- Docker and Docker Compose installed
- Axis cameras on your network

**For npm deployment:**
- Node.js 20+ and npm installed
- MongoDB server running
- FFmpeg installed
- Axis cameras on your network

### Installation

1. **Download or clone the repository**

   ```bash
   # Download latest release
   wget https://github.com/pandosme/videox/archive/refs/heads/main.zip
   unzip main.zip
   cd videox-main

   # Or clone with git
   git clone https://github.com/pandosme/videox.git
   cd videox
   ```

2. **Run the interactive setup script**

   ```bash
   ./setup.sh
   ```

   The setup script will guide you through:
   - Choosing deployment method (Docker or npm)
   - MongoDB configuration (embedded or external)
   - Admin credentials
   - Storage paths
   - Security keys generation
   - All necessary configuration

3. **Start VideoX**

   The setup script will show you how to start based on your chosen deployment method:

   **Docker:**
   ```bash
   docker-compose up -d
   ```

   **npm:**
   ```bash
   npm install
   npm start
   ```

4. **Verify it's running**

   ```bash
   # Check health
   curl http://localhost:3302/api/system/health

   # For Docker, view logs
   docker-compose logs -f videox
   ```

VideoX is now running at `http://localhost:3302` (or your configured port)

### Docker Deployment (Quick)

If you prefer Docker without the interactive setup:

1. Download docker-compose.yml:
   ```bash
   wget https://raw.githubusercontent.com/pandosme/videox/main/docker-compose.yml
   ```

2. Edit docker-compose.yml and change:
   - ADMIN_USERNAME and ADMIN_PASSWORD
   - SESSION_SECRET and ENCRYPTION_KEY (generate with commands below)
   - Storage path (optional)

3. Generate security keys:
   ```bash
   # Session Secret (32+ characters)
   openssl rand -base64 48 | tr -d '\n' | cut -c1-32

   # Encryption Key (32 characters)
   openssl rand -base64 32 | tr -d '\n' | cut -c1-32
   ```

4. Start:
   ```bash
   docker-compose up -d
   ```

## Management UI

VideoX does not include a user interface. To manage cameras and view recordings, you need the **videox-client**:

```bash
git clone https://github.com/pandosme/videox-client.git
cd videox-client
npm install
npm run dev
```

Configure the client to point to your VideoX server in `.env`:
```
VITE_API_URL=http://your-server:3302/api
```

The client provides:
- Camera management (add/remove/configure)
- Live view (2x2 grid)
- Recording browser and playback
- Export clip generation
- Storage statistics
- System monitoring

## API Overview

VideoX provides a RESTful API for client applications. All endpoints require authentication except `/api/system/health`.

### Authentication

**Web UI / Browser Clients:**
Session-based authentication using HTTP-only cookies:

```bash
# Login (creates session cookie)
curl -c cookies.txt -X POST http://localhost:3302/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'

# Use session cookie for subsequent requests
curl -b cookies.txt http://localhost:3302/api/cameras
```

**External API Clients:**
Use API tokens for programmatic access. Generate tokens via the web UI or API.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate and get JWT token |
| `/api/cameras` | GET | List all cameras |
| `/api/cameras` | POST | Add new camera |
| `/api/cameras/:id/recording/start` | POST | Start continuous recording |
| `/api/cameras/:id/recording/stop` | POST | Stop recording |
| `/api/recordings` | GET | List recordings (query by camera, date range) |
| `/api/recordings/export-clip` | GET | Export video clip |
| `/api/live/:cameraId/start` | GET | Start HLS live stream |
| `/api/live/:cameraId/stop` | POST | Stop live stream |
| `/api/storage/stats` | GET | Get storage statistics |
| `/api/system/health` | GET | Health check |

For complete API documentation, see [API.md](./API.md).

## Configuration

Configuration is stored in `.env` file (generated by setup.sh):

### Recording Settings

```bash
GLOBAL_RETENTION_DAYS=30           # Keep recordings for 30 days
CLEANUP_SCHEDULE="0 */6 * * *"     # Run cleanup every 6 hours
```

### Storage Structure

Recordings are organized as:
```
/var/lib/videox-storage/
├── recordings/
│   └── {cameraId}/
│       └── {YYYY}/
│           └── {MM}/
│               └── {DD}/
│                   └── {HH}/
│                       └── {cameraId}_segment_{timestamp}.mp4
├── hls/              # Live stream segments (temporary)
├── logs/             # Application logs
└── tmp/              # Temporary export files
```

### Performance Limits

```bash
MAX_CONCURRENT_STREAMS=20          # Max simultaneous HLS streams
MAX_CONCURRENT_EXPORTS=3           # Max simultaneous clip exports
```

## Docker Management

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f videox

# Restart
docker-compose restart

# Update to latest version
docker-compose pull
docker-compose up -d
```

## Backup

### Backup MongoDB (Docker with embedded MongoDB)

```bash
docker exec videox-mongodb mongodump --out /dump
docker cp videox-mongodb:/dump ./mongodb-backup-$(date +%Y%m%d)
```

### Backup Recordings

```bash
tar czf recordings-backup-$(date +%Y%m%d).tar.gz /path/to/videox-storage/recordings
```

## Monitoring

### Check Health

```bash
curl http://localhost:3302/api/system/health
```

### Check Storage

```bash
curl -b cookies.txt http://localhost:3302/api/storage/stats
```

### View Logs

**Docker:**
```bash
docker-compose logs -f videox
```

**npm:**
```bash
# Check configured log path in .env
tail -f /var/log/videox/videox.log
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs videox

# Verify configuration
docker-compose config

# Check disk space
df -h
```

### Can't Access API

```bash
# Check if service is running
docker-compose ps    # For Docker
ps aux | grep node   # For npm

# Test health endpoint
curl http://localhost:3302/api/system/health

# Check from another machine
curl http://server-ip:3302/api/system/health
```

### Recording Not Starting

```bash
# Check logs for FFmpeg errors
docker-compose logs videox | grep -i ffmpeg   # Docker
tail -f /var/log/videox/videox.log | grep -i ffmpeg   # npm

# Verify camera is accessible
ping camera-ip

# Test RTSP stream manually
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@camera:554/axis-media/media.amp -t 5 test.mp4
```

### MongoDB Connection Issues

**For npm deployment:**
```bash
# Verify MongoDB is running
sudo systemctl status mongod

# Test connection
mongosh mongodb://localhost:27017/videox
```

**For Docker with external MongoDB:**
```bash
# Test connection from container
docker-compose exec videox sh -c "wget -qO- mongodb-host:27017"
```

## Camera Requirements

- **Brand**: Axis Communications cameras only (uses VAPIX API)
- **Protocols**: HTTP (VAPIX), RTSP (streaming)
- **Credentials**: Username and password for camera access
- **Network**: Cameras must be accessible from VideoX server
- **Compatibility**: Works with all Axis cameras supporting VAPIX 3.0+
- **Zipstream**: Fully compatible with Axis Zipstream compression

## System Requirements

- **Minimum**: 2 CPU cores, 4GB RAM, 50GB storage
- **Recommended**: 4 CPU cores, 8GB RAM, 500GB+ storage
- **Storage**: ~10-50 MB/hour per camera (depends on resolution and Zipstream settings)
- **Network**: 1 Gbps recommended for multiple cameras

## Security Considerations

- VideoX is designed for **local network use only**
- Do NOT expose directly to the internet
- Use a reverse proxy with SSL/TLS if internet access is needed
- Change default admin credentials immediately
- Set `NODE_ENV=production` for production deployments (enables secure cookies)
- Camera credentials are encrypted with AES-256
- Web UI uses session-based authentication with HTTP-only cookies
- API tokens available for external integrations

## Technology Stack

- **Node.js 20** - Runtime
- **Express.js** - API framework
- **MongoDB 7** - Camera and recording metadata
- **FFmpeg** - Video processing (recording & streaming)
- **Docker** - Container runtime (optional)

## Documentation

- **API Documentation**: [API.md](./API.md) - Complete REST API reference
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and components
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md) - Version history

## Support

- **Issues**: https://github.com/pandosme/videox/issues
- **Docker Hub**: https://hub.docker.com/r/pandosme/videox

## License

MIT License - See LICENSE file for details

## Related Projects

- **videox-client** - Management UI for VideoX (React application)
  - GitHub: https://github.com/pandosme/videox-client
  - Provides camera management and video playback interface
