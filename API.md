# VideoX API Documentation

## Base URL

```
Development: http://localhost:3002/api
Production: https://your-server/api
```

## Authentication

All API endpoints (except `/auth/login` and `/system/health`) require authentication.

VideoX supports two authentication methods:

1. **JWT Tokens** - Short-lived tokens for user sessions (15-minute expiration)
2. **API Tokens** - Long-lived tokens for external integrations and automation

### Request Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

### JWT Token Management

- **Access Token**: 15-minute expiration, used for all API requests
- **Refresh Token**: 7-day expiration, used to obtain new access tokens
- Store both tokens securely (localStorage in browser, keychain in mobile)
- Best for: Web UI, mobile apps, user sessions

### API Token Management

- **API Tokens**: Long-lived bearer tokens (configurable expiration or never)
- Created by users in the Settings UI
- Each token has a name, optional expiration date, and can be enabled/disabled
- Token value is only shown once upon creation
- Best for: External integrations, automation scripts, third-party applications
- See [API Token Endpoints](#api-token-endpoints) for management

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Validation error or malformed request |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions for this action |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists (duplicate) |
| 500 | Internal Server Error | Server-side error |

### Common Error Codes

- `VALIDATION_ERROR`: Request body validation failed
- `UNAUTHORIZED`: Authentication failed
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `CAMERA_NOT_FOUND`: Camera with specified serial not found
- `RECORDING_NOT_FOUND`: Recording not found
- `CAMERA_ALREADY_EXISTS`: Camera with serial already exists
- `CAMERA_CONNECTION_FAILED`: Failed to connect to camera
- `CAMERA_INACTIVE`: Camera is not active
- `RECORDING_PROTECTED`: Cannot delete protected recording
- `TOKEN_NOT_FOUND`: API token not found
- `TOKEN_EXPIRED`: API token has expired
- `NO_RECORDINGS`: No recordings found for specified time range
- `FILES_NOT_FOUND`: Recording files are missing from disk
- `RATE_LIMIT_EXCEEDED`: Too many requests

---

## Authentication Endpoints

### POST /auth/login

Authenticate user and obtain access token.

**Request Body**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Success Response (200 OK)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "role": "admin"
  }
}
```

**Error Response (401 Unauthorized)**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

---

### POST /auth/refresh

Refresh access token using refresh token.

**Request Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200 OK)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### POST /auth/logout

Logout user (invalidates refresh token).

**Request Headers**
```
Authorization: Bearer <access_token>
```

**Success Response (200 OK)**
```json
{
  "success": true
}
```

---

## Camera Endpoints

### GET /cameras

Get list of all cameras.

**Query Parameters**
- `status` (optional): Filter by connection state (online, offline)
- `tags` (optional): Filter by tags (comma-separated)
- `limit` (optional): Maximum number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Success Response (200 OK)**
```json
[
  {
    "_id": "B8A44F3024BB",
    "name": "Front Camera",
    "address": "front.internal",
    "port": 554,
    "credentials": {
      "username": "nodered"
    },
    "streamSettings": {
      "profile": "Quality",
      "resolution": "1920x1080",
      "fps": 25,
      "bitrate": 4000000
    },
    "recordingSettings": {
      "enabled": true,
      "fps": 25,
      "bitrate": 4000000
    },
    "retentionDays": 30,
    "active": true,
    "status": {
      "connectionState": "online",
      "recordingState": "recording",
      "lastSeen": "2025-12-25T17:30:00.000Z",
      "currentBitrate": 4200000,
      "currentFps": 25
    },
    "metadata": {
      "model": "AXIS Q3536-LVE",
      "firmware": "11.11.77",
      "location": "Front Entrance",
      "tags": ["outdoor", "entrance"],
      "capabilities": {
        "ptz": false,
        "audio": true,
        "profiles": ["Quality", "Balanced", "Bandwidth"]
      }
    },
    "createdAt": "2025-12-25T16:55:03.000Z",
    "updatedAt": "2025-12-25T17:30:00.000Z"
  }
]
```

**Permissions**: All roles

---

### GET /cameras/:serial

Get camera details by serial number.

**URL Parameters**
- `serial`: Camera serial number (e.g., B8A44F3024BB)

**Success Response (200 OK)**
```json
{
  "_id": "B8A44F3024BB",
  "name": "Front Camera",
  "address": "front.internal",
  "port": 554,
  "credentials": {
    "username": "nodered"
  },
  "streamSettings": { ... },
  "recordingSettings": { ... },
  "status": { ... },
  "metadata": { ... }
}
```

**Error Response (404 Not Found)**
```json
{
  "error": {
    "code": "CAMERA_NOT_FOUND",
    "message": "Camera not found"
  }
}
```

**Permissions**: All roles

---

### POST /cameras

Add a new camera.

**Request Body**
```json
{
  "name": "Front Camera",
  "address": "front.internal",
  "port": 80,
  "credentials": {
    "username": "nodered",
    "password": "rednode"
  },
  "streamSettings": {
    "profile": "Quality",
    "resolution": "1920x1080",
    "fps": 25,
    "bitrate": 4000000
  },
  "recordingSettings": {
    "enabled": true,
    "fps": 25,
    "bitrate": 4000000
  },
  "metadata": {
    "location": "Front Entrance",
    "tags": ["outdoor", "entrance"]
  }
}
```

**Field Descriptions**
- `name`: Human-readable camera name (required)
- `address`: IP address or hostname (required)
- `port`: HTTP port for VAPIX API (default: 80)
- `credentials.username`: Camera username (required)
- `credentials.password`: Camera password (required)
- `streamSettings`: Stream configuration (optional)
- `recordingSettings`: Recording configuration (optional)
- `metadata.location`: Physical location (optional)
- `metadata.tags`: Categorization tags (optional)

**Success Response (201 Created)**
```json
{
  "_id": "B8A44F3024BB",
  "name": "Front Camera",
  "address": "front.internal",
  "credentials": {
    "username": "nodered"
  },
  "streamSettings": { ... },
  "recordingSettings": { ... },
  "status": {
    "connectionState": "online",
    "recordingState": "stopped",
    "lastSeen": "2025-12-25T17:00:00.000Z"
  },
  "metadata": {
    "model": "AXIS Q3536-LVE",
    "firmware": "11.11.77",
    "location": "Front Entrance",
    "tags": ["outdoor", "entrance"],
    "capabilities": { ... }
  }
}
```

**Error Responses**

400 Bad Request (Validation Error):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Camera name is required"
  }
}
```

400 Bad Request (Connection Failed):
```json
{
  "error": {
    "code": "CAMERA_CONNECTION_FAILED",
    "message": "Failed to connect to camera: HTTP 401: Unauthorized"
  }
}
```

409 Conflict (Already Exists):
```json
{
  "error": {
    "code": "CAMERA_ALREADY_EXISTS",
    "message": "A camera with this serial number already exists",
    "details": {
      "serial": "B8A44F3024BB"
    }
  }
}
```

**Permissions**: Admin, Operator

---

### PUT /cameras/:serial

Update camera settings.

**URL Parameters**
- `serial`: Camera serial number

**Request Body** (all fields optional)
```json
{
  "name": "Front Entrance Camera",
  "streamSettings": {
    "profile": "Balanced",
    "resolution": "1280x720",
    "fps": 15
  },
  "recordingSettings": {
    "enabled": true,
    "fps": 15,
    "bitrate": 2000000
  },
  "retentionDays": 60,
  "active": true,
  "metadata": {
    "location": "Main Entrance",
    "tags": ["outdoor", "high-priority"]
  }
}
```

**Success Response (200 OK)**
```json
{
  "_id": "B8A44F3024BB",
  "name": "Front Entrance Camera",
  "streamSettings": { ... },
  "recordingSettings": { ... },
  "retentionDays": 60,
  "active": true,
  "metadata": { ... }
}
```

**Permissions**: Admin, Operator

---

### DELETE /cameras/:serial

Delete a camera.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK)**
```json
{
  "success": true
}
```

**Permissions**: Admin only

---

### POST /cameras/test

Test connection to a camera before adding.

**Request Body**
```json
{
  "address": "front.internal",
  "port": 80,
  "credentials": {
    "username": "nodered",
    "password": "rednode"
  }
}
```

**Success Response (200 OK)**
```json
{
  "connected": true,
  "model": "AXIS Q3536-LVE",
  "firmware": "11.11.77",
  "serial": "B8A44F3024BB",
  "capabilities": {
    "ptz": false,
    "audio": true,
    "profiles": ["Quality", "Balanced", "Bandwidth"]
  }
}
```

**Error Response (Connection Failed)**
```json
{
  "connected": false,
  "error": "Failed to connect to camera: Connection timeout"
}
```

**Permissions**: Admin, Operator

---

### POST /cameras/:serial/snapshot

Capture a snapshot from camera.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK)**
- Content-Type: `image/jpeg`
- Body: JPEG image data

**Permissions**: All roles

---

### GET /cameras/:serial/status

Get real-time camera status.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK)**
```json
{
  "connectionState": "online",
  "recordingState": "recording",
  "lastSeen": "2025-12-25T17:30:00.000Z",
  "currentBitrate": 4200000,
  "currentFps": 25
}
```

**Permissions**: All roles

---

## Recording Endpoints

### GET /recordings

Get recordings with filtering and pagination.

**Query Parameters**
- `cameraId` (optional): Filter by camera serial
- `startDate` (optional): ISO 8601 date (e.g., 2025-12-25T00:00:00Z)
- `endDate` (optional): ISO 8601 date
- `status` (optional): Filter by status (recording, completed, error)
- `protected` (optional): Filter by protection status (true, false)
- `eventTags` (optional): Filter by event tags (comma-separated)
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Success Response (200 OK)**
```json
{
  "recordings": [
    {
      "_id": "676c0a1f8e9b4c001a2b3c4d",
      "cameraId": "B8A44F3024BB",
      "filename": "segment_20251225_170000.mp4",
      "filePath": "/home/fred/videox-storage/recordings/B8A44F3024BB/2025/12/25/17/segment_20251225_170000.mp4",
      "startTime": "2025-12-25T17:00:00.000Z",
      "endTime": "2025-12-25T17:01:00.000Z",
      "duration": 60,
      "size": 4532412,
      "status": "completed",
      "protected": false,
      "retentionDate": "2026-01-24T17:00:00.000Z",
      "eventTags": [],
      "metadata": {
        "resolution": "1920x1080",
        "codec": "h264",
        "bitrate": 4000000,
        "fps": 25
      },
      "createdAt": "2025-12-25T17:01:00.000Z"
    }
  ],
  "total": 1440,
  "limit": 100,
  "offset": 0
}
```

**Permissions**: All roles

---

### GET /recordings/:id

Get recording details by ID.

**URL Parameters**
- `id`: Recording MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "_id": "676c0a1f8e9b4c001a2b3c4d",
  "cameraId": "B8A44F3024BB",
  "filename": "segment_20251225_170000.mp4",
  "filePath": "/home/fred/videox-storage/recordings/B8A44F3024BB/2025/12/25/17/segment_20251225_170000.mp4",
  "startTime": "2025-12-25T17:00:00.000Z",
  "endTime": "2025-12-25T17:01:00.000Z",
  "duration": 60,
  "size": 4532412,
  "status": "completed",
  "protected": false,
  "retentionDate": "2026-01-24T17:00:00.000Z",
  "metadata": { ... }
}
```

**Permissions**: All roles

---

### GET /recordings/:id/stream

Stream a recording video file.

**URL Parameters**
- `id`: Recording MongoDB ObjectId

**Request Headers**
- `Range` (optional): Byte range for video seeking (e.g., bytes=0-1023)

**Success Response (200 OK / 206 Partial Content)**
- Content-Type: `video/mp4`
- Body: MP4 video data

**Range Request Example**
```
GET /api/recordings/676c0a1f8e9b4c001a2b3c4d/stream
Range: bytes=0-1048575
```

**Response Headers**
```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1048575/4532412
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

**Error Response (404 Not Found - File Missing)**
```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Video file not found on disk"
  }
}
```

**Permissions**: All roles

---

### POST /recordings/:cameraId/start

Start recording for a camera.

**URL Parameters**
- `cameraId`: Camera serial number

**Success Response (200 OK)**
```json
{
  "success": true,
  "cameraId": "B8A44F3024BB",
  "status": "recording"
}
```

**Error Response (400 Bad Request - Camera Inactive)**
```json
{
  "error": {
    "code": "CAMERA_INACTIVE",
    "message": "Cannot start recording for inactive camera"
  }
}
```

**Permissions**: Admin, Operator

---

### POST /recordings/:cameraId/stop

Stop recording for a camera.

**URL Parameters**
- `cameraId`: Camera serial number

**Success Response (200 OK)**
```json
{
  "success": true,
  "cameraId": "B8A44F3024BB",
  "status": "stopped"
}
```

**Permissions**: Admin, Operator

---

### GET /recordings/:cameraId/status

Get recording status for a camera.

**URL Parameters**
- `cameraId`: Camera serial number

**Success Response (200 OK)**
```json
{
  "cameraId": "B8A44F3024BB",
  "recording": true,
  "startTime": "2025-12-25T17:00:00.000Z",
  "running": true
}
```

**Permissions**: All roles

---

### GET /recordings/active/list

Get all active recordings.

**Success Response (200 OK)**
```json
[
  {
    "cameraId": "B8A44F3024BB",
    "startTime": "2025-12-25T17:00:00.000Z",
    "running": true
  },
  {
    "cameraId": "B8A44FF11A35",
    "startTime": "2025-12-25T17:05:00.000Z",
    "running": true
  }
]
```

**Permissions**: All roles

---

### PUT /recordings/:id/protect

Mark recording as protected (prevents deletion by retention policy).

**URL Parameters**
- `id`: Recording MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "_id": "676c0a1f8e9b4c001a2b3c4d",
  "cameraId": "B8A44F3024BB",
  "filename": "segment_20251225_170000.mp4",
  "protected": true,
  "retentionDate": "2026-01-24T17:00:00.000Z",
  ...
}
```

**Permissions**: Admin, Operator

---

### PUT /recordings/:id/unprotect

Remove protected flag from recording.

**URL Parameters**
- `id`: Recording MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "_id": "676c0a1f8e9b4c001a2b3c4d",
  "cameraId": "B8A44F3024BB",
  "filename": "segment_20251225_170000.mp4",
  "protected": false,
  "retentionDate": "2026-01-24T17:00:00.000Z",
  ...
}
```

**Permissions**: Admin, Operator

---

### DELETE /recordings/:id

Delete a recording.

**URL Parameters**
- `id`: Recording MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "success": true
}
```

**Error Response (403 Forbidden - Protected)**
```json
{
  "error": {
    "code": "RECORDING_PROTECTED",
    "message": "Cannot delete protected recording"
  }
}
```

**Permissions**: Admin only

---

## Live Streaming Endpoints

### GET /live/:serial/start

Start live HLS stream for a camera.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK)**
```json
{
  "success": true,
  "cameraId": "B8A44F3024BB",
  "playlistUrl": "/hls/B8A44F3024BB/playlist.m3u8"
}
```

**Usage**
1. Call this endpoint to start the stream
2. Wait 2-3 seconds for HLS segments to be generated
3. Load the playlist URL in Video.js or native HLS player

**Permissions**: All roles

---

### GET /live/:serial/stop

Stop live HLS stream for a camera.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK)**
```json
{
  "success": true
}
```

**Permissions**: All roles

---

### GET /live/:serial/status

Get stream status for a camera.

**URL Parameters**
- `serial`: Camera serial number

**Success Response (200 OK - Stream Active)**
```json
{
  "cameraId": "B8A44F3024BB",
  "startTime": "2025-12-25T17:30:00.000Z",
  "running": true,
  "playlistUrl": "/hls/B8A44F3024BB/playlist.m3u8"
}
```

**Success Response (200 OK - Stream Inactive)**
```json
{
  "running": false
}
```

**Permissions**: All roles

---

### GET /live/active

Get all active streams.

**Success Response (200 OK)**
```json
[
  {
    "cameraId": "B8A44F3024BB",
    "startTime": "2025-12-25T17:30:00.000Z",
    "running": true,
    "playlistUrl": "/hls/B8A44F3024BB/playlist.m3u8"
  }
]
```

**Permissions**: All roles

---

## Storage Endpoints

### GET /storage/stats

Get storage statistics.

**Success Response (200 OK)**
```json
{
  "totalGB": 500,
  "usedGB": 127.5,
  "availableGB": 372.5,
  "usagePercent": 25.5,
  "recordings": {
    "count": 43200,
    "totalSizeGB": 125.3
  },
  "byCam era": [
    {
      "cameraId": "B8A44F3024BB",
      "name": "Front Camera",
      "recordingCount": 21600,
      "totalSizeGB": 62.7
    },
    {
      "cameraId": "B8A44FF11A35",
      "name": "Back Camera",
      "recordingCount": 21600,
      "totalSizeGB": 62.6
    }
  ]
}
```

**Permissions**: All roles

---

## System Endpoints

### GET /system/health

Health check endpoint (no authentication required).

**Success Response (200 OK - Healthy)**
```json
{
  "status": "healthy",
  "mongodb": {
    "status": "connected",
    "latency": 5
  },
  "influxdb": {
    "status": "connected",
    "latency": 8
  },
  "diskSpace": {
    "totalGB": 500,
    "usedGB": 127.5,
    "availableGB": 372.5,
    "usagePercent": 25.5
  },
  "uptime": 86400
}
```

**Degraded Response (503 Service Unavailable)**
```json
{
  "status": "degraded",
  "mongodb": {
    "status": "disconnected",
    "error": "Connection timeout"
  },
  "influxdb": {
    "status": "connected",
    "latency": 8
  },
  "diskSpace": { ... },
  "uptime": 86400
}
```

**Permissions**: Public (no authentication)

---

### GET /system/info

Get system information.

**Success Response (200 OK)**
```json
{
  "version": "1.0.0",
  "nodeVersion": "v20.10.0",
  "platform": "linux",
  "uptime": 86400,
  "cameras": {
    "total": 2,
    "active": 2,
    "recording": 2
  },
  "recordings": {
    "total": 43200,
    "last24Hours": 2880
  },
  "storage": {
    "availableGB": 372.5,
    "usagePercent": 25.5
  }
}
```

**Permissions**: All roles

---

## User Endpoints

### GET /users

Get list of all users (admin only).

**Success Response (200 OK)**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "role": "admin",
    "active": true,
    "lastLogin": "2025-12-25T17:00:00.000Z",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-12-25T17:00:00.000Z"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "username": "operator1",
    "role": "operator",
    "active": true,
    "lastLogin": "2025-12-25T16:00:00.000Z",
    "createdAt": "2025-01-05T00:00:00.000Z",
    "updatedAt": "2025-12-25T16:00:00.000Z"
  }
]
```

**Permissions**: Admin only

---

### POST /users

Create a new user (admin only).

**Request Body**
```json
{
  "username": "operator2",
  "password": "SecurePassword123!",
  "role": "operator",
  "active": true
}
```

**Success Response (201 Created)**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "username": "operator2",
  "role": "operator",
  "active": true,
  "createdAt": "2025-12-25T17:30:00.000Z",
  "updatedAt": "2025-12-25T17:30:00.000Z"
}
```

**Permissions**: Admin only

---

### PUT /users/:id

Update user (admin only).

**URL Parameters**
- `id`: User MongoDB ObjectId

**Request Body** (all fields optional)
```json
{
  "role": "admin",
  "active": false
}
```

**Success Response (200 OK)**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "username": "operator2",
  "role": "admin",
  "active": false,
  "updatedAt": "2025-12-25T17:35:00.000Z"
}
```

**Permissions**: Admin only

---

### DELETE /users/:id

Delete user (admin only).

**URL Parameters**
- `id`: User MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "success": true
}
```

**Permissions**: Admin only

---

## API Token Endpoints

### GET /tokens

Get list of user's API tokens.

**Success Response (200 OK)**
```json
[
  {
    "_id": "676c1a2b3c4d5e6f7a8b9c0d",
    "userId": "507f1f77bcf86cd799439011",
    "name": "Mobile App Integration",
    "active": true,
    "lastUsed": "2025-12-25T17:30:00.000Z",
    "expiresAt": "2026-01-24T17:00:00.000Z",
    "createdAt": "2025-12-18T10:00:00.000Z",
    "updatedAt": "2025-12-25T17:30:00.000Z"
  },
  {
    "_id": "676c1a2b3c4d5e6f7a8b9c0e",
    "name": "Automation Script",
    "active": true,
    "lastUsed": null,
    "expiresAt": null,
    "createdAt": "2025-12-20T14:00:00.000Z",
    "updatedAt": "2025-12-20T14:00:00.000Z"
  }
]
```

**Notes**
- Token values are never returned (security)
- Tokens are user-scoped (users only see their own tokens)
- Sorted by creation date (newest first)

**Permissions**: All roles

---

### POST /tokens

Create a new API token.

**Request Body**
```json
{
  "name": "Mobile App Integration",
  "expiresInDays": 30
}
```

**Field Descriptions**
- `name`: Descriptive name for the token (required)
- `expiresInDays`: Number of days until expiration (optional)
  - `0` or omitted: Never expires
  - `7`: Expires in 7 days
  - `30`: Expires in 30 days
  - `90`: Expires in 90 days
  - `365`: Expires in 365 days

**Success Response (201 Created)**
```json
{
  "_id": "676c1a2b3c4d5e6f7a8b9c0d",
  "name": "Mobile App Integration",
  "token": "vx_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
  "expiresAt": "2026-01-24T17:00:00.000Z",
  "active": true,
  "createdAt": "2025-12-25T17:00:00.000Z",
  "warning": "Save this token now - it will not be shown again!"
}
```

**Important**
- The `token` field is only returned once upon creation
- Store the token securely - it cannot be retrieved later
- Token format: `vx_` prefix + 32-byte base64url random string

**Error Response (400 Bad Request)**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Token name is required"
  }
}
```

**Permissions**: All roles

---

### DELETE /tokens/:id

Delete an API token.

**URL Parameters**
- `id`: Token MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "success": true
}
```

**Error Response (404 Not Found)**
```json
{
  "error": {
    "code": "TOKEN_NOT_FOUND",
    "message": "API token not found"
  }
}
```

**Notes**
- Users can only delete their own tokens
- Deletion is immediate and irreversible
- Audit log entry is created

**Permissions**: All roles (own tokens only)

---

### PATCH /tokens/:id/toggle

Toggle API token active status (enable/disable).

**URL Parameters**
- `id`: Token MongoDB ObjectId

**Success Response (200 OK)**
```json
{
  "_id": "676c1a2b3c4d5e6f7a8b9c0d",
  "name": "Mobile App Integration",
  "active": false,
  "expiresAt": "2026-01-24T17:00:00.000Z",
  "lastUsed": "2025-12-25T17:30:00.000Z"
}
```

**Notes**
- Inactive tokens are rejected during authentication
- Useful for temporarily disabling access without deleting
- Can be re-enabled by toggling again
- Audit log entry is created

**Permissions**: All roles (own tokens only)

---

## Export/Stream API

### GET /export

Export or stream recordings for a specific time range.

**Authentication**
- Supports both JWT tokens and API tokens
- Use API tokens for external integrations

**Query Parameters**
- `cameraId` (required): Camera serial number (e.g., B8A44F3024BB)
- `startTime` (required): Start time in epoch seconds (e.g., 1735146000)
- `duration` (required): Duration in seconds (e.g., 60)
- `type` (optional): Export type - `stream` (default) or `file`

**Request Headers**
```
Authorization: Bearer <jwt_token_or_api_token>
```

**Success Response - Stream (200 OK)**
- Content-Type: `video/mp4`
- Body: MP4 video stream
- Supports HTTP range requests for seeking

**Success Response - File Download (200 OK)**
- Content-Type: `video/mp4`
- Content-Disposition: `attachment; filename="export.mp4"`
- Body: MP4 video file

**Behavior**

1. **Single Recording**: If the time range matches a single recording, it's served directly with range request support for seeking

2. **Multiple Recordings**: If the time range spans multiple 60-second segments, they are concatenated using FFmpeg:
   - Uses `-c copy` (no re-encoding, fast)
   - Uses `-movflags +faststart` for streaming support
   - Seamless playback across segment boundaries

**Error Responses**

400 Bad Request (Missing Parameter):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "cameraId is required"
  }
}
```

400 Bad Request (Invalid Duration):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "duration (seconds) must be a positive number"
  }
}
```

404 Not Found (Camera Not Found):
```json
{
  "error": {
    "code": "CAMERA_NOT_FOUND",
    "message": "Camera not found"
  }
}
```

404 Not Found (No Recordings):
```json
{
  "error": {
    "code": "NO_RECORDINGS",
    "message": "No recordings found for specified time range"
  }
}
```

404 Not Found (Files Missing):
```json
{
  "error": {
    "code": "FILES_NOT_FOUND",
    "message": "Some recording files are missing",
    "details": {
      "missingCount": 3
    }
  }
}
```

**Example - Stream Recording**
```bash
curl -H "Authorization: Bearer <api_token>" \
  "http://localhost:3002/api/export?cameraId=B8A44F3024BB&startTime=1735146000&duration=300&type=stream" \
  --output recording.mp4
```

**Example - Download as File**
```bash
curl -H "Authorization: Bearer <api_token>" \
  "http://localhost:3002/api/export?cameraId=B8A44F3024BB&startTime=1735146000&duration=60&type=file" \
  --output recording.mp4
```

**Example - Calculate Epoch Time (JavaScript)**
```javascript
const startDate = new Date('2025-12-25T17:00:00Z');
const startTime = Math.floor(startDate.getTime() / 1000); // 1735146000

// Export 5 minutes starting at this time
const duration = 5 * 60; // 300 seconds

const url = `/api/export?cameraId=B8A44F3024BB&startTime=${startTime}&duration=${duration}&type=stream`;
```

**Example - Calculate Epoch Time (Python)**
```python
from datetime import datetime

start_date = datetime(2025, 12, 25, 17, 0, 0)
start_time = int(start_date.timestamp())  # 1735146000

# Export 5 minutes
duration = 5 * 60  # 300 seconds

url = f"/api/export?cameraId=B8A44F3024BB&startTime={start_time}&duration={duration}&type=file"
```

**Use Cases**
- Export recordings for archival purposes
- Download clips for evidence or sharing
- Integrate with external video management systems
- Automated backup scripts
- Third-party applications

**Permissions**: All roles (requires valid JWT or API token)

---

## Event Endpoints

### GET /events

Get events with filtering.

**Query Parameters**
- `cameraId` (optional): Filter by camera
- `eventType` (optional): Filter by type (motion, audio, system)
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `severity` (optional): Filter by severity (info, warning, error)
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Success Response (200 OK)**
```json
{
  "events": [
    {
      "_id": "676c0a1f8e9b4c001a2b3c4e",
      "cameraId": "B8A44F3024BB",
      "eventType": "motion",
      "severity": "info",
      "message": "Motion detected in zone 1",
      "metadata": {
        "zone": 1,
        "confidence": 0.95
      },
      "timestamp": "2025-12-25T17:00:15.000Z"
    }
  ],
  "total": 523,
  "limit": 100,
  "offset": 0
}
```

**Permissions**: All roles

---

## Rate Limiting

All API endpoints are rate-limited to prevent abuse.

**Limits**
- 100 requests per minute per IP address
- Applies to all `/api/*` endpoints

**Rate Limit Headers**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640458800
```

**Rate Limit Exceeded Response (429 Too Many Requests)**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later"
  }
}
```

---

## Pagination

Endpoints that return lists support pagination via `limit` and `offset` parameters.

**Request**
```
GET /api/recordings?limit=50&offset=100
```

**Response**
```json
{
  "recordings": [ ... ],
  "total": 1440,
  "limit": 50,
  "offset": 100
}
```

**Calculation**
- Page 1: `offset=0, limit=50`
- Page 2: `offset=50, limit=50`
- Page 3: `offset=100, limit=50`

**Total Pages**
```
totalPages = Math.ceil(total / limit)
```

---

## File Serving

### HLS Playlist and Segments

HLS files are served as static files from the `/hls` path.

**Playlist**
```
GET /hls/{cameraId}/playlist.m3u8
```

**Segment**
```
GET /hls/{cameraId}/segment_000.ts
```

**Example Playlist Content**
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:3
#EXT-X-MEDIA-SEQUENCE:2
#EXTINF:2.500000,
segment_002.ts
#EXTINF:2.466667,
segment_003.ts
#EXTINF:2.500011,
segment_004.ts
#EXTINF:2.466667,
segment_005.ts
```

**Client Implementation (Video.js)**
```javascript
const player = videojs('video-element', {
  sources: [{
    src: '/hls/B8A44F3024BB/playlist.m3u8',
    type: 'application/x-mpegURL'
  }]
});
```

---

## WebSocket API (Future)

Planned for Phase 4: Real-time event notifications via WebSocket.

**Connection**
```javascript
const ws = new WebSocket('ws://localhost:3002/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

**Event Format**
```json
{
  "type": "motion",
  "cameraId": "B8A44F3024BB",
  "timestamp": "2025-12-25T17:00:15.000Z",
  "data": {
    "zone": 1,
    "confidence": 0.95
  }
}
```

---

## Code Examples

### JavaScript (Axios)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3002/api',
  timeout: 30000
});

// Login
const login = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
  const { accessToken, refreshToken } = response.data;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  return response.data;
};

// Add authentication header
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Get cameras
const getCameras = async () => {
  const response = await api.get('/cameras');
  return response.data;
};

// Start recording
const startRecording = async (cameraId) => {
  const response = await api.post(`/recordings/${cameraId}/start`);
  return response.data;
};
```

### cURL Examples

**Login**
```bash
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Get Cameras**
```bash
curl http://localhost:3002/api/cameras \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Add Camera**
```bash
curl -X POST http://localhost:3002/api/cameras \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "name": "Front Camera",
    "address": "front.internal",
    "credentials": {
      "username": "nodered",
      "password": "rednode"
    }
  }'
```

**Stream Recording**
```bash
curl http://localhost:3002/api/recordings/676c0a1f8e9b4c001a2b3c4d/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --output recording.mp4
```

---

## Change Log

### Version 1.0.0 (2025-12-25)
- Initial API release
- Authentication endpoints (JWT-based)
- Camera management
- Recording management
- Live HLS streaming
- Storage statistics and management
- API token system for external integrations
- Export/stream API for recording downloads
- Health check endpoint
- User management
- Event logging

### Future Versions
- 1.1.0: WebSocket support for real-time events
- 1.2.0: Event timeline and notifications
- 1.3.0: PTZ camera control
- 2.0.0: Multi-site management
