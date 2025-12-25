# VideoX - Video Management System
## Complete Technical Specification for Implementation

---

## 1. PROJECT OVERVIEW

**Project Name:** VideoX
**Purpose:** Local network video management system for Axis IP cameras
**Deployment:** Linux server, local home network only (not internet-exposed)
**Technology Stack:** Node.js backend + React frontend

---

## 2. TECHNOLOGY STACK

### Backend
- **Runtime:** Node.js 20.x LTS
- **Framework:** Express.js or Fastify
- **Video Processing:** FFmpeg with node-fluent-ffmpeg
- **Authentication:** JWT (jsonwebtoken)
- **Database Drivers:**
  - MongoDB: mongoose
  - InfluxDB: @influxdata/influxdb-client
- **Security:** bcrypt for password hashing, crypto for camera credential encryption
- **HTTP Client:** axios for VAPIX API calls
- **Utilities:** node-cron for scheduled tasks, dotenv for configuration

### Frontend
- **Framework:** React 19
- **UI Library:** Material-UI (MUI) or Shadcn/ui
- **State Management:** React Context API or Zustand
- **Video Player:** Video.js or HLS.js
- **HTTP Client:** axios with React Query
- **Routing:** React Router v6
- **Forms:** React Hook Form with Yup validation
- **Date/Time:** date-fns or dayjs

### Infrastructure
- **Databases:**
  - MongoDB 7.x (camera inventory, recordings metadata, users)
  - InfluxDB 2.x (time-series events, metrics)
- **Storage:** Local filesystem (configurable path)
- **Process Management:** systemd service or PM2

---

## 3. SYSTEM ARCHITECTURE

### Service Components

1. **API Server** (Express/Fastify)
   - RESTful API endpoints
   - JWT authentication middleware
   - Request validation
   - Error handling middleware
   - CORS configuration (local network only)

2. **Stream Manager**
   - Manages RTSP connections per camera
   - FFmpeg process spawning and monitoring
   - Auto-reconnection logic (5s, 15s, 30s, 60s intervals)
   - Stream health monitoring

3. **Recording Engine**
   - Segmented video recording (60-second MP4 segments)
   - Metadata generation per segment
   - Storage organization by camera/date/hour
   - Automatic segment finalization

4. **Database Connection Manager**
   - MongoDB connection with retry logic
   - InfluxDB connection with retry logic
   - Health check monitoring
   - Connection pooling

5. **Retention Manager**
   - Scheduled cleanup job (every 6 hours via node-cron)
   - Retention policy enforcement
   - Batch deletion (max 100 segments per run)
   - Protected recording exclusion

6. **Event Handler**
   - VAPIX event subscription per camera
   - Event ingestion to InfluxDB
   - Batch writes (1-second intervals)
   - Webhook support (future)

---

## 4. DATABASE SCHEMAS

### MongoDB Collections

#### cameras
```javascript
{
  _id: String,                    // Camera serial number (e.g., "B8A44FD247E7")
  name: String,                   // User-friendly name
  address: String,                // IP address or hostname
  port: Number,                   // Default: 554 (RTSP)
  credentials: {
    username: String,
    password: String              // AES-256 encrypted
  },
  streamSettings: {
    resolution: String,           // e.g., "1920x1080"
    videoCodec: String,           // "h264" or "h265"
    fps: Number,                  // 5-30
    streamProfile: String,        // "Quality", "Balanced", "Bandwidth", "Zipstream"
    zipstreamEnabled: Boolean,    // Default: true
    enableAudio: Boolean          // Default: false
  },
  recordingSettings: {
    mode: String,                 // "continuous", "motion", "scheduled", "disabled"
    schedule: Object,             // 24x7 grid for scheduled mode
    preBuffer: Number,            // Seconds (5-30)
    postBuffer: Number            // Seconds (5-30)
  },
  retentionDays: Number,          // Default: 30, null = use global default
  storageQuotaGB: Number,         // Optional per-camera limit
  active: Boolean,                // Enable/disable camera
  metadata: {
    model: String,                // Auto-detected from VAPIX
    firmware: String,             // Auto-detected from VAPIX
    location: String,             // User-provided
    tags: [String],               // User-provided
    capabilities: {
      ptz: Boolean,
      audio: Boolean,
      profiles: [String]
    }
  },
  status: {
    connectionState: String,      // "online", "offline", "connecting", "error"
    lastSeen: Date,
    recordingState: String,       // "recording", "paused", "stopped", "error"
    currentBitrate: Number,
    currentFps: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

#### recordings
```javascript
{
  _id: ObjectId,
  cameraId: String,               // References cameras._id (serial)
  startTime: Date,
  endTime: Date,
  segments: [{
    filename: String,             // "segment_YYYYMMDD_HHmmss.mp4"
    path: String,                 // Full filesystem path
    duration: Number,             // Seconds
    size: Number,                 // Bytes
    timestamp: Date
  }],
  totalSize: Number,              // Total bytes
  status: String,                 // "recording", "completed", "archived", "corrupted"
  protected: Boolean,             // Exclude from auto-deletion
  eventTags: [String],            // ["motion", "audio", "manual"]
  metadata: {
    resolution: String,
    codec: String,
    avgBitrate: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

#### users
```javascript
{
  _id: ObjectId,
  username: String,               // Unique
  password: String,               // bcrypt hashed
  role: String,                   // "admin", "operator", "viewer"
  active: Boolean,
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### systemConfig
```javascript
{
  _id: ObjectId,
  key: String,                    // Unique config key
  value: Mixed,                   // Config value
  updatedAt: Date,
  updatedBy: ObjectId             // References users._id
}

// Example keys:
// - "globalRetentionDays": 30
// - "storageQuotaGB": 5000
// - "cleanupSchedule": "0 */6 * * *"
// - "alertThresholds": {...}
```

#### auditLog
```javascript
{
  _id: ObjectId,
  userId: ObjectId,               // References users._id
  action: String,                 // "camera.add", "camera.delete", "recording.delete", etc.
  resource: String,               // Camera serial or recording ID
  details: Object,                // Action-specific data
  timestamp: Date
}
```

### InfluxDB Measurements

#### camera_events
```
Measurement: camera_events
Tags:
  - camera_id: String (serial)
  - event_type: String ("motion", "audio", "tampering", "connection_lost", "connection_restored")
  - severity: String ("info", "warning", "critical")
Fields:
  - description: String
  - metadata: String (JSON)
  - value: Float (optional numeric value)
Timestamp: nanosecond precision
```

#### stream_health
```
Measurement: stream_health
Tags:
  - camera_id: String (serial)
  - stream_type: String ("primary", "secondary")
Fields:
  - bitrate: Integer (bits/sec)
  - fps: Float
  - dropped_frames: Integer
  - latency_ms: Integer
  - connection_status: String ("connected", "disconnected")
Timestamp: nanosecond precision
```

#### recording_metrics
```
Measurement: recording_metrics
Tags:
  - camera_id: String (serial)
  - recording_id: String
Fields:
  - segment_count: Integer
  - total_bytes: Integer
  - duration_seconds: Float
  - segments_failed: Integer
Timestamp: nanosecond precision
```

#### system_metrics
```
Measurement: system_metrics
Tags:
  - metric_type: String ("storage", "cpu", "memory")
Fields:
  - value: Float
  - threshold: Float (optional)
  - status: String ("normal", "warning", "critical")
Timestamp: nanosecond precision
```

---

## 5. API ENDPOINTS

### Authentication

**POST /api/auth/login**
- Body: `{username, password}`
- Returns: `{token, refreshToken, user: {id, username, role}}`
- Status: 200 OK, 401 Unauthorized

**POST /api/auth/refresh**
- Body: `{refreshToken}`
- Returns: `{token}`
- Status: 200 OK, 401 Unauthorized

**POST /api/auth/logout**
- Headers: `Authorization: Bearer {token}`
- Status: 200 OK

### Camera Management

**GET /api/cameras**
- Query params: `?status=online|offline&tags=tag1,tag2&limit=50&offset=0`
- Returns: Array of camera objects with current status
- Status: 200 OK
- Auth: Any authenticated user

**GET /api/cameras/:serial**
- Returns: Full camera object with detailed status
- Status: 200 OK, 404 Not Found
- Auth: Any authenticated user

**POST /api/cameras**
- Body: Camera object (address, credentials, settings)
- Process:
  1. Validate inputs
  2. Connect to camera via VAPIX
  3. Retrieve serial number from basicdeviceinfo.cgi
  4. Check if serial already exists (reject if duplicate)
  5. Auto-detect model, firmware, capabilities
  6. Test RTSP stream
  7. Encrypt password
  8. Save to MongoDB
  9. Initialize recording if active=true
- Returns: Created camera object
- Status: 201 Created, 400 Bad Request, 409 Conflict (duplicate serial)
- Auth: Admin or Operator

**PUT /api/cameras/:serial**
- Body: Partial camera object (fields to update)
- Process:
  1. Validate changes
  2. Apply stream settings via VAPIX if changed
  3. Update MongoDB
  4. Restart recording stream if settings changed
- Returns: Updated camera object
- Status: 200 OK, 404 Not Found, 400 Bad Request
- Auth: Admin or Operator

**DELETE /api/cameras/:serial**
- Process:
  1. Stop active recording
  2. Mark recordings for deletion or archive based on policy
  3. Remove from MongoDB
  4. Log to audit log
- Returns: `{success: true}`
- Status: 200 OK, 404 Not Found
- Auth: Admin only

**POST /api/cameras/:serial/test**
- Tests connection to camera and RTSP stream
- Returns: `{connected: boolean, capabilities: {...}, error?: string}`
- Status: 200 OK
- Auth: Admin or Operator

**POST /api/cameras/discover**
- Scans local network for Axis cameras (UPnP/ONVIF discovery)
- Body: `{subnet: "192.168.1.0/24"}` (optional)
- Returns: Array of discovered devices with serial, IP, model
- Status: 200 OK
- Auth: Admin or Operator

**GET /api/cameras/:serial/status**
- Real-time status including stream health
- Returns: `{connectionState, recordingState, bitrate, fps, lastSeen, diskUsage}`
- Status: 200 OK, 404 Not Found
- Auth: Any authenticated user

**POST /api/cameras/:serial/snapshot**
- Captures still image via VAPIX
- Returns: JPEG image (binary)
- Status: 200 OK, 404 Not Found, 500 Internal Server Error
- Auth: Any authenticated user

**GET /api/cameras/:serial/events**
- Query params: `?start=ISO8601&end=ISO8601&types=motion,audio&limit=100`
- Queries InfluxDB for events in time range
- Returns: Array of events
- Status: 200 OK
- Auth: Any authenticated user

**PUT /api/cameras/:serial/retention**
- Body: `{retentionDays: number}`
- Updates retention policy for specific camera
- Returns: Updated camera object
- Status: 200 OK, 404 Not Found
- Auth: Admin only

### Recording Management

**GET /api/recordings**
- Query params: `?cameraId=SERIAL&start=ISO8601&end=ISO8601&eventTags=motion&limit=50&offset=0&sortBy=startTime&sortOrder=desc`
- Returns: Array of recording objects with pagination metadata
- Status: 200 OK
- Auth: Any authenticated user

**GET /api/recordings/:id**
- Returns: Full recording object with segments
- Status: 200 OK, 404 Not Found
- Auth: Any authenticated user

**GET /api/recordings/:id/stream**
- Streams video file with HTTP range request support
- Query params: `?segment=0` (optional, specific segment index)
- Returns: Video stream (video/mp4)
- Headers: `Accept-Ranges: bytes`
- Status: 200 OK, 206 Partial Content, 404 Not Found
- Auth: Any authenticated user

**GET /api/recordings/:id/download**
- Downloads recording (concatenates segments if multiple)
- Returns: Single MP4 file
- Headers: `Content-Disposition: attachment; filename="recording_YYYYMMDD_HHmmss.mp4"`
- Status: 200 OK, 404 Not Found
- Auth: Operator or Admin

**DELETE /api/recordings/:id**
- Soft deletes recording (marks for deletion in next cleanup)
- Process:
  1. Check if protected (reject if true)
  2. Update status to "deleted"
  3. Log to audit log
- Returns: `{success: true}`
- Status: 200 OK, 403 Forbidden (if protected), 404 Not Found
- Auth: Admin only

**POST /api/recordings/:id/protect**
- Body: `{protected: boolean}`
- Toggles protection flag
- Returns: Updated recording object
- Status: 200 OK, 404 Not Found
- Auth: Admin only

**POST /api/recordings/export**
- Body: `{cameraId, start, end, format: "mp4"}`
- Creates async export job
- Returns: `{jobId, status: "pending"}`
- Status: 202 Accepted
- Auth: Operator or Admin

**GET /api/recordings/export/:jobId**
- Returns: Export job status
- Response: `{jobId, status: "pending|processing|completed|failed", progress: 0-100, downloadUrl?: string, error?: string}`
- Status: 200 OK, 404 Not Found
- Auth: Operator or Admin

**GET /api/recordings/live/:serial**
- Proxies live RTSP stream (HLS or WebRTC)
- Returns: HLS playlist (m3u8) or WebRTC signaling
- Status: 200 OK, 404 Not Found
- Auth: Any authenticated user

### Storage Management

**GET /api/storage/stats**
- Returns: `{totalGB, usedGB, availableGB, usagePercent, perCamera: [{cameraId, usedGB, recordingCount}]}`
- Status: 200 OK
- Auth: Any authenticated user

**GET /api/storage/retention**
- Returns: `{globalRetentionDays, cameras: [{cameraId, retentionDays}]}`
- Status: 200 OK
- Auth: Any authenticated user

**PUT /api/storage/retention**
- Body: `{globalRetentionDays: number}`
- Updates global retention policy
- Returns: Updated config
- Status: 200 OK
- Auth: Admin only

**POST /api/storage/cleanup**
- Manually triggers cleanup job
- Returns: `{jobStarted: true, nextScheduledRun: ISO8601}`
- Status: 200 OK
- Auth: Admin only

**GET /api/storage/protected**
- Returns: Array of protected recordings
- Status: 200 OK
- Auth: Any authenticated user

### Events

**GET /api/events**
- Query params: `?cameraId=SERIAL&types=motion,audio&severity=warning,critical&start=ISO8601&end=ISO8601&limit=100&offset=0`
- Queries InfluxDB
- Returns: Array of events with pagination
- Status: 200 OK
- Auth: Any authenticated user

**GET /api/events/stats**
- Query params: `?period=today|week|month`
- Returns: `{totalEvents, byType: {...}, byCamera: {...}, mostActive: [...]}`
- Status: 200 OK
- Auth: Any authenticated user

### User Management (Admin Only)

**GET /api/users**
- Returns: Array of users (passwords excluded)
- Status: 200 OK
- Auth: Admin only

**POST /api/users**
- Body: `{username, password, role, active}`
- Creates new user (password hashed with bcrypt)
- Returns: Created user object (password excluded)
- Status: 201 Created, 400 Bad Request, 409 Conflict (duplicate username)
- Auth: Admin only

**PUT /api/users/:id**
- Body: Partial user object
- Updates user (password re-hashed if changed)
- Returns: Updated user object
- Status: 200 OK, 404 Not Found
- Auth: Admin only

**DELETE /api/users/:id**
- Deletes user (cannot delete self)
- Returns: `{success: true}`
- Status: 200 OK, 403 Forbidden, 404 Not Found
- Auth: Admin only

### System

**GET /api/system/health**
- Health check endpoint
- Returns: `{status: "healthy|degraded|unhealthy", mongodb: boolean, influxdb: boolean, diskSpace: {...}, uptime: seconds}`
- Status: 200 OK (healthy), 503 Service Unavailable (unhealthy)
- Auth: None (public)

**GET /api/system/config**
- Returns: System configuration (non-sensitive)
- Status: 200 OK
- Auth: Admin only

**PUT /api/system/config**
- Body: Config key-value pairs
- Updates system configuration
- Returns: Updated config
- Status: 200 OK
- Auth: Admin only

**GET /api/system/logs**
- Query params: `?level=error|warn|info&limit=100&offset=0`
- Returns: Application logs
- Status: 200 OK
- Auth: Admin only

**GET /api/system/audit**
- Query params: `?userId=ID&action=TYPE&start=ISO8601&end=ISO8601&limit=100&offset=0`
- Returns: Audit log entries
- Status: 200 OK
- Auth: Admin only

---

## 6. RECORDING IMPLEMENTATION

### RTSP Stream URL Format (Axis)
```
rtsp://{username}:{password}@{address}:{port}/axis-media/media.amp?videocodec={codec}&streamprofile={profile}&zipstream=on&resolution={resolution}&fps={fps}
```

Example:
```
rtsp://admin:password@192.168.1.100:554/axis-media/media.amp?videocodec=h264&streamprofile=Quality&zipstream=on&resolution=1920x1080&fps=25
```

### FFmpeg Recording Command
```bash
ffmpeg -rtsp_transport tcp   -i "rtsp://..."   -c:v copy   -c:a copy   -f segment   -segment_time 60   -segment_format mp4   -segment_atclocktime 1   -strftime 1   -reset_timestamps 1   "/recordings/{cameraId}/%Y/%m/%d/%H/segment_%Y%m%d_%H%M%S.mp4"
```

### Storage Directory Structure
```
/recordings/
  /{camera_serial}/
    /2025/
      /12/
        /25/
          /12/
            segment_20251225_120000.mp4
            segment_20251225_120000.mp4.meta.json
            segment_20251225_120100.mp4
            segment_20251225_120100.mp4.meta.json
```

### Segment Metadata JSON (sidecar file)
```json
{
  "cameraId": "B8A44FD247E7",
  "timestamp": "2025-12-25T12:00:00.000Z",
  "duration": 60.5,
  "resolution": "1920x1080",
  "codec": "h264",
  "filesize": 12582912,
  "fps": 25,
  "bitrate": 2048000,
  "motionDetected": false,
  "events": []
}
```

### Recording Process Flow

1. **Stream Initialization**
   - Retrieve camera config from MongoDB
   - Construct RTSP URL with credentials
   - Spawn FFmpeg child process with segment output
   - Monitor process stdout/stderr for errors

2. **Segment Monitoring**
   - Watch output directory for new .mp4 files
   - On new segment creation:
     - Calculate file size and duration
     - Generate metadata JSON
     - Create/update recording document in MongoDB
     - Write metrics to InfluxDB

3. **Error Handling**
   - On FFmpeg process exit:
     - Log error to InfluxDB (camera_events)
     - Update camera status to "error"
     - Wait retry interval (5s, 15s, 30s, 60s with exponential backoff)
     - Attempt reconnection
     - After 5 failed attempts, mark camera offline

4. **Graceful Shutdown**
   - Send SIGTERM to FFmpeg process
   - Wait up to 10 seconds for clean segment finalization
   - Force kill (SIGKILL) if timeout exceeded
   - Update recording status to "completed"

---

## 7. RETENTION & CLEANUP

### Cleanup Job Schedule
- **Frequency:** Every 6 hours (configurable via cron expression)
- **Execution:** node-cron scheduler

### Cleanup Algorithm

1. Query MongoDB for all recordings where:
   - `status != "deleted"`
   - `protected != true`
   - `endTime < (now - retentionDays)`

2. For each recording:
   - Calculate retention deadline:
     - Use camera-specific `retentionDays` if set
     - Otherwise use global default (30 days)
   - If past deadline + 24hr grace period:
     - Delete all segment files from filesystem
     - Delete metadata JSON files
     - Update recording status to "deleted" in MongoDB
     - Log deletion to InfluxDB and audit log

3. Batch deletion:
   - Process max 100 recordings per cleanup run
   - If more than 100 eligible, schedule next run sooner

4. Emergency cleanup (disk space < 10%):
   - Override retention policy
   - Delete oldest non-protected recordings until space > 15%
   - Log emergency cleanup to audit log with critical severity

5. Orphan cleanup:
   - Find segment files on disk without MongoDB reference
   - Delete orphans older than 7 days

---

## 8. STARTUP & SHUTDOWN SEQUENCE

### Startup Sequence

1. **Environment Validation**
   - Load .env file
   - Validate required variables:
     - `MONGODB_URI`
     - `INFLUXDB_URL`
     - `INFLUXDB_TOKEN`
     - `INFLUXDB_ORG`
     - `INFLUXDB_BUCKET`
     - `STORAGE_PATH`
     - `JWT_SECRET`
   - Exit with code 1 if any missing

2. **Database Connection**
   - Attempt MongoDB connection:
     - Retry 5 times with 5-second intervals
     - Log each attempt
     - Exit with code 2 if all retries fail
   - Attempt InfluxDB connection:
     - Retry 5 times with 5-second intervals
     - Exit with code 3 if all retries fail
   - Log "Databases connected successfully"

3. **Storage Initialization**
   - Create storage directory if not exists
   - Check write permissions
   - Calculate available disk space
   - Log storage path and available space

4. **Service Initialization**
   - Load camera configurations from MongoDB
   - Initialize stream manager
   - For each active camera:
     - Start recording stream
     - Subscribe to VAPIX events
   - Start retention cleanup scheduler
   - Start system metrics collector

5. **API Server Start**
   - Bind to configured port (default: 3000)
   - Log "VideoX API server listening on port {port}"
   - Set service status to "running"

### Shutdown Sequence (SIGTERM/SIGINT)

1. **Graceful Shutdown Initiated**
   - Log "Shutdown signal received, stopping services..."
   - Stop accepting new API requests (close server)

2. **Stop Stream Manager**
   - For each active recording:
     - Send SIGTERM to FFmpeg process
     - Wait up to 10 seconds for segment finalization
     - Force kill if timeout
   - Wait for all streams to stop (max 30 seconds total)

3. **Finalize Data**
   - Flush any pending InfluxDB writes
   - Update all recording statuses to "completed"
   - Update all camera statuses to "offline"

4. **Close Database Connections**
   - Close MongoDB connection
   - Close InfluxDB client
   - Log "Database connections closed"

5. **Exit**
   - Log "VideoX stopped successfully"
   - Exit with code 0

### Health Monitoring (During Runtime)

- **Database Ping:** Every 30 seconds
  - If MongoDB ping fails: Log warning, pause new recordings
  - If InfluxDB ping fails: Log warning, buffer events in memory
  - On reconnection: Resume operations, flush buffered events

- **Disk Space Check:** Every 5 minutes
  - Calculate available space
  - If < 10%: Trigger emergency cleanup
  - If < 5%: Stop all recordings, log critical alert

---

## 9. VAPIX INTEGRATION

### Required VAPIX API Calls

**Get Device Serial Number (basicdeviceinfo.cgi)**
```http
GET http://{camera-ip}/axis-cgi/basicdeviceinfo.cgi
Authorization: Basic {base64(username:password)}
```
Response: Parse `root.Properties.SerialNumber`

**Get Device Info**
```http
GET http://{camera-ip}/axis-cgi/param.cgi?action=list&group=Brand,Properties
Authorization: Basic {base64(username:password)}
```
Response: Parse model, firmware version

**Get Stream Profiles**
```http
GET http://{camera-ip}/axis-cgi/streamprofile.cgi?action=list
Authorization: Basic {base64(username:password)}
```
Response: Parse available stream profiles

**Subscribe to Events (ONVIF Events)**
- Use ONVIF PullPointSubscription or VAPIX event API
- Subscribe to: Motion detection, Audio detection, Tampering

**Capture Snapshot**
```http
GET http://{camera-ip}/axis-cgi/jpg/image.cgi?resolution={resolution}
Authorization: Basic {base64(username:password)}
```
Response: JPEG image binary

---

## 10. FRONTEND STRUCTURE

### File/Folder Structure
```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Table.jsx
│   │   │   ├── Toast.jsx
│   │   │   └── Loader.jsx
│   │   ├── layout/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── Layout.jsx
│   │   ├── camera/
│   │   │   ├── CameraCard.jsx
│   │   │   ├── CameraForm.jsx
│   │   │   ├── CameraList.jsx
│   │   │   ├── CameraStatus.jsx
│   │   │   └── CameraGrid.jsx
│   │   ├── recording/
│   │   │   ├── RecordingList.jsx
│   │   │   ├── VideoPlayer.jsx
│   │   │   ├── RecordingFilters.jsx
│   │   │   └── RecordingCard.jsx
│   │   ├── live/
│   │   │   ├── LiveGrid.jsx
│   │   │   ├── LivePlayer.jsx
│   │   │   └── GridControls.jsx
│   │   ├── storage/
│   │   │   ├── StorageOverview.jsx
│   │   │   ├── RetentionSettings.jsx
│   │   │   └── StorageChart.jsx
│   │   ├── events/
│   │   │   ├── EventTimeline.jsx
│   │   │   ├── EventCard.jsx
│   │   │   └── EventFilters.jsx
│   │   └── settings/
│   │       ├── UserManagement.jsx
│   │       ├── SystemSettings.jsx
│   │       └── AlertConfig.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── LiveView.jsx
│   │   ├── Recordings.jsx
│   │   ├── Cameras.jsx
│   │   ├── Storage.jsx
│   │   ├── Events.jsx
│   │   ├── Settings.jsx
│   │   └── Login.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCameras.js
│   │   ├── useRecordings.js
│   │   └── useWebSocket.js
│   ├── services/
│   │   ├── api.js            // Axios instance with interceptors
│   │   ├── auth.js
│   │   ├── cameras.js
│   │   ├── recordings.js
│   │   └── storage.js
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── ToastContext.jsx
│   ├── utils/
│   │   ├── formatters.js     // Date, size, duration formatters
│   │   ├── validators.js
│   │   └── constants.js
│   ├── App.jsx
│   └── index.jsx
└── package.json
```

### React Router Routes
```javascript
/login                  // Login page (public)
/                       // Dashboard (protected)
/live                   // Live view grid (protected)
/recordings             // Recording browser (protected)
/cameras                // Camera management (protected - operator+)
/cameras/:serial        // Camera detail (protected)
/storage                // Storage management (protected)
/events                 // Event timeline (protected)
/settings               // System settings (protected - admin only)
/settings/users         // User management (protected - admin only)
```

---

## 11. UI COMPONENTS SPECIFICATION

### Dashboard Page
**Components:**
- MetricCard (x4): Total cameras, Recording status, Storage used, Recent events
- CameraGrid: 3-4 column responsive grid of CameraCard components
- EventTimeline: Last 10 events with icons and links

**Data Fetching:**
- GET /api/cameras (status summary)
- GET /api/storage/stats
- GET /api/events?limit=10

### Live View Page
**Components:**
- GridControls: Layout selector (1x1, 2x2, 3x3, 4x4), auto-cycle toggle
- LiveGrid: Responsive grid with draggable cells
- LivePlayer: Video.js player with overlay controls (name, status, timestamp)

**Features:**
- Drag-and-drop camera reordering (save layout to localStorage)
- Fullscreen mode (ESC to exit)
- Auto-cycle (rotate cameras every 10s)
- Stream: GET /api/recordings/live/:serial (HLS)

### Recordings Page
**Components:**
- RecordingFilters: Date range, camera selector, event type filters
- RecordingList: Paginated table/card view
- VideoPlayer: Modal with Video.js player + metadata panel

**Data Fetching:**
- GET /api/recordings (with query params)
- GET /api/recordings/:id/stream (video playback)

**Features:**
- Bulk selection with checkboxes
- Download button: GET /api/recordings/:id/download
- Delete button (admin): DELETE /api/recordings/:id
- Thumbnail preview on hover over timeline

### Camera Management Page
**Components:**
- CameraList: Table with inline editing
- CameraForm: Modal/side panel with tabs (Connection, Stream, Recording, General)
- CameraStatus: Real-time status indicators

**Data Fetching:**
- GET /api/cameras
- POST /api/cameras (add)
- PUT /api/cameras/:serial (update)
- DELETE /api/cameras/:serial (delete)

**Form Validation:**
- IP address format
- Port range (1-65535)
- Required fields: address, username, password, name
- Test connection before save

### Storage Page
**Components:**
- StorageOverview: Donut chart (total/used/available)
- StorageChart: Horizontal bar chart (per-camera usage)
- RetentionSettings: Global default + per-camera table

**Data Fetching:**
- GET /api/storage/stats
- GET /api/storage/retention
- PUT /api/storage/retention (update)

### Events Page
**Components:**
- EventTimeline: Infinite scroll feed
- EventCard: Icon, camera name, type, timestamp, thumbnail
- EventFilters: Date range, camera, event type, severity

**Data Fetching:**
- GET /api/events (with query params)
- Infinite scroll: Load more with offset

### Settings Page (Admin Only)
**Tabs:**
- System: DB status, cleanup schedule, API settings
- Users: User table with add/edit/delete
- Alerts: Alert toggles and thresholds
- Health: Uptime, connections, errors log

---

## 12. AUTHENTICATION & AUTHORIZATION

### JWT Implementation

**Token Structure:**
```javascript
{
  id: user._id,
  username: user.username,
  role: user.role,
  iat: issued_at,
  exp: expiration
}
```

**Token Expiration:**
- Access token: 1 hour
- Refresh token: 7 days

**Middleware:**
- Verify JWT on all protected routes
- Decode token and attach `req.user`
- Check role permissions based on route requirements

**Role Permissions:**
- **viewer:** GET endpoints only (cameras, recordings, events, storage stats)
- **operator:** viewer + POST cameras, POST recordings/export, GET/POST snapshot
- **admin:** Full access (all endpoints including DELETE, user management, system config)

### Password Security
- Hash with bcrypt (10 rounds)
- Camera passwords encrypted with AES-256-CBC using `JWT_SECRET` as key

---

## 13. ERROR HANDLING

### API Error Response Format
```javascript
{
  error: {
    code: "ERROR_CODE",
    message: "Human-readable error message",
    details: {...}  // Optional additional context
  }
}
```

### Error Codes
- `AUTH_INVALID_CREDENTIALS` - 401
- `AUTH_TOKEN_EXPIRED` - 401
- `AUTH_INSUFFICIENT_PERMISSIONS` - 403
- `CAMERA_NOT_FOUND` - 404
- `CAMERA_ALREADY_EXISTS` - 409
- `CAMERA_CONNECTION_FAILED` - 400
- `RECORDING_NOT_FOUND` - 404
- `RECORDING_PROTECTED` - 403
- `STORAGE_FULL` - 507
- `DATABASE_CONNECTION_ERROR` - 503
- `INTERNAL_SERVER_ERROR` - 500

### Frontend Error Handling
- Display error toasts (top-right, auto-dismiss)
- Log errors to console in development
- Retry logic for transient failures (network errors)
- Graceful degradation (show cached data if API fails)

---

## 14. PERFORMANCE OPTIMIZATION

### Backend
- **Connection pooling:** MongoDB (max 10 connections), InfluxDB (reuse client)
- **Caching:** Cache camera configs in memory (refresh every 5 min)
- **Batch operations:** Buffer InfluxDB writes (1-second intervals, max 100 points)
- **Stream optimization:** Use Axis Zipstream to reduce bandwidth by 50%
- **Segment size:** 60-second segments for optimal playback/storage balance

### Frontend
- **Code splitting:** Lazy load pages with React.lazy()
- **Image optimization:** Lazy load thumbnails with IntersectionObserver
- **Virtualization:** Virtual scrolling for large recording tables (react-window)
- **Debouncing:** Debounce search inputs (300ms)
- **Caching:** React Query cache (5 min stale time for camera list)
- **Optimistic updates:** Show UI changes immediately, rollback on error

---

## 15. LOGGING

### Log Levels
- **error:** Errors requiring attention (connection failures, recording errors)
- **warn:** Warnings (low disk space, camera offline)
- **info:** Important events (camera added, recording started)
- **debug:** Detailed debugging (FFmpeg output, API requests)

### Log Format (JSON)
```javascript
{
  timestamp: "2025-12-25T12:00:00.000Z",
  level: "info",
  message: "Camera added",
  service: "videox-api",
  context: {
    cameraId: "B8A44FD247E7",
    userId: "admin"
  }
}
```

### Log Destinations
- **stdout:** All logs (JSON format)
- **file:** Error and warn logs rotated daily (max 30 days)
- **InfluxDB:** System metrics and camera events

### Logging Library
- Use `winston` or `pino` for structured logging

---

## 16. CONFIGURATION

### Environment Variables
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/videox
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your_token_here
INFLUXDB_ORG=videox
INFLUXDB_BUCKET=videox

# Storage
STORAGE_PATH=/var/videox/recordings

# Server
API_PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=your_secret_key_here
ENCRYPTION_KEY=your_encryption_key_here

# System
GLOBAL_RETENTION_DAYS=30
CLEANUP_SCHEDULE="0 */6 * * *"
MAX_CONCURRENT_STREAMS=20
MAX_CONCURRENT_EXPORTS=3

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/videox
```

### Config File (optional: config.json)
```json
{
  "recording": {
    "segmentDuration": 60,
    "preBuffer": 5,
    "postBuffer": 10
  },
  "storage": {
    "quotaGB": 5000,
    "emergencyThreshold": 0.05
  },
  "alerts": {
    "cameraOfflineMinutes": 5,
    "storageWarningPercent": 80,
    "storageErrorPercent": 90
  },
  "api": {
    "rateLimit": 100,
    "rateLimitWindow": 60000
  }
}
```

---

## 17. DEPLOYMENT

### Systemd Service Unit
```ini
[Unit]
Description=VideoX Video Management System
After=network.target mongod.service influxdb.service

[Service]
Type=simple
User=videox
WorkingDirectory=/opt/videox
ExecStart=/usr/bin/node /opt/videox/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Installation Steps
1. Install Node.js 20.x LTS
2. Install MongoDB 7.x
3. Install InfluxDB 2.x
4. Install FFmpeg with H.264/H.265 support
5. Create videox user and group
6. Clone/copy application to /opt/videox
7. Run `npm install --production`
8. Create .env file with configuration
9. Create storage directory with proper permissions
10. Enable and start systemd service
11. Configure firewall (allow port 3000 on local network only)

### Initial Setup
1. Start service
2. Create admin user via CLI or seed script
3. Login to web UI
4. Configure system settings
5. Add first camera

---

## 18. TESTING REQUIREMENTS

### Backend Unit Tests
- Database connection manager
- JWT authentication middleware
- Camera VAPIX integration
- Retention policy calculation
- Recording segment parsing

### Backend Integration Tests
- API endpoint responses
- Database operations (CRUD)
- Stream manager lifecycle
- Cleanup job execution

### Frontend Unit Tests
- Form validation
- Date/time formatters
- Auth context logic

### Frontend Integration Tests
- Login flow
- Camera add/edit/delete flow
- Video playback
- Recording search and filter

### E2E Tests
- Complete user workflow: Login → Add camera → View live → Browse recordings → Logout

---

## 19. SECURITY CONSIDERATIONS

### Network Security
- Bind API to local network interface only (0.0.0.0 or 192.168.x.x)
- Do not expose to internet
- Use firewall rules to restrict access
- Consider VPN for remote access

### Application Security
- Validate all user inputs
- Sanitize camera names and tags (prevent XSS)
- Rate limiting on API endpoints (100 req/min per IP)
- Encrypt camera credentials in database (AES-256)
- Hash user passwords with bcrypt (10 rounds)
- Use HTTPS (even on local network) with self-signed cert or Let's Encrypt
- Set secure HTTP headers (helmet middleware)
- Implement CSRF protection for state-changing operations

### Camera Security
- Store camera credentials encrypted
- Use separate user account on cameras (not admin)
- Rotate camera passwords periodically (manual process)
- Audit camera access logs

### Data Security
- Encrypt sensitive data at rest (camera credentials)
- Secure file permissions on recording directory (chmod 750)
- Regular database backups (automated, encrypted)
- Audit logging of all destructive operations

---

## 20. MONITORING & OBSERVABILITY

### Health Checks
- `/api/system/health` endpoint (returns 200 if healthy)
- Check database connections
- Check disk space
- Check active recordings

### Metrics to Track (InfluxDB)
- Active camera count
- Recording failure rate
- Average stream bitrate per camera
- Disk I/O operations
- API request latency (p50, p95, p99)
- Authentication failures
- Storage growth rate

### Alerts to Implement
- Camera offline > 5 minutes
- Recording failure (3 consecutive attempts)
- Disk space < 10%
- Database connection lost
- High API error rate (> 5% of requests)

### Log Monitoring
- Centralize logs (optional: Grafana Loki)
- Alert on ERROR level logs
- Track warning trends

---

## 21. FUTURE ENHANCEMENTS (Out of Scope for Initial Implementation)

- Multi-server support (distributed VMS)
- Cloud backup/archive
- Mobile app (React Native)
- AI-powered event detection (person, vehicle, object)
- PTZ control via UI
- Two-way audio
- Email/SMS/webhook notifications
- LDAP/Active Directory integration
- Multi-tenancy (separate organizations)
- Bandwidth throttling per camera
- Video transcoding on-the-fly
- Fisheye dewarping
- Privacy masking
- Heat maps and analytics
- Integration with home automation (Home Assistant, Node-RED)

---

## 22. DEVELOPMENT WORKFLOW

### Git Workflow
- **main:** Production-ready code
- **develop:** Integration branch
- **feature/*:** Feature branches
- **bugfix/*:** Bug fix branches

### Commit Message Format
```
type(scope): brief description

Detailed description if needed

Refs: #issue-number
```

Types: feat, fix, docs, style, refactor, test, chore

### Code Style
- **Backend:** ESLint with Airbnb style guide
- **Frontend:** ESLint + Prettier
- Use async/await (avoid callbacks)
- Prefer const/let over var
- Use template literals for strings

### Documentation
- JSDoc comments for all public functions
- README.md with setup instructions
- API documentation (Swagger/OpenAPI)
- Architecture diagram (optional)

---

## 23. IMPLEMENTATION PRIORITIES

### Phase 1: Core Backend (Priority 1)
1. Database connection manager
2. Camera CRUD API endpoints
3. VAPIX integration (serial retrieval, device info)
4. Recording engine (FFmpeg integration)
5. Stream manager with auto-reconnect
6. Basic retention cleanup job
7. Authentication (JWT)

### Phase 2: Core Frontend (Priority 1)
1. Login page
2. Dashboard with camera grid
3. Camera management page (list, add, edit, delete)
4. Basic live view (single camera)
5. Recording browser with playback

### Phase 3: Advanced Features (Priority 2)
1. Multi-camera live grid
2. Event timeline
3. Storage management UI
4. User management
5. System settings
6. Protected recordings
7. Export functionality

### Phase 4: Polish & Optimization (Priority 3)
1. Performance optimization
2. Comprehensive error handling
3. UI/UX improvements
4. Testing
5. Documentation
6. Deployment automation

---

## 24. ACCEPTANCE CRITERIA

### Must Have (MVP)
- ✓ Add Axis camera using serial number as ID
- ✓ Continuous recording with 60-second segments
- ✓ Browse and playback recordings
- ✓ View live stream from single camera
- ✓ Automatic retention policy enforcement (30 days default)
- ✓ Per-camera retention override
- ✓ User authentication (admin, operator, viewer roles)
- ✓ Storage statistics display
- ✓ Camera online/offline status
- ✓ Graceful handling of database connection loss
- ✓ Service startup dependency on MongoDB and InfluxDB

### Should Have
- ✓ Multi-camera live grid view
- ✓ Motion-triggered recording mode
- ✓ Event timeline (motion, audio, tampering)
- ✓ Protected recordings (exclude from deletion)
- ✓ Export recording as single file
- ✓ User management (add, edit, delete users)
- ✓ Camera discovery (network scan)
- ✓ Snapshot capture
- ✓ Audit logging

### Nice to Have
- ✓ Scheduled recording mode
- ✓ PTZ controls (if camera supports)
- ✓ Real-time stream health metrics
- ✓ Bulk camera operations
- ✓ Configuration backup/restore
- ✓ Advanced search (by event type, tags)

---

## 25. DEFINITIONS & GLOSSARY

- **VMS:** Video Management System
- **VAPIX:** Axis Communications' HTTP-based API for camera control
- **ONVIF:** Open Network Video Interface Forum (industry standard)
- **RTSP:** Real Time Streaming Protocol
- **HLS:** HTTP Live Streaming (Apple's streaming protocol)
- **Segment:** Individual video file (60 seconds)
- **Recording:** Collection of segments spanning a time range
- **Retention:** Number of days to keep recordings before deletion
- **Protected Recording:** Recording excluded from automatic deletion
- **Zipstream:** Axis compression technology that reduces bandwidth
- **Stream Profile:** Preset configuration on Axis camera (Quality, Balanced, etc.)

---

## IMPLEMENTATION NOTES

1. **Camera Serial as Primary Key:**
   - Always retrieve serial via VAPIX `basicdeviceinfo.cgi` on camera addition
   - Use serial as `_id` in MongoDB cameras collection
   - Reject duplicate serial numbers with 409 Conflict

2. **Database Dependency:**
   - Application MUST NOT start if MongoDB or InfluxDB unavailable
   - Implement 5 retry attempts with 5-second intervals
   - Exit with specific error codes (2=MongoDB, 3=InfluxDB)

3. **Recording Optimization:**
   - Use `-c:v copy -c:a copy` in FFmpeg (stream copy, no transcoding)
   - Enable Zipstream on Axis cameras by default (50% bandwidth savings)
   - Segment duration 60 seconds balances file count vs seeking performance

4. **Retention Enforcement:**
   - Default global retention: 30 days
   - Per-camera override stored in camera document
   - 24-hour grace period before physical deletion
   - Protected flag prevents automatic deletion

5. **Security:**
   - Camera passwords encrypted with AES-256 before MongoDB storage
   - User passwords hashed with bcrypt (cost factor 10)
   - JWT tokens with 1-hour expiration
   - Role-based access control enforced at API level

6. **Error Recovery:**
   - Stream reconnection with exponential backoff (5s, 15s, 30s, 60s)
   - Database connection monitoring every 30 seconds
   - Emergency cleanup when disk space < 10%
   - Graceful shutdown with 30-second timeout for stream finalization

7. **UI Responsiveness:**
   - Lazy load thumbnails and video players
   - Virtual scrolling for large tables (>100 rows)
   - Debounced search (300ms)
   - Optimistic updates with rollback on error

---

END OF SPECIFICATION
