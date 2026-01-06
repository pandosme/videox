# VideoX - Axis Camera Recording Engine

A local recording engine for Axis IP cameras designed for integration with various systems and clients.

## What is VideoX?

VideoX is a **recording engine**, not a complete Video Management System (VMS). It provides:
- Continuous recording from Axis cameras (60-second MP4 segments)
- RESTful API for integration with client applications
- HLS live streaming and recording playback
- Storage management with configurable retention
- Docker-first deployment with embedded MongoDB

**VideoX is designed for integrators** - it provides the recording infrastructure while you build the client applications and integrations for your specific use case.

**Reference client**: [videox-client](https://github.com/pandosme/videox-client) - A React-based management UI example

## Key Capabilities

- **Continuous Recording**: 60-second MP4 segments with forced keyframes for precise seeking
- **Live Streaming**: HLS streams for real-time viewing
- **Recording Playback**: Timestamp-based playback with frame-accurate seeking
- **Export Clips**: Extract video clips spanning multiple recording segments
- **Retention Management**: Automatic cleanup with configurable retention periods
- **RESTful API**: Complete API for camera management, streaming, and playback
- **Dual Authentication**: Sessions for web clients, API keys for integrations
- **Axis Zipstream**: Full support for Axis compression technology

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

## Integration

VideoX provides a RESTful API for all operations. Build your own clients or use the reference implementation:

- **API Documentation**: [API.md](./API.md) - Complete endpoint reference and authentication
- **Architecture Guide**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and integration patterns
- **Reference Client**: [videox-client](https://github.com/pandosme/videox-client) - Example React-based UI

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

- **Minimum**: 2 CPU cores, 4GB RAM, 50GB storage
- **Recommended**: 4 CPU cores, 8GB RAM, 500GB+ storage
- **Storage**: ~10-50 MB/hour per camera (depends on resolution and Zipstream settings)
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
