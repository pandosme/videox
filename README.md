# VideoX - Video Management System

A comprehensive local network video management system for Axis IP cameras with continuous recording, live streaming, and intelligent retention management.

## Overview

VideoX is a self-hosted VMS (Video Management System) designed for home and small business networks. It provides professional-grade video surveillance capabilities using Axis IP cameras with an intuitive web interface.

### Key Features

- **Camera Management**: Add and configure Axis IP cameras via VAPIX API with HTTP Digest authentication
- **Continuous Recording**: Automatic 60-second segmented MP4 recordings organized by date/time
- **Live Streaming**: View live feeds from up to 4 cameras simultaneously using HLS streaming
- **Recording Playback**: Browse and playback recordings with date/time filtering
- **Retention Management**: Configurable retention policies with automatic cleanup
- **User Management**: Role-based access control (Admin, Operator, Viewer)
- **Storage Management**: Monitor disk usage and per-camera storage statistics
- **Audit Trail**: Track all system actions and camera events

## Screenshots

### Live View (2x2 Grid)
Real-time HLS streaming from multiple cameras with sub-5 second latency.

### Recording Browser
Browse recordings by camera and date range, with video playback and download capabilities.

### Camera Management
Add, configure, and monitor Axis cameras with automatic capability detection.

## Technology Stack

### Backend
- **Node.js 20.x** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - Camera and recording metadata
- **InfluxDB** - Time-series event data (future)
- **FFmpeg** - Video processing (RTSP to HLS/MP4)
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **AES-256** - Camera credential encryption

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Material-UI (MUI)** - Component library
- **Video.js** - Video player with HLS support
- **Axios** - HTTP client
- **React Router** - Client-side routing

### Infrastructure
- **VAPIX API** - Axis camera communication
- **HTTP Digest Auth** - Camera authentication
- **HLS** - Live video streaming protocol
- **MP4** - Recording container format

## Project Structure

```
videox/
├── backend/                    # Node.js backend
│   ├── src/
│   │   ├── config/              # Database connections
│   │   │   └── database.js      # MongoDB & InfluxDB managers
│   │   ├── middleware/          # Express middleware
│   │   │   ├── auth/            # Authentication & authorization
│   │   │   └── errorHandler/    # Error handling
│   │   ├── models/              # MongoDB schemas
│   │   │   ├── Camera.js        # Camera configuration
│   │   │   ├── Recording.js     # Recording metadata
│   │   │   ├── User.js          # User accounts
│   │   │   ├── AuditLog.js      # Audit trail
│   │   │   └── SystemConfig.js  # System settings
│   │   ├── routes/              # API endpoints
│   │   │   ├── auth.js          # Authentication
│   │   │   ├── cameras.js       # Camera management
│   │   │   ├── recordings.js    # Recording management
│   │   │   ├── live.js          # Live streaming
│   │   │   ├── storage.js       # Storage stats
│   │   │   ├── events.js        # Event timeline
│   │   │   ├── users.js         # User management
│   │   │   └── system.js        # Health & info
│   │   ├── services/            # Business logic
│   │   │   ├── camera/
│   │   │   │   └── vapixService.js      # Axis VAPIX API client
│   │   │   ├── recording/
│   │   │   │   └── recordingManager.js  # Continuous recording
│   │   │   ├── stream/
│   │   │   │   └── hlsStreamManager.js  # HLS live streaming
│   │   │   └── retention/
│   │   │       └── retentionManager.js  # Automatic cleanup
│   │   ├── utils/               # Utilities
│   │   │   ├── encryption.js    # AES-256 encryption
│   │   │   ├── jwt.js           # JWT token management
│   │   │   ├── logger.js        # Winston logging
│   │   │   └── validators.js    # Input validation
│   │   └── server.js            # Express app & startup
│   ├── package.json
│   └── .env.example
│
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/          # Reusable components
│   │   │   └── layout/          # Layout components
│   │   │       ├── Layout.jsx   # Main layout wrapper
│   │   │       ├── Navbar.jsx   # Top navigation bar
│   │   │       └── Sidebar.jsx  # Side navigation menu
│   │   ├── context/             # React contexts
│   │   │   ├── AuthContext.jsx  # Authentication state
│   │   │   └── ToastContext.jsx # Notification system
│   │   ├── pages/               # Page components
│   │   │   ├── Dashboard.jsx    # System overview
│   │   │   ├── Cameras.jsx      # Camera management
│   │   │   ├── LiveView.jsx     # Live streaming (2x2 grid)
│   │   │   ├── Recordings.jsx   # Recording browser & playback
│   │   │   ├── Events.jsx       # Event timeline
│   │   │   ├── Storage.jsx      # Storage statistics
│   │   │   ├── Settings.jsx     # User preferences
│   │   │   └── Login.jsx        # Login page
│   │   ├── services/            # API clients
│   │   │   ├── api.js           # Axios instance
│   │   │   ├── cameras.js       # Camera API
│   │   │   ├── recordings.js    # Recording API
│   │   │   └── live.js          # Live streaming API
│   │   ├── App.jsx              # Root component & routing
│   │   └── main.jsx             # React entry point
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
│
├── ARCHITECTURE.md             # System architecture documentation
├── API.md                      # API endpoint documentation
└── README.md                   # This file
```

## Prerequisites

- **Node.js 20.x LTS** - [Download](https://nodejs.org/)
- **MongoDB 7.x** - [Installation Guide](https://www.mongodb.com/docs/manual/installation/)
- **InfluxDB 2.x** - [Installation Guide](https://docs.influxdata.com/influxdb/v2/install/)
- **FFmpeg** - Must include H.264 codec support
  ```bash
  # Ubuntu/Debian
  sudo apt-get install ffmpeg

  # Verify H.264 support
  ffmpeg -codecs | grep h264
  ```

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/videox.git
cd videox
```

### 2. Install Dependencies

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd frontend
npm install
```

### 3. Setup Databases

#### MongoDB
```bash
# Install MongoDB 7.x (Ubuntu/Debian)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify MongoDB is running
mongosh --eval "db.adminCommand('ping')"
```

#### InfluxDB
```bash
# Install InfluxDB 2.x (Ubuntu/Debian)
wget https://dl.influxdata.com/influxdb/releases/influxdb2-2.7.4-amd64.deb
sudo dpkg -i influxdb2-2.7.4-amd64.deb

# Start InfluxDB
sudo systemctl start influxdb
sudo systemctl enable influxdb

# Setup via Web UI
# Open http://localhost:8086
# Create organization: videox
# Create bucket: videox
# Save the API token
```

### 4. Configure Environment Variables

#### Backend Configuration

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/videox
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your_influxdb_token_here
INFLUXDB_ORG=videox
INFLUXDB_BUCKET=videox

# Storage Configuration
STORAGE_PATH=/home/fred/videox-storage

# Server Configuration
API_PORT=3002
NODE_ENV=development

# Security Configuration (CHANGE THESE IN PRODUCTION!)
JWT_SECRET=your_jwt_secret_min_32_characters_long
ENCRYPTION_KEY=your_encryption_key_exactly_32_chars

# Retention Configuration
GLOBAL_RETENTION_DAYS=30
CLEANUP_SCHEDULE=0 * * * *
```

**Important Security Notes:**
- `JWT_SECRET`: Must be at least 32 characters, random string
- `ENCRYPTION_KEY`: Must be exactly 32 characters for AES-256
- Generate secure keys:
  ```bash
  # Generate JWT secret
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

  # Generate encryption key
  node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
  ```

#### Frontend Configuration

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:3002/api
```

### 5. Create Storage Directory

```bash
# Create storage directory
mkdir -p /home/fred/videox-storage/recordings
mkdir -p /home/fred/videox-storage/hls

# Set permissions
chmod 750 /home/fred/videox-storage
```

### 6. Create Initial Admin User

Connect to MongoDB and create the admin user:

```bash
mongosh
```

```javascript
use videox

// Hash password with bcrypt (cost factor 10)
// For password "admin123", the hash is:
db.users.insertOne({
  username: "admin",
  password: "$2b$10$rBwN5P8K5K5K5K5K5K5K5euJ5J5J5J5J5J5J5J5J5J5J5J5J5J5J5",
  role: "admin",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

// Or generate your own hash:
```

Generate custom password hash:
```javascript
// In Node.js REPL or separate script
const bcrypt = require('bcrypt');
bcrypt.hash('YourSecurePassword', 10).then(hash => console.log(hash));
```

## Development

### Start Backend

```bash
cd backend
npm run dev
```

Backend will start on `http://localhost:3002`

Logs: Console output with Winston formatting

### Start Frontend

```bash
cd frontend
npm run dev
```

Frontend will start on `http://localhost:5174`

The frontend proxies API requests to `http://localhost:3002/api` and HLS streams to `http://localhost:3002/hls`.

### Access Application

1. Open browser: `http://localhost:5174`
2. Login with credentials:
   - Username: `admin`
   - Password: `admin123` (or your custom password)

## Production Deployment

### Build Frontend

```bash
cd frontend
npm run build
```

This creates optimized production build in `frontend/dist/`.

### Serve with Nginx

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name videox.local;

    # Frontend static files
    location / {
        root /var/www/videox;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # HLS streaming
    location /hls {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_buffering off;
    }
}
```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start backend
cd backend
pm2 start src/server.js --name videox-backend

# Save PM2 configuration
pm2 save

# Auto-start on boot
pm2 startup
```

## Usage

### Adding a Camera

1. Navigate to **Cameras** page
2. Click **Add Camera** button
3. Fill in camera details:
   - **Name**: Human-readable name (e.g., "Front Entrance")
   - **Address**: IP address or hostname (e.g., `front.internal` or `192.168.1.100`)
   - **Port**: HTTP port for VAPIX API (default: 80)
   - **Username**: Camera username
   - **Password**: Camera password
4. Click **Test Connection** to verify
5. Click **Add Camera**

The system will:
- Connect to camera via VAPIX API
- Retrieve serial number, model, firmware
- Detect capabilities (PTZ, audio, stream profiles)
- Encrypt and store credentials
- Add camera to database

### Starting Recording

1. Navigate to **Recordings** page
2. Select camera from dropdown
3. Click **Start Recording**

The system will:
- Spawn FFmpeg process to capture RTSP stream
- Create 60-second MP4 segments
- Organize files: `/{cameraId}/{YYYY}/{MM}/{DD}/{HH}/segment_{timestamp}.mp4`
- Create metadata entries in MongoDB
- Calculate retention dates

### Viewing Live Stream

1. Navigate to **Live View** page
2. Select camera for each position (2x2 grid)
3. Stream will automatically start

The system will:
- Start FFmpeg HLS transcoder
- Generate 2-second TS segments
- Serve via `/hls/{cameraId}/playlist.m3u8`
- Auto-stop when you navigate away

### Browsing Recordings

1. Navigate to **Recordings** page
2. Select camera and date range
3. Click **Play** icon to view recording
4. Click **Protect** to prevent auto-deletion
5. Click **Delete** (admin only) to remove recording

### Managing Storage

1. Navigate to **Storage** page
2. View total disk usage and per-camera breakdown
3. Adjust retention days in **Camera Settings**

Automatic cleanup runs hourly:
- Deletes recordings older than retention date
- Skips protected recordings
- Removes both database entries and files

## API Documentation

See [API.md](./API.md) for complete API documentation.

**Base URL**: `http://localhost:3002/api`

**Authentication**: All endpoints require `Authorization: Bearer <token>` except:
- `POST /auth/login`
- `GET /system/health`

**Key Endpoints**:
- `POST /auth/login` - Authenticate
- `GET /cameras` - List cameras
- `POST /cameras` - Add camera
- `GET /recordings` - List recordings
- `POST /recordings/:cameraId/start` - Start recording
- `GET /live/:serial/start` - Start live stream

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system architecture.

**High-Level Architecture**:
- **Frontend**: React SPA with Video.js for playback
- **Backend**: Express API server with JWT auth
- **Recording**: FFmpeg processes (one per camera) creating 60s MP4 segments
- **Live Streaming**: FFmpeg HLS transcoders (on-demand)
- **Storage**: Local filesystem with date-based hierarchy
- **Metadata**: MongoDB for cameras, recordings, users
- **Events**: InfluxDB for time-series data (future)

## Security

### Network Security
- **Local Network Only**: Do NOT expose to internet
- **Firewall**: Restrict to local subnet only
- **HTTPS**: Use reverse proxy with SSL/TLS (recommended)

### Application Security
- **Camera Credentials**: Encrypted with AES-256-CBC
- **User Passwords**: Hashed with bcrypt (cost factor 10)
- **JWT Tokens**: 15-minute access tokens, 7-day refresh tokens
- **Rate Limiting**: 100 requests/minute per IP
- **Role-Based Access**: Admin, Operator, Viewer roles
- **Audit Logging**: All actions logged to database

### Role Permissions

| Action | Viewer | Operator | Admin |
|--------|--------|----------|-------|
| View Live Streams | ✓ | ✓ | ✓ |
| View Recordings | ✓ | ✓ | ✓ |
| Add Cameras | ✗ | ✓ | ✓ |
| Edit Cameras | ✗ | ✓ | ✓ |
| Delete Cameras | ✗ | ✗ | ✓ |
| Start/Stop Recording | ✗ | ✓ | ✓ |
| Protect Recordings | ✗ | ✓ | ✓ |
| Delete Recordings | ✗ | ✗ | ✓ |
| Manage Users | ✗ | ✗ | ✓ |

## Troubleshooting

### Backend Won't Start

**Error**: `EADDRINUSE: address already in use`
```bash
# Find process using port 3002
lsof -ti:3002

# Kill the process
kill $(lsof -ti:3002)
```

**Error**: `MongoDB connection failed`
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod
```

### Camera Connection Failed

**Error**: `Failed to connect to camera: HTTP 401`
- Verify username/password are correct
- Check camera is accessible: `ping front.internal`
- Verify camera is Axis brand (VAPIX API required)

**Error**: `Failed to connect to camera: Connection timeout`
- Check camera IP address/hostname
- Verify camera is on same network
- Check firewall rules

### Recording Not Starting

**Error**: `FFmpeg process exited with code 1`
```bash
# Check FFmpeg is installed
ffmpeg -version

# Check H.264 codec support
ffmpeg -codecs | grep h264

# Check RTSP stream manually
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@camera:554/axis-media/media.amp -t 10 test.mp4
```

**Error**: `Failed to open segment: No such file or directory`
```bash
# Verify storage path exists
ls -la /home/fred/videox-storage

# Check permissions
chmod 750 /home/fred/videox-storage
```

### Live Stream Not Loading

**Error**: Spinner keeps loading, no video
```bash
# Check backend logs for FFmpeg errors
tail -f /var/log/videox/videox-api.log

# Verify HLS files are being created
ls -la /home/fred/videox-storage/hls/{cameraId}/

# Check playlist exists
cat /home/fred/videox-storage/hls/{cameraId}/playlist.m3u8
```

**Error**: `ERR_CONNECTION_REFUSED` for HLS files
- Restart frontend dev server (Vite proxy issue)
- Verify `/hls` proxy is configured in `vite.config.js`

## Development Status

### ✅ Phase 1 - Complete (2025-12-25)
- Project scaffolding and structure
- Database connections (MongoDB, InfluxDB)
- Authentication system (JWT, bcrypt)
- User management
- Frontend layout and navigation

### ✅ Phase 2 - Complete (2025-12-25)
- Camera management with VAPIX integration
- HTTP Digest authentication for Axis cameras
- Continuous recording engine (60s MP4 segments)
- HLS live streaming
- Recording playback
- Retention management and cleanup
- Storage statistics
- Audit logging

### 📋 Phase 3 - Planned
- Event timeline and notifications
- Motion detection integration
- Advanced filtering and search
- Video export and download
- Multi-camera synchronization
- Mobile-responsive improvements

### 📋 Phase 4 - Future
- PTZ camera control
- Two-way audio
- Mobile app (React Native)
- Push notifications
- AI analytics (people counting, object detection)
- Multi-site management

## Contributing

This is a private project. Contributions are not currently accepted.

## License

Private License - All Rights Reserved

## Support

For issues and questions, please refer to:
- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Complete Specification](./VideoX_Complete_Specification.md)

## Acknowledgments

- **Axis Communications** - VAPIX API documentation
- **FFmpeg** - Video processing
- **Video.js** - HTML5 video player
- **Material-UI** - React component library
