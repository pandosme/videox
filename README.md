# VideoX - Axis Camera Recording Engine

A local recording engine for Axis IP cameras designed for integration with various systems and clients.

## What is VideoX?

VideoX is a **recording engine**, not a complete Video Management System (VMS). It provides:
- Continuous recording from Axis cameras (60-second MP4 segments, H.264 passthrough)
- Built-in web interface for camera management. It does not have a user interface for playback.
- RESTful API for integration with client applications
- Low-Latency HLS (LL-HLS) live streaming (~1–2 second latency)
- Storage management with configurable retention
- Docker-first deployment with embedded MongoDB

**VideoX is designed for integrators** - it provides the recording infrastructure and management interface while you build custom integrations for your specific use case.


## Key Capabilities

- **Continuous Recording**: 60-second MP4 segments using H.264 passthrough — no re-encoding, full Zipstream preservation
- **Camera GOP Configuration**: Automatically sets keyframe interval (GOV) on each Axis camera via VAPIX on add
- **Low-Latency HLS**: LL-HLS live streams with fMP4 segments and 500 ms parts (~1–2 s latency)
- **Recording Playback**: Timestamp-based playback with frame-accurate seeking (two-pass FFmpeg)
- **Export Clips**: Extract video clips spanning multiple recording segments
- **Retention Management**: Automatic cleanup with configurable retention periods
- **RESTful API**: Complete API for camera management, streaming, and playback
- **Dual Authentication**: Sessions for web clients, API keys for integrations
- **Axis Zipstream**: Recordings preserve Zipstream compression — 30–80 % smaller files at no quality cost

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Axis cameras on your network

### Installation

1. **Create a directory for VideoX**
   ```bash
   mkdir videox
   cd videox
   ```

2. **Download docker-compose.yml**
   ```bash
   wget https://raw.githubusercontent.com/pandosme/videox/main/docker-compose.yml
   ```

3. **Edit docker-compose.yml**

   Update these required settings:
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` - Your admin credentials
   - `./videox-storage` - Change to your desired storage location

   Optionally generate new security keys:
   ```bash
   # Session Secret (32+ characters)
   openssl rand -base64 48 | tr -d '\n' | cut -c1-32

   # Encryption Key (32 characters)
   openssl rand -base64 32 | tr -d '\n' | cut -c1-32
   ```

4. **Start VideoX**
   ```bash
   docker-compose up -d
   ```

5. **Open web interface**

   Go to `http://YOUR_IP:3302` in your browser and login with your admin credentials.

6. **Add Axis cameras**

   Use the web interface to add and configure your Axis cameras.

## Integration

VideoX includes a built-in web interface for managing cameras. For custom integrations to playback clients:

- **API Documentation**: [API.md](./API.md) - Complete endpoint reference and authentication
- **Architecture Guide**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and integration patterns

## Configuration

### Essential Settings

Edit `docker-compose.yml` or `.env` file:

```bash
# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password

# Security keys (generate with: openssl rand -base64 32 | cut -c1-32)
SESSION_SECRET=your_session_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# Recording retention
GLOBAL_RETENTION_DAYS=30           # Keep recordings for 30 days
CLEANUP_SCHEDULE="0 */6 * * *"     # Cleanup schedule (cron format)

# Storage path
STORAGE_PATH=/var/lib/videox-storage

# Performance limits
MAX_CONCURRENT_STREAMS=20          # Max simultaneous HLS streams
MAX_CONCURRENT_EXPORTS=3           # Max simultaneous exports
```

For production deployment with HTTPS and reverse proxy, see [ARCHITECTURE.md](./ARCHITECTURE.md).

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

```bash
# Check health status
curl http://localhost:3302/api/system/health

# View logs (Docker)
docker-compose logs -f videox

# View logs (npm)
tail -f /var/lib/videox-storage/logs/videox.log

# Check container status
docker-compose ps
```

## Troubleshooting

### Common Issues

**Container won't start:**
```bash
docker-compose logs videox          # Check error logs
docker-compose config               # Verify configuration
df -h                               # Check disk space
```

**Can't access API:**
```bash
docker-compose ps                   # Verify container is running
curl http://localhost:3302/api/system/health  # Test endpoint
```

**Recording not starting:**
```bash
docker-compose logs videox | grep -i ffmpeg   # Check FFmpeg errors
ping <camera-ip>                              # Verify camera is accessible
```

**MongoDB connection issues:**
```bash
docker-compose logs videox-mongodb  # Check MongoDB logs
docker-compose restart             # Restart all services
```

For detailed troubleshooting and integration issues, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Camera Requirements

- **Brand**: Axis Communications cameras only (uses VAPIX API)
- **Protocols**: HTTP (VAPIX), RTSP (streaming)
- **Credentials**: Username and password for camera access
- **Network**: Cameras must be accessible from VideoX server
- **Compatibility**: Works with all Axis cameras supporting VAPIX 3.0+
- **Zipstream**: Fully compatible with Axis Zipstream compression

## System Requirements

- **Minimum**: 2 CPU cores, 4 GB RAM, 50 GB storage
- **Recommended**: 4 CPU cores, 8 GB RAM, 500 GB+ storage
- **Storage**: ~5–30 MB/hour per camera (Zipstream compression is preserved — actual size depends on scene complexity, resolution and bitrate settings)
- **Network**: 1 Gbps recommended for multiple cameras

## Security

**Important security guidelines:**

- **Local network only** - Do not expose directly to the internet
- **Change default credentials** - Update ADMIN_USERNAME and ADMIN_PASSWORD immediately
- **Generate secure keys** - Use strong SESSION_SECRET and ENCRYPTION_KEY values
- **Production mode** - Set `NODE_ENV=production` for production deployments
- **Reverse proxy** - Use NGINX or similar with SSL/TLS for internet access

Camera credentials are encrypted with AES-256. See [ARCHITECTURE.md](./ARCHITECTURE.md) for production deployment patterns.

## Technology Stack

- **Node.js 20** - Runtime
- **Express.js** - API framework
- **MongoDB 7** - Camera and recording metadata
- **FFmpeg** - Video processing (H.264 passthrough recording, LL-HLS streaming, clip export)
- **React 18 + Vite** - Web management interface
- **Docker** - Container runtime

## Documentation

- **API Documentation**: [API.md](./API.md) - Complete REST API reference
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and components
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md) - Version history

## Support

- **Issues**: https://github.com/pandosme/videox/issues
- **Docker Hub**: https://hub.docker.com/r/pandosme/videox

## History

### February 2026 — v1.2.0: LL-HLS, H.264 Passthrough & Storage View

- **Low-Latency HLS (LL-HLS)**: Live streams now use fMP4 segments with 500 ms parts, reducing live latency from 5–10 seconds to ~1–2 seconds. Server implements the LL-HLS blocking-reload protocol (HLS spec §6.2.5.2) so clients receive each part the instant FFmpeg writes it.
- **H.264 Passthrough Recording**: Switched from re-encoding (`libx264`) to `-c:v copy`. FFmpeg now muxes the camera's native H.264/Zipstream directly into MP4 — no decode/encode cycle. This eliminates per-camera CPU load and fully preserves Axis Zipstream compression (30–80 % smaller files).
- **Automatic GOP Configuration**: When a camera is added, VideoX sets the H.264 GOV length on the camera via VAPIX (`videoencoder.cgi` with fallback to `param.cgi`). This ensures consistent keyframe intervals for frame-accurate seeking without re-encoding.
- **Storage View**: Camera table now shows Model, Serial and Age (days since oldest recording) instead of the removed Continuous Segments, Retention and Oldest/Newest columns.

### February 2026 — Playback Interface Enhancement

- **Playback Page**: Converted Dashboard to a dedicated Playback page with camera selection, date picker, and interactive timeline
- **Time Range Selection**: Implemented draggable selection box on 24-hour overview with visual recording availability
- **Video Player Integration**: Added Video.js player with continuous playback through segments
- **Timeline Tracking**: Real-time timeline position updates during playback

## License

MIT License - See LICENSE file for details
