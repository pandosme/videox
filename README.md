# VideoX - Axis Camera Recording Engine

A lightweight recording engine for Axis IP cameras that provides continuous recording with a RESTful API for client applications.

## What is VideoX?

VideoX is **not a complete VMS** - it's a backend recording engine that:
- Records continuously from Axis cameras (60-second MP4 segments)
- Provides RESTful API for live streaming, playback, and exports
- Manages storage with configurable retention policies
- Runs as a Docker container with embedded MongoDB

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
│    MongoDB      │  (embedded in container)
└────────┬────────┘
         │ VAPIX/RTSP
         ↓
┌─────────────────┐
│  Axis Cameras   │
└─────────────────┘
```

## Features

- **Continuous Recording**: Automatic 60-second MP4 segments organized by camera/date/time
- **Live Streaming**: HLS streaming with 2-second segments
- **Recording Playback**: Browse and stream recorded segments via API
- **Export Clips**: Extract clips from recordings with FFmpeg
- **Retention Management**: Automatic cleanup based on configurable retention periods
- **Storage Management**: Monitor disk usage per camera
- **Camera Management**: Add/remove Axis cameras via VAPIX API
- **Authentication**: JWT-based API authentication with admin credentials
- **Axis Zipstream Support**: Optimized for Axis compressed streams

## Quick Start (Docker)

### Prerequisites

- Docker and Docker Compose installed
- Axis cameras on your network
- Storage volume for recordings

### 1. Download docker-compose.yml

```bash
mkdir videox && cd videox
wget https://raw.githubusercontent.com/pandosme/videox/main/docker-compose.yml
```

### 2. Edit Configuration

Open `docker-compose.yml` and change:

```yaml
environment:
  # REQUIRED: Change these values
  ADMIN_USERNAME: admin
  ADMIN_PASSWORD: your_secure_password
  JWT_SECRET: your_48_char_jwt_secret
  ENCRYPTION_KEY: your_32_char_encryption_key
```

Generate security keys:
```bash
# JWT Secret (48+ characters)
node -e "console.log(require('crypto').randomBytes(48).toString('base64').slice(0,48))"

# Encryption Key (exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"
```

### 3. Configure Storage

By default, recordings are stored in `./videox-storage`. For production, change to a dedicated volume:

```yaml
volumes:
  - /mnt/storage/videox:/var/lib/videox-storage  # Change to your path
```

### 4. Start VideoX

```bash
docker-compose up -d
```

### 5. Verify Running

```bash
# Check status
docker-compose ps

# Check health
curl http://localhost:3002/api/system/health

# View logs
docker-compose logs -f videox
```

VideoX is now running at `http://your-server:3002`

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
VITE_API_URL=http://your-server:3002/api
```

The client provides:
- Camera management (add/remove/configure)
- Live view (2x2 grid)
- Recording browser and playback
- Export clip generation
- Storage statistics
- System monitoring

## API Overview

VideoX provides a RESTful API for client applications. All endpoints require JWT authentication except `/api/system/health` and `/api/auth/login`.

### Authentication

```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

Returns JWT access token for API requests.

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

All configuration is in `docker-compose.yml`:

### Recording Settings

```yaml
GLOBAL_RETENTION_DAYS: 30           # Keep recordings for 30 days
CLEANUP_SCHEDULE: "0 */6 * * *"     # Run cleanup every 6 hours
```

### Performance Limits

```yaml
MAX_CONCURRENT_STREAMS: 20          # Max simultaneous HLS streams
MAX_CONCURRENT_EXPORTS: 3           # Max simultaneous clip exports
```

### Network Settings

```yaml
CORS_ORIGIN: "*"                    # Allow all origins (restrict in production)
LOG_LEVEL: info                     # Logging level (debug, info, warn, error)
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

## Camera Requirements

- **Brand**: Axis Communications cameras only (uses VAPIX API)
- **Protocols**: HTTP (VAPIX), RTSP (streaming)
- **Credentials**: Username and password for camera access
- **Network**: Cameras must be accessible from VideoX server
- **Compatibility**: Works with all Axis cameras supporting VAPIX 3.0+
- **Zipstream**: Fully compatible with Axis Zipstream compression

## Updating

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d
```

## Backup

### Backup MongoDB

```bash
docker exec videox-mongodb mongodump --out /dump
docker cp videox-mongodb:/dump ./mongodb-backup-$(date +%Y%m%d)
```

### Backup Recordings

```bash
# Backup to external storage
tar czf recordings-backup.tar.gz /mnt/storage/videox/recordings
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# VideoX only
docker-compose logs -f videox

# Last 100 lines
docker-compose logs --tail=100 videox
```

### Check Storage

```bash
curl http://localhost:3002/api/storage/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Health

```bash
curl http://localhost:3002/api/system/health
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs videox

# Check disk space
df -h

# Verify configuration
docker-compose config
```

### Can't Access API

```bash
# Check if port is open
curl http://localhost:3002/api/system/health

# Check from another machine
curl http://server-ip:3002/api/system/health
```

### Recording Not Starting

```bash
# Check logs for FFmpeg errors
docker-compose logs videox | grep -i ffmpeg

# Verify camera is accessible
ping camera-ip

# Test RTSP stream manually
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@camera:554/axis-media/media.amp -t 5 test.mp4
```

### Exports Not Playing

This is usually due to Zipstream's variable bitrate. VideoX uses FFmpeg input seeking which handles this correctly. If exports still fail:

```bash
# Check FFmpeg logs
docker-compose logs videox | grep -i "export-clip"

# Verify source recording exists
docker exec videox ls -la /var/lib/videox-storage/recordings/
```

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
- Restrict CORS_ORIGIN in production
- Camera credentials are encrypted with AES-256
- API uses JWT authentication with 15-minute token expiry

## Technology Stack

- **Node.js 20** - Runtime
- **Express.js** - API framework
- **MongoDB 7** - Camera and recording metadata
- **FFmpeg** - Video processing (recording & streaming)
- **Docker** - Container runtime

## Support

- **Issues**: https://github.com/pandosme/videox/issues
- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **API Documentation**: [API.md](./API.md)
- **Docker Hub**: https://hub.docker.com/r/pandosme/videox

## License

MIT License - See LICENSE file for details

## Related Projects

- **videox-client** - Management UI for VideoX (React application)
  - GitHub: https://github.com/pandosme/videox-client
  - Provides camera management and video playback interface
