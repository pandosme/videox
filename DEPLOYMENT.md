# VideoX VMS - Deployment Guide

Simple 3-step deployment guide for VideoX VMS using Docker.

## Quick Start

### Step 1: Download docker-compose.yml

```bash
mkdir videox && cd videox
wget https://raw.githubusercontent.com/pandosme/videox/main/docker-compose.yml
```

Or manually create `docker-compose.yml` and paste the content from the repository.

### Step 2: Edit Configuration

Open `docker-compose.yml` and change these required values:

```yaml
environment:
  # Change admin credentials
  ADMIN_USERNAME: admin
  ADMIN_PASSWORD: your_secure_password

  # Generate and set security keys (see below)
  JWT_SECRET: your_48_character_jwt_secret
  ENCRYPTION_KEY: your_32_character_encryption_key

  # Optional: Change storage location
volumes:
  - /your/storage/path:/var/lib/videox-storage  # Change left side only
```

**Generate Security Keys:**

```bash
# Generate JWT Secret (48+ characters)
node -e "console.log(require('crypto').randomBytes(48).toString('base64').slice(0,48))"

# Generate Encryption Key (exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"
```

### Step 3: Start VideoX

```bash
docker-compose up -d
```

That's it! VideoX is now running at `http://your-server:3002`

## What Gets Deployed

- **VideoX VMS** - Pulled from Docker Hub (`pandosme/videox:latest`)
- **MongoDB** - Internal database (not exposed to network)
- **Persistent Storage** - For recordings, HLS streams, and logs

## Storage Configuration

### Default (Development)
```yaml
volumes:
  - ./videox-storage:/var/lib/videox-storage
```
Creates `videox-storage` folder in the current directory.

### Production (Recommended)
```yaml
volumes:
  - /mnt/storage/videox:/var/lib/videox-storage
```

Create and prepare storage:
```bash
sudo mkdir -p /mnt/storage/videox
sudo chown -R $(id -u):$(id -g) /mnt/storage/videox
```

## Management

### View Logs
```bash
# All services
docker-compose logs -f

# VideoX only
docker-compose logs -f videox

# MongoDB only
docker-compose logs -f mongodb
```

### Check Status
```bash
docker-compose ps
curl http://localhost:3002/api/system/health
```

### Update to Latest Version
```bash
docker-compose pull
docker-compose up -d
```

### Restart Services
```bash
docker-compose restart
```

### Stop Services
```bash
docker-compose down
```

### Stop and Remove All Data
```bash
# WARNING: This deletes MongoDB data!
docker-compose down -v
```

## Configuration Options

All configuration is in `docker-compose.yml`. Edit the `environment` section:

### Admin Credentials
```yaml
ADMIN_USERNAME: admin
ADMIN_PASSWORD: your_password
```

### Recording Retention
```yaml
GLOBAL_RETENTION_DAYS: 30  # Keep recordings for 30 days
CLEANUP_SCHEDULE: "0 */6 * * *"  # Run cleanup every 6 hours
```

### Performance Tuning
```yaml
MAX_CONCURRENT_STREAMS: 20  # Max simultaneous HLS streams
MAX_CONCURRENT_EXPORTS: 3   # Max simultaneous exports
```

### CORS (Cross-Origin Access)
```yaml
CORS_ORIGIN: "*"  # Allow all origins
# Or restrict to specific domain:
# CORS_ORIGIN: "https://vms.example.com"
```

### Logging
```yaml
LOG_LEVEL: info  # Options: debug, info, warn, error
```

## Backup

### Backup MongoDB
```bash
docker exec videox-mongodb mongodump --out /dump
docker cp videox-mongodb:/dump ./mongodb-backup-$(date +%Y%m%d)
```

### Backup Recordings
```bash
# Adjust path to match your storage volume
tar czf recordings-backup-$(date +%Y%m%d).tar.gz /mnt/storage/videox/recordings
```

### Automated Backup Script
```bash
#!/bin/bash
BACKUP_DIR="/backups/videox"
DATE=$(date +%Y%m%d)

mkdir -p "$BACKUP_DIR"

# Backup MongoDB
docker exec videox-mongodb mongodump --out /dump
docker cp videox-mongodb:/dump "$BACKUP_DIR/mongodb-$DATE"

# Backup recent recordings (last 7 days)
find /mnt/storage/videox/recordings -mtime -7 -type f | \
  tar czf "$BACKUP_DIR/recordings-$DATE.tar.gz" -T -

# Keep only last 7 backups
find "$BACKUP_DIR" -mtime +7 -delete
```

## Restore

### Restore MongoDB
```bash
docker cp ./mongodb-backup-YYYYMMDD videox-mongodb:/restore
docker exec videox-mongodb mongorestore /restore
```

### Restore Recordings
```bash
tar xzf recordings-backup-YYYYMMDD.tar.gz -C /mnt/storage/videox/
```

## Firewall

Allow access to the VideoX API:

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 3002/tcp

# firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

## Troubleshooting

### Check Container Status
```bash
docker-compose ps
```

### View Full Logs
```bash
docker-compose logs --tail=100 videox
```

### MongoDB Connection Issues
```bash
# Check MongoDB health
docker exec videox-mongodb mongosh --eval "db.adminCommand('ping')"
```

### Permission Denied Errors
```bash
# Fix storage permissions
sudo chown -R $(id -u):$(id -g) /your/storage/path
```

### Container Won't Start
```bash
# View detailed logs
docker-compose logs videox

# Check disk space
df -h

# Verify configuration
docker-compose config
```

## Advanced Configuration

### Change API Port
```yaml
ports:
  - "8080:3002"  # Access on port 8080 instead of 3002
```

### Use Different MongoDB Version
```yaml
mongodb:
  image: mongo:6  # Or mongo:5, mongo:7
```

### Limit MongoDB Memory
```yaml
mongodb:
  image: mongo:7
  command: --wiredTigerCacheSizeGB 1  # Limit to 1GB RAM
```

## Production Checklist

Before deploying to production:

- [ ] Change ADMIN_PASSWORD
- [ ] Generate and set JWT_SECRET
- [ ] Generate and set ENCRYPTION_KEY
- [ ] Configure storage path to dedicated volume
- [ ] Set appropriate CORS_ORIGIN (not *)
- [ ] Configure firewall rules
- [ ] Setup backup strategy
- [ ] Test recording and playback
- [ ] Test export functionality
- [ ] Monitor disk space

## System Requirements

- **Minimum**: 2 CPU cores, 4GB RAM, 50GB storage
- **Recommended**: 4 CPU cores, 8GB RAM, 500GB+ storage
- **Docker**: Version 20.10 or newer
- **Docker Compose**: Version 2.0 or newer

## Support

- **Issues**: https://github.com/pandosme/videox/issues
- **Documentation**: https://github.com/pandosme/videox
- **Docker Hub**: https://hub.docker.com/r/pandosme/videox
