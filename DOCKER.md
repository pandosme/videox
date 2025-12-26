# VideoX VMS - Docker Deployment Guide

This guide explains how to build and run VideoX VMS using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+ installed
- Docker Compose v2.0+ installed
- MongoDB server running (on host or separate container)
- Sufficient disk space for recordings storage

## Quick Start

### 1. Configure Environment Variables

Copy the example environment file and update with your configuration:

```bash
cp .env.docker .env
```

Edit `.env` and configure:
- **MONGODB_URI**: Your MongoDB connection string
- **ADMIN_USERNAME**: Admin username
- **ADMIN_PASSWORD**: Secure password (min 6 characters)
- **JWT_SECRET**: Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('base64').slice(0,48))"`
- **ENCRYPTION_KEY**: Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"`

### 2. Build and Run

```bash
# Build the Docker image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f videox
```

The API will be available at `http://localhost:3002`

## MongoDB Connection

VideoX requires an external MongoDB instance. Configure the connection in your `.env` file:

### MongoDB on Host Machine

**Linux/Mac:**
```bash
MONGODB_URI=mongodb://admin:password@host.docker.internal:27017/videox?authSource=admin
```

**Windows:**
```bash
MONGODB_URI=mongodb://admin:password@host.docker.internal:27017/videox?authSource=admin
```

**Alternative (using host IP):**
```bash
# Find your host IP
ip addr show docker0  # Linux
ipconfig getifaddr en0  # Mac

# Use the IP in connection string
MONGODB_URI=mongodb://admin:password@172.17.0.1:27017/videox?authSource=admin
```

### MongoDB in Separate Container

If you're running MongoDB in another Docker container on the same network:

```bash
MONGODB_URI=mongodb://admin:password@mongodb:27017/videox?authSource=admin
```

Make sure both containers are on the same Docker network.

### Using Host Network Mode

Edit `docker-compose.yml` and uncomment the `network_mode: host` line:

```yaml
services:
  videox:
    # network_mode: host  # <-- Uncomment this
```

Then use localhost in MongoDB URI:
```bash
MONGODB_URI=mongodb://admin:password@localhost:27017/videox?authSource=admin
```

## Storage and Volumes

Recordings and HLS streams are stored in a Docker volume named `videox-storage`.

### Inspect Volume

```bash
# List volumes
docker volume ls

# Inspect volume details
docker volume inspect videox_videox-storage

# View volume contents
docker run --rm -v videox_videox-storage:/data alpine ls -lah /data
```

### Backup Storage

```bash
# Create backup
docker run --rm -v videox_videox-storage:/source -v $(pwd):/backup \
  alpine tar -czf /backup/videox-backup-$(date +%Y%m%d).tar.gz -C /source .

# Restore backup
docker run --rm -v videox_videox-storage:/target -v $(pwd):/backup \
  alpine sh -c "cd /target && tar -xzf /backup/videox-backup-YYYYMMDD.tar.gz"
```

### Use Host Directory (Development)

Edit `docker-compose.yml` and uncomment the host volume mount:

```yaml
volumes:
  # Uncomment for development to use local directory
  - ./storage:/var/lib/videox-storage
```

## Building for Docker Hub

### Build Multi-Platform Image

```bash
# Create buildx builder (first time only)
docker buildx create --name videox-builder --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t yourusername/videox:latest \
  -t yourusername/videox:1.0.0 \
  --push \
  .
```

### Build Single Platform

```bash
# Build for current platform
docker build -t yourusername/videox:latest .

# Tag with version
docker tag yourusername/videox:latest yourusername/videox:1.0.0

# Push to Docker Hub
docker login
docker push yourusername/videox:latest
docker push yourusername/videox:1.0.0
```

## Running from Docker Hub

Once published to Docker Hub, users can run:

```bash
# Pull the image
docker pull yourusername/videox:latest

# Run with docker-compose
# (make sure .env is configured)
docker-compose up -d
```

Or run directly:

```bash
docker run -d \
  --name videox \
  -p 3002:3002 \
  -e MONGODB_URI="mongodb://admin:password@host.docker.internal:27017/videox?authSource=admin" \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_PASSWORD="your_password" \
  -e JWT_SECRET="your_jwt_secret_48_chars_min" \
  -e ENCRYPTION_KEY="your_32_char_encryption_key" \
  -v videox-storage:/var/lib/videox-storage \
  yourusername/videox:latest
```

## Docker Commands Reference

```bash
# Build
docker-compose build                    # Build image
docker-compose build --no-cache         # Build without cache

# Start/Stop
docker-compose up -d                    # Start in background
docker-compose down                     # Stop and remove containers
docker-compose restart                  # Restart containers

# Logs
docker-compose logs -f videox           # Follow logs
docker-compose logs --tail=100 videox   # Last 100 lines

# Shell Access
docker-compose exec videox sh           # Interactive shell
docker-compose exec videox ls -lah /var/lib/videox-storage  # List storage

# Health Check
docker-compose ps                       # Container status
curl http://localhost:3002/api/system/health  # API health check

# Cleanup
docker-compose down -v                  # Stop and remove volumes
docker system prune -a                  # Remove unused images
```

## Troubleshooting

### Cannot Connect to MongoDB

**Error:** `Failed to connect to MongoDB`

**Solutions:**
1. Verify MongoDB is running: `docker ps` or `systemctl status mongodb`
2. Test connection from container:
   ```bash
   docker-compose exec videox sh
   wget -qO- host.docker.internal:27017  # Should connect
   ```
3. Check firewall: MongoDB port 27017 must be accessible
4. Use correct hostname: `host.docker.internal` for host, `mongodb` for container

### Permission Denied on Storage

**Error:** `EACCES: permission denied`

**Solution:**
```bash
# Fix volume permissions
docker-compose down
docker volume rm videox_videox-storage
docker-compose up -d
```

### Container Exits Immediately

**Check logs:**
```bash
docker-compose logs videox
```

Common causes:
- Missing required environment variables
- Invalid MongoDB URI
- Port 3002 already in use

### Health Check Failing

```bash
# Check health status
docker inspect videox | grep -A 10 Health

# Manual health check
curl http://localhost:3002/api/system/health
```

## Environment Variables Reference

See `.env.docker` for complete list of available environment variables.

Required variables:
- `MONGODB_URI`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

## Security Recommendations

1. **Never commit `.env` file to version control**
2. **Use strong passwords** for admin account (min 12 characters)
3. **Generate unique secrets** for JWT and encryption keys
4. **Restrict CORS_ORIGIN** in production (don't use `*`)
5. **Run MongoDB with authentication** enabled
6. **Use HTTPS/TLS** in production with reverse proxy (nginx, Traefik)
7. **Regular backups** of recordings and database

## Production Deployment

For production, use a reverse proxy with SSL/TLS:

### Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name videox.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # HLS streaming
    location /hls/ {
        proxy_pass http://localhost:3002/hls/;
        add_header Cache-Control no-cache;
        add_header Access-Control-Allow-Origin *;
    }
}
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/pandosme/videox/issues
- Documentation: https://github.com/pandosme/videox
