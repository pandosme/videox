# VideoX Server

VideoX is a Video Management System (VMS) backend for managing Axis network cameras with continuous recording, live streaming, and storage management capabilities.

## Features

- **Camera Management**: Support for Axis network cameras via VAPIX API
- **Continuous Recording**: 60-second MP4 segments with automatic cleanup
- **Live Streaming**: HLS streaming with 2-second segments
- **Storage Management**: Automated retention policies and integrity checks
- **Recording Export**: API endpoints for video export and streaming
- **Health Monitoring**: Automatic recording restart and health checks
- **Single-User System**: Simple authentication with admin credentials

## Prerequisites

- **Node.js**: v16 or higher
- **MongoDB**: v4.4 or higher
- **FFmpeg**: Required for video processing
- **Axis Network Cameras**: For video capture

## Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd videox
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Verify installation:**
```bash
ffmpeg -version
```

### 4. Set Up MongoDB

Install and start MongoDB, or use a remote MongoDB instance.

**Ubuntu/Debian:**
```bash
sudo apt install mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

Create a database and user:
```bash
mongosh
use videox
db.createUser({
  user: "admin",
  pwd: "your_password",
  roles: ["readWrite", "dbAdmin"]
})
```

### 5. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```bash
# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# Database Configuration
MONGODB_URI=mongodb://admin:password@localhost:27017/videox?authSource=admin

# Storage Configuration
STORAGE_PATH=/var/lib/videox-storage
GLOBAL_RETENTION_DAYS=30

# Server Configuration
API_PORT=3002
NODE_ENV=production

# Security Configuration
JWT_SECRET=your_jwt_secret_min_32_characters_long
ENCRYPTION_KEY=your_32_character_encryption_key

# Performance Limits
MAX_CONCURRENT_STREAMS=20
MAX_CONCURRENT_EXPORTS=3

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/videox
```

### 6. Create Storage Directory

```bash
sudo mkdir -p /var/lib/videox-storage
sudo chown $USER:$USER /var/lib/videox-storage
```

## Running the Server

### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:3002` (or the port specified in your `.env` file).

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
pm2 start src/server.js --name videox

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh access token

### Cameras
- `GET /api/cameras` - List all cameras
- `POST /api/cameras` - Add a new camera
- `PUT /api/cameras/:serial` - Update camera settings
- `DELETE /api/cameras/:serial` - Remove a camera
- `POST /api/cameras/resolutions` - Get supported resolutions from camera

### Recordings
- `GET /api/recordings` - List recordings with filters
- `GET /api/recordings/:id` - Get recording details
- `DELETE /api/recordings/:id` - Delete a recording
- `GET /api/recordings/periods` - Get recording periods (for external integrations)

### Live Streaming
- `POST /api/live/start/:cameraId` - Start HLS stream
- `POST /api/live/stop/:cameraId` - Stop HLS stream
- `GET /hls/:cameraId/playlist.m3u8` - HLS playlist

### Storage
- `GET /api/storage/stats` - Get storage statistics
- `GET /api/storage/path` - Get current storage path
- `POST /api/storage/integrity/check` - Check storage integrity
- `POST /api/storage/integrity/import-orphans` - Import orphaned files
- `POST /api/storage/integrity/remove-orphans` - Remove orphaned files
- `DELETE /api/storage/flush` - Flush all recordings

### Export
- `GET /api/export` - Export/stream recording segments

### System
- `GET /api/system/health` - Health check endpoint

## CORS Configuration

By default, the server allows all origins. To restrict CORS for security:

Edit `.env`:
```bash
CORS_ORIGIN=http://your-client-domain.com:5173
```

Or in production with multiple clients:
```bash
CORS_ORIGIN=http://client1.com,http://client2.com
```

## Security Considerations

1. **Change Default Credentials**: Update `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`
2. **Secure JWT Secret**: Use a strong, random 32+ character `JWT_SECRET`
3. **Secure Encryption Key**: Use a random 32-character `ENCRYPTION_KEY`
4. **Enable HTTPS**: Use a reverse proxy (nginx/Apache) with SSL certificates
5. **Firewall**: Restrict access to port 3002 (or your configured port)
6. **Camera Credentials**: Camera passwords are encrypted using AES-256

## Monitoring and Logs

Logs are written to the path specified in `LOG_PATH` environment variable.

View logs with PM2:
```bash
pm2 logs videox
```

View logs directly:
```bash
tail -f /var/log/videox/combined.log
```

## Troubleshooting

### MongoDB Connection Issues
- Verify MongoDB is running: `sudo systemctl status mongodb`
- Check connection string in `.env`
- Ensure MongoDB user has correct permissions

### FFmpeg Not Found
- Install FFmpeg: `sudo apt install ffmpeg`
- Verify installation: `ffmpeg -version`

### Storage Permissions
- Ensure storage directory exists and is writable
- Check permissions: `ls -la /var/lib/videox-storage`

### Recording Not Starting
- Check camera connectivity
- Verify VAPIX credentials
- Check FFmpeg logs in application logs

## Development

### Project Structure
```
videox/
├── src/
│   ├── config/         # Database and configuration
│   ├── middleware/     # Express middleware
│   ├── models/         # MongoDB schemas
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   │   ├── camera/     # VAPIX service
│   │   ├── event/      # Event logging
│   │   ├── recording/  # Recording manager
│   │   ├── retention/  # Retention manager
│   │   └── stream/     # HLS stream manager
│   ├── utils/          # Utilities
│   └── server.js       # Entry point
├── .env                # Environment variables
├── .env.example        # Example environment file
├── package.json        # Dependencies
└── README.md           # This file
```

### Running Tests
```bash
npm test
```

## License

[Your License Here]

## Support

For issues and questions, please open an issue on GitHub.
