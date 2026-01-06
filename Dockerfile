# =============================================================================
# VideoX VMS - Docker Image
# Multi-stage build for optimized production image
# =============================================================================

# Stage 1: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY package*.json ./

# Install backend dependencies
RUN npm ci

# Copy backend source code
COPY src ./src

# Stage 2: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend files
COPY frontend ./frontend

WORKDIR /app/frontend

# Install frontend dependencies and build
RUN npm ci && npm run build

# Stage 3: Production stage
FROM node:20-alpine

# Install FFmpeg and other runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    bash \
    curl \
    tzdata

# Create non-root user for security
RUN addgroup -g 1001 videox && \
    adduser -D -u 1001 -G videox videox

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application files from builders
COPY --from=backend-builder /app/src ./src
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create directories for storage and logs with proper permissions
# Make app files readable by all users (allows running as any UID via docker-compose user directive)
RUN mkdir -p /var/lib/videox-storage/recordings \
             /var/lib/videox-storage/hls \
             /var/lib/videox-storage/logs && \
    chmod -R 755 /app && \
    chmod -R 777 /var/lib/videox-storage

# Note: USER directive removed - user can be specified in docker-compose.yml
# This allows running as host user (UID 1000) for shared storage access

# Expose API port
EXPOSE 3302

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3302/api/system/health || exit 1

# Default environment variables (can be overridden by docker-compose or -e flag)
ENV NODE_ENV=production \
    API_PORT=3302 \
    STORAGE_PATH=/var/lib/videox-storage \
    LOG_PATH=/var/lib/videox-storage/logs \
    LOG_LEVEL=info

# Start the application
CMD ["node", "src/server.js"]
