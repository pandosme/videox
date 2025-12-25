# VideoX Architecture

## System Overview

VideoX is a self-hosted Video Management System (VMS) built with a modern Node.js backend and React frontend. The system manages continuous recording from Axis IP cameras, live streaming, event monitoring, and intelligent retention policies.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
│                    (React + Video.js)                           │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTP/WebSocket
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                      Express.js API Server                      │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │     Auth     │   Cameras    │  Recordings  │    Live      │ │
│  │   Routes     │   Routes     │   Routes     │   Routes     │ │
│  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘ │
│         │              │              │              │         │
│  ┌──────▼──────────────▼──────────────▼──────────────▼───────┐ │
│  │              Service Layer                                 │ │
│  │  • VAPIX Service    • HLS Stream Manager                  │ │
│  │  • Recording Mgr    • Retention Manager                   │ │
│  └──────┬──────────────────────────────────────────┬─────────┘ │
└─────────┼──────────────────────────────────────────┼───────────┘
          │                                          │
    ┌─────▼─────┐                             ┌─────▼─────┐
    │  MongoDB  │                             │  InfluxDB │
    │ (Metadata)│                             │  (Events) │
    └───────────┘                             └───────────┘
          │
          │
    ┌─────▼────────────────────────────────────────┐
    │            FFmpeg Processes                   │
    │  ┌──────────────┐      ┌──────────────┐      │
    │  │  Recording   │      │  HLS Stream  │      │
    │  │  (60s MP4)   │      │  (2s TS)     │      │
    │  └──────────────┘      └──────────────┘      │
    └────────────┬──────────────────┬───────────────┘
                 │                  │
    ┌────────────▼──────────────────▼───────────────┐
    │           File System Storage                 │
    │  /storage/recordings/  /storage/hls/          │
    └───────────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────┐
    │        Axis IP Cameras (RTSP/VAPIX)           │
    └───────────────────────────────────────────────┘
```

## Core Components

### 1. Backend (Node.js + Express)

#### 1.1 API Layer (`src/routes/`)
- **Authentication Routes** (`auth.js`): JWT-based authentication, login, logout, token refresh
- **Camera Routes** (`cameras.js`): CRUD operations for camera management
- **Recording Routes** (`recordings.js`): Recording playback, listing, metadata
- **Live Routes** (`live.js`): HLS stream control and status
- **Storage Routes** (`storage.js`): Disk usage and statistics
- **Events Routes** (`events.js`): Event timeline and notifications
- **Users Routes** (`users.js`): User management (admin only)
- **System Routes** (`system.js`): Health checks and system status

#### 1.2 Service Layer (`src/services/`)

##### VAPIX Service (`camera/vapixService.js`)
- **Purpose**: Interface with Axis cameras via VAPIX API
- **Authentication**: HTTP Digest authentication using digest-fetch
- **Capabilities**:
  - Device information retrieval (serial, model, firmware)
  - Stream profile discovery
  - Snapshot capture
  - RTSP URL construction
  - Capability detection (PTZ, audio)
- **API Format**: JSON-based POST requests to `/axis-cgi/basicdeviceinfo.cgi`

##### Recording Manager (`recording/recordingManager.js`)
- **Purpose**: Manage continuous recording from cameras
- **Process**: Spawns FFmpeg processes per camera
- **Segmentation**: 60-second MP4 segments
- **Directory Structure**: `/{cameraId}/{YYYY}/{MM}/{DD}/{HH}/segment_{timestamp}.mp4`
- **Auto-Resume**: Restarts recordings on server restart for cameras with `recordingState: 'recording'`
- **Error Handling**: Auto-restart on unexpected FFmpeg exit (10-second delay)
- **Metadata**: Creates MongoDB Recording documents with file path, duration, size

##### HLS Stream Manager (`stream/hlsStreamManager.js`)
- **Purpose**: Provide live video streaming via HLS
- **Process**: Spawns FFmpeg to transcode RTSP to HLS
- **Segmentation**: 2-second TS segments, 5-segment playlist
- **Auto-Cleanup**: Deletes old segments automatically (`delete_segments` flag)
- **On-Demand**: Streams start when client requests, stop after idle timeout
- **Error Handling**: Auto-restart on unexpected exit (5-second delay)

##### Retention Manager (`retention/retentionManager.js`)
- **Purpose**: Automatic deletion of old recordings
- **Schedule**: Configurable cron schedule (default: hourly)
- **Logic**: Deletes recordings past `retentionDate` unless protected
- **Safety**: Protected recordings are never deleted
- **Cleanup**: Removes both database records and physical files

#### 1.3 Data Layer (`src/models/`)

##### MongoDB Models

**Camera Model**
```javascript
{
  _id: String (serial number),
  name: String,
  address: String,
  port: Number (default 554 - RTSP),
  credentials: {
    username: String,
    password: String (encrypted with AES-256)
  },
  streamSettings: {
    profile: String,
    resolution: String,
    fps: Number,
    bitrate: Number
  },
  recordingSettings: { ... },
  retentionDays: Number (default 30),
  active: Boolean,
  status: {
    connectionState: String,
    recordingState: String,
    lastSeen: Date
  },
  metadata: {
    model: String,
    firmware: String,
    location: String,
    tags: [String],
    capabilities: Object
  }
}
```

**Recording Model**
```javascript
{
  cameraId: String,
  filename: String,
  filePath: String (absolute path),
  startTime: Date,
  endTime: Date,
  duration: Number (seconds),
  size: Number (bytes),
  status: String (recording|completed|error),
  protected: Boolean,
  retentionDate: Date,
  eventTags: [String],
  metadata: {
    resolution: String,
    codec: String,
    bitrate: Number,
    fps: Number
  }
}
```

**User Model**
```javascript
{
  username: String (unique),
  password: String (bcrypt hashed),
  role: String (admin|operator|viewer),
  active: Boolean,
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**AuditLog Model**
```javascript
{
  userId: ObjectId,
  action: String,
  resourceType: String,
  resourceId: String,
  details: Object,
  ipAddress: String,
  timestamp: Date
}
```

##### InfluxDB Measurements

**camera_status**
- Fields: `connectionState`, `bitrate`, `fps`, `frameDrops`
- Tags: `cameraId`, `location`
- Timestamp: Event time

**events**
- Fields: `type`, `severity`, `message`, `metadata`
- Tags: `cameraId`, `eventType`
- Timestamp: Event time

#### 1.4 Middleware (`src/middleware/`)

**Authentication** (`auth/authenticate.js`)
- Validates JWT tokens from `Authorization: Bearer` header
- Attaches user object to `req.user`
- Returns 401 on invalid/expired tokens

**Authorization** (`auth/authorize.js`)
- Role-based access control
- Checks `req.user.role` against allowed roles
- Returns 403 on insufficient permissions

**Error Handler** (`errorHandler/errorHandler.js`)
- Centralized error handling
- Standardized error response format
- Logging integration
- 404 handler for unknown routes

#### 1.5 Utilities (`src/utils/`)

**Encryption** (`encryption.js`)
- AES-256-CBC encryption for camera passwords
- Uses `ENCRYPTION_KEY` from environment
- Base64 encoding for storage

**JWT** (`jwt.js`)
- Token generation (access: 15min, refresh: 7days)
- Token verification
- Token refresh logic

**Logger** (`logger.js`)
- Winston-based logging
- Console and file transports
- Daily log rotation
- Log levels: error, warn, info, debug

### 2. Frontend (React + Vite)

#### 2.1 Application Structure

**Entry Point** (`main.jsx`)
- React 18 StrictMode
- Router setup
- Global providers (Auth, Toast)

**App Component** (`App.jsx`)
- Route definitions
- Protected route wrapper
- Layout integration

#### 2.2 Pages (`src/pages/`)

**Dashboard** (`Dashboard.jsx`)
- System overview
- Active cameras count
- Recording statistics
- Storage usage
- Recent events

**Cameras** (`Cameras.jsx`)
- Camera list with grid/list view
- Add camera form with connection test
- Edit camera settings
- Delete camera (with confirmation)
- Snapshot capture

**LiveView** (`LiveView.jsx`)
- 2x2 grid of live streams
- Camera selector per position
- Video.js HLS player
- Auto-start/stop streams on mount/unmount

**Recordings** (`Recordings.jsx`)
- Recording browser with filters (camera, date range)
- Recording list with metadata
- Video playback dialog
- Protect/unprotect recordings
- Delete recordings (admin only)
- Start/stop recording controls

**Events** (`Events.jsx`)
- Event timeline
- Event filtering (type, camera, date)
- Event details

**Storage** (`Storage.jsx`)
- Disk usage statistics
- Per-camera storage breakdown
- Retention policy overview

**Settings** (`Settings.jsx`)
- User preferences
- System configuration (admin only)

**Login** (`Login.jsx`)
- Username/password authentication
- JWT token storage
- Redirect to dashboard on success

#### 2.3 Components (`src/components/`)

**Layout** (`layout/Layout.jsx`)
- Sidebar navigation
- Top navbar with user menu
- Main content area
- Responsive design

**Navbar** (`layout/Navbar.jsx`)
- User profile
- Logout button
- Notifications (future)

**Sidebar** (`layout/Sidebar.jsx`)
- Navigation menu
- Active route highlighting
- Role-based menu items

#### 2.4 Services (`src/services/`)

**API Client** (`api.js`)
- Axios instance with base URL
- Request interceptor: Adds JWT token
- Response interceptor: Handles 401, redirects to login

**Camera Service** (`cameras.js`)
- `getCameras()`: List all cameras
- `getCamera(serial)`: Get camera details
- `addCamera(data)`: Add new camera
- `updateCamera(serial, data)`: Update camera
- `deleteCamera(serial)`: Delete camera
- `captureSnapshot(serial)`: Get snapshot

**Recording Service** (`recordings.js`)
- `getRecordings(filters)`: List recordings
- `getRecording(id)`: Get recording details
- `startRecording(cameraId)`: Start recording
- `stopRecording(cameraId)`: Stop recording
- `getRecordingStatus(cameraId)`: Get recording status
- `protectRecording(id)`: Protect from deletion
- `unprotectRecording(id)`: Remove protection
- `deleteRecording(id)`: Delete recording

**Live Service** (`live.js`)
- `startLiveStream(serial)`: Start HLS stream
- `stopLiveStream(serial)`: Stop HLS stream
- `getStreamStatus(serial)`: Get stream status

#### 2.5 Context Providers (`src/context/`)

**AuthContext** (`AuthContext.jsx`)
- User authentication state
- Login/logout functions
- Token management
- Protected route logic

**ToastContext** (`ToastContext.jsx`)
- Snackbar notifications
- Success/error/info/warning messages
- Auto-dismiss timeout

### 3. Database Architecture

#### 3.1 MongoDB

**Collections**
- `users`: User accounts and roles
- `cameras`: Camera configuration and status
- `recordings`: Recording metadata
- `auditlogs`: Audit trail
- `systemconfigs`: System-wide settings

**Indexes**
- `users.username`: Unique index
- `cameras._id`: Primary key (serial number)
- `recordings.cameraId`: For camera queries
- `recordings.startTime`: For date range queries
- `recordings.retentionDate`: For cleanup queries
- `auditlogs.userId`: For user activity
- `auditlogs.timestamp`: For timeline queries

#### 3.2 InfluxDB

**Buckets**
- `videox`: Main bucket for all measurements

**Measurements**
- `camera_status`: Camera connection and stream metrics
- `events`: Motion, audio, system events
- `storage`: Disk usage over time

**Retention Policy**
- Default: 90 days
- Configurable per measurement

### 4. Security Architecture

#### 4.1 Authentication Flow

```
1. User submits credentials → POST /api/auth/login
2. Backend validates password (bcrypt.compare)
3. Backend generates access token (15min) + refresh token (7 days)
4. Tokens stored in localStorage
5. Subsequent requests include: Authorization: Bearer <accessToken>
6. On 401, frontend attempts refresh → POST /api/auth/refresh
7. If refresh succeeds, retry original request
8. If refresh fails, redirect to login
```

#### 4.2 Authorization Model

**Role Hierarchy**
- `viewer` < `operator` < `admin`

**Permissions Matrix**

| Resource      | Viewer | Operator | Admin |
|---------------|--------|----------|-------|
| View Cameras  | ✓      | ✓        | ✓     |
| Add Cameras   | ✗      | ✓        | ✓     |
| Edit Cameras  | ✗      | ✓        | ✓     |
| Delete Cameras| ✗      | ✗        | ✓     |
| View Live     | ✓      | ✓        | ✓     |
| View Recordings| ✓     | ✓        | ✓     |
| Start/Stop Rec| ✗      | ✓        | ✓     |
| Protect Rec   | ✗      | ✓        | ✓     |
| Delete Rec    | ✗      | ✗        | ✓     |
| View Events   | ✓      | ✓        | ✓     |
| View Storage  | ✓      | ✓        | ✓     |
| Manage Users  | ✗      | ✗        | ✓     |
| System Config | ✗      | ✗        | ✓     |

#### 4.3 Data Protection

**Camera Credentials**
- Encrypted with AES-256-CBC
- Encryption key from environment variable
- IV stored with ciphertext
- Decrypted only when needed (RTSP connection)

**User Passwords**
- Hashed with bcrypt (cost factor: 10)
- Never transmitted or logged
- Compared using bcrypt.compare

**JWT Tokens**
- Signed with HMAC-SHA256
- Secret key from environment variable
- Includes user ID, username, role
- Short expiration (15min access, 7 days refresh)

### 5. Video Processing Architecture

#### 5.1 Recording Pipeline

```
RTSP Stream → FFmpeg → 60s MP4 Segments → File System
                 ↓
           Segment Metadata → MongoDB
```

**FFmpeg Arguments** (Recording)
```bash
ffmpeg \
  -rtsp_transport tcp \
  -i rtsp://user:pass@camera:554/axis-media/media.amp \
  -c:v copy \                    # Copy video (no re-encode)
  -c:a aac \                     # Encode audio to AAC
  -f segment \                   # Segmented output
  -segment_time 60 \             # 60-second segments
  -segment_format mp4 \          # MP4 container
  -segment_atclocktime 1 \       # Align with clock
  -strftime 1 \                  # Timestamp in filename
  -reset_timestamps 1 \          # Reset PTS per segment
  -movflags +faststart \         # Web-optimized MP4
  /storage/recordings/{cameraId}/%Y/%m/%d/%H/segment_%Y%m%d_%H%M%S.mp4
```

**Segment Finalization**
1. FFmpeg writes segment and closes file
2. FFmpeg outputs "Opening ..." message to stderr
3. Recording manager detects message via regex
4. Manager creates Recording document in MongoDB
5. Manager calculates retention date
6. Manager logs segment completion

#### 5.2 HLS Streaming Pipeline

```
RTSP Stream → FFmpeg → HLS Playlist + TS Segments → Static File Server → Client
```

**FFmpeg Arguments** (HLS)
```bash
ffmpeg \
  -rtsp_transport tcp \
  -i rtsp://user:pass@camera:554/axis-media/media.amp \
  -c:v copy \                    # Copy video (no re-encode)
  -c:a aac \                     # Encode audio to AAC
  -f hls \                       # HLS output
  -hls_time 2 \                  # 2-second segments
  -hls_list_size 5 \             # Keep 5 segments in playlist
  -hls_flags delete_segments+append_list \
  -hls_segment_filename /storage/hls/{cameraId}/segment_%03d.ts \
  /storage/hls/{cameraId}/playlist.m3u8
```

**Streaming Flow**
1. Client requests stream start → `GET /api/live/{serial}/start`
2. Backend spawns FFmpeg process
3. FFmpeg generates playlist.m3u8 and segment_000.ts, segment_001.ts, ...
4. Backend returns playlist URL: `/hls/{cameraId}/playlist.m3u8`
5. Client loads playlist via Video.js
6. Video.js fetches segments: `/hls/{cameraId}/segment_000.ts`, etc.
7. On client unmount, client calls → `GET /api/live/{serial}/stop`
8. Backend kills FFmpeg process
9. Backend deletes HLS directory

### 6. Storage Architecture

#### 6.1 Directory Structure

```
/storage/
├── recordings/
│   └── {cameraId}/
│       └── {YYYY}/
│           └── {MM}/
│               └── {DD}/
│                   └── {HH}/
│                       ├── segment_20251225_170000.mp4
│                       ├── segment_20251225_170100.mp4
│                       └── segment_20251225_170200.mp4
└── hls/
    └── {cameraId}/
        ├── playlist.m3u8
        ├── segment_000.ts
        ├── segment_001.ts
        └── segment_002.ts
```

#### 6.2 Retention Logic

**Calculation**
```javascript
retentionDate = recordingStartTime + (camera.retentionDays * 24 * 60 * 60 * 1000)
```

**Cleanup Process**
1. Cron job runs (default: hourly)
2. Query: `Recording.find({ retentionDate: { $lt: new Date() }, protected: false })`
3. For each recording:
   - Delete file from disk: `fs.unlink(recording.filePath)`
   - Delete MongoDB document: `Recording.deleteOne({ _id })`
4. Log cleanup results

**Protection**
- Recordings can be marked as `protected: true`
- Protected recordings are excluded from cleanup query
- Only admin/operator can protect/unprotect

### 7. Error Handling & Resilience

#### 7.1 FFmpeg Process Management

**Recording Auto-Restart**
- Exit code 0 or SIGTERM: No restart
- Exit code ≠ 0 and signal ≠ SIGTERM: Restart after 10 seconds
- Checks camera still active and recordingState != 'stopped'

**HLS Auto-Restart**
- Exit code 0 or SIGTERM: No restart
- Exit code ≠ 0 and signal ≠ SIGTERM: Restart after 5 seconds

**Graceful Shutdown**
- SIGTERM/SIGINT triggers shutdown handler
- Stops HTTP server (no new requests)
- Stops all HLS streams (SIGTERM to FFmpeg)
- Stops all recordings (SIGTERM to FFmpeg)
- Waits up to 5 seconds per process
- Force kill (SIGKILL) if not exited
- Closes database connections
- Exits process

#### 7.2 Database Connection Resilience

**MongoDB**
- 5 connection attempts with 5-second delays
- Health monitoring: periodic ping
- Auto-reconnect on connection loss
- Graceful degradation: Continue serving cached data

**InfluxDB**
- 5 connection attempts with 5-second delays
- Health monitoring: periodic query
- Non-critical: System continues without InfluxDB

#### 7.3 API Error Responses

**Standard Error Format**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* optional */ }
  }
}
```

**HTTP Status Codes**
- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate resource)
- 500: Internal Server Error

### 8. Scalability Considerations

#### 8.1 Current Limitations

**Single Server**
- All FFmpeg processes run on one server
- Limited by CPU, memory, disk I/O

**Camera Limit**
- ~10-20 cameras per server (depends on hardware)
- Each camera = 2 FFmpeg processes (recording + potential HLS)
- Each FFmpeg process = ~1-2% CPU + 50-100 MB RAM

**Storage Limit**
- Local disk storage
- No distributed storage

#### 8.2 Future Scaling Paths

**Horizontal Scaling (Multiple Servers)**
- Distribute cameras across multiple servers
- Shared MongoDB for metadata
- Shared storage (NFS, S3, etc.)
- Load balancer for API requests

**Recording Offload**
- Dedicated recording servers
- API servers only handle requests
- Message queue (RabbitMQ) for job distribution

**Storage Scaling**
- Network-attached storage (NAS)
- Object storage (MinIO, S3)
- Tiered storage (hot/cold)

## 9. Deployment

### 9.1 Development Environment

**Requirements**
- Node.js 20.x LTS
- MongoDB 7.x
- InfluxDB 2.x
- FFmpeg (with libx264, AAC support)

**Start Commands**
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### 9.2 Production Deployment (Planned)

**Process Manager**
- PM2 for Node.js processes
- Systemd services for MongoDB, InfluxDB

**Reverse Proxy**
- Nginx for API and static file serving
- HTTPS with Let's Encrypt

**Backup Strategy**
- MongoDB: Daily dumps with mongodump
- Recordings: Incremental backup to external storage
- Configuration: Version control

**Monitoring**
- Health check endpoint: `/api/system/health`
- Uptime monitoring (UptimeRobot, etc.)
- Log aggregation (Loki, etc.)

## 10. Technology Decisions

### 10.1 Why Digest Authentication?

Axis cameras require HTTP Digest authentication for VAPIX API. Digest is more secure than Basic auth as it doesn't transmit passwords in cleartext.

**Library Choice**: `digest-fetch`
- Clean fetch-based API
- Reliable digest implementation
- Active maintenance

### 10.2 Why 60-Second Segments?

**Pros**
- Balance between granularity and overhead
- Easier to browse by minute
- Aligns with clock time

**Cons**
- More files than longer segments
- More metadata overhead

**Alternatives Considered**
- 30-second: Too many files
- 5-minute: Less granular, harder to find specific moments

### 10.3 Why HLS Instead of RTSP?

**Pros**
- Browser-compatible (no plugin required)
- HTTP-based (firewall-friendly)
- Adaptive bitrate support (future)
- Easy to cache with CDN (future)

**Cons**
- Higher latency (4-6 seconds) vs RTSP (~1 second)
- Server transcoding overhead

**Decision**: Latency acceptable for monitoring use case; browser compatibility more important.

### 10.4 Why MongoDB + InfluxDB?

**MongoDB**
- Flexible schema for camera metadata
- Rich query capabilities
- Good for CRUD operations

**InfluxDB**
- Optimized for time-series data
- Efficient storage for high-volume events
- Built-in downsampling and retention

**Alternative**: Could use PostgreSQL + TimescaleDB, but team has more experience with Mongo ecosystem.

## 11. Future Enhancements

### Phase 4 (Planned)
- **Motion Detection**: Integrate with camera motion events
- **Event Timeline**: Visual timeline of events overlaid on recordings
- **Multi-Camera View**: 4x4, 6x6 grid options
- **Export**: Download recordings as MP4
- **Backup**: Automated backup to cloud storage

### Phase 5 (Planned)
- **Mobile App**: React Native for iOS/Android
- **Push Notifications**: Motion alerts to mobile
- **PTZ Control**: Pan/tilt/zoom for supported cameras
- **Audio**: Two-way audio support
- **Analytics**: People counting, object detection (AI)

### Phase 6 (Planned)
- **Multi-Site**: Manage cameras across multiple locations
- **Federation**: Multiple servers with centralized management
- **Advanced Retention**: Policy-based retention (keep events longer)
- **ONVIF Support**: Support non-Axis cameras
