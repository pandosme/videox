#!/bin/bash

# =============================================================================
# VideoX Setup Script
# Interactive configuration for npm or Docker deployment
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

ask_question() {
    local question=$1
    local default=$2
    local result

    if [ -n "$default" ]; then
        read -p "$(echo -e ${BOLD}$question [${default}]: ${NC})" result
        echo "${result:-$default}"
    else
        read -p "$(echo -e ${BOLD}$question: ${NC})" result
        echo "$result"
    fi
}

ask_yes_no() {
    local question=$1
    local default=$2
    local result

    read -p "$(echo -e ${BOLD}$question [${default}]: ${NC})" result
    result="${result:-$default}"

    if [[ "$result" =~ ^[Yy]$ ]]; then
        echo "yes"
    else
        echo "no"
    fi
}

generate_random_key() {
    local length=$1
    openssl rand -base64 48 | tr -d '\n' | cut -c1-$length
}

# Welcome
clear
echo -e "${BOLD}${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           VideoX Server Configuration Setup             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
print_header "Checking Prerequisites"

# Check if docker is available
if command -v docker &> /dev/null; then
    print_success "Docker is installed"
    DOCKER_AVAILABLE=true
else
    print_warning "Docker is not installed"
    DOCKER_AVAILABLE=false
fi

# Check if npm is available
if command -v npm &> /dev/null; then
    print_success "npm is installed"
    NPM_AVAILABLE=true
else
    print_warning "npm is not installed"
    NPM_AVAILABLE=false
fi

# Check if node is available
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed ($NODE_VERSION)"
    NODE_AVAILABLE=true
else
    print_warning "Node.js is not installed"
    NODE_AVAILABLE=false
fi

# Deployment method selection
print_header "Deployment Method"

if [ "$DOCKER_AVAILABLE" = false ] && [ "$NPM_AVAILABLE" = false ]; then
    print_error "Neither Docker nor npm is available. Please install one of them first."
    exit 1
fi

echo "How do you want to run VideoX?"
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "  1) Docker (recommended for production)"
fi
if [ "$NPM_AVAILABLE" = true ] && [ "$NODE_AVAILABLE" = true ]; then
    echo "  2) npm/Node.js (for development)"
fi

DEPLOYMENT_METHOD=""
while [ -z "$DEPLOYMENT_METHOD" ]; do
    read -p "$(echo -e ${BOLD}Enter choice: ${NC})" choice

    case $choice in
        1)
            if [ "$DOCKER_AVAILABLE" = true ]; then
                DEPLOYMENT_METHOD="docker"
            else
                print_error "Docker is not available"
            fi
            ;;
        2)
            if [ "$NPM_AVAILABLE" = true ] && [ "$NODE_AVAILABLE" = true ]; then
                DEPLOYMENT_METHOD="npm"
            else
                print_error "npm/Node.js is not available"
            fi
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
done

print_success "Deployment method: $DEPLOYMENT_METHOD"

# MongoDB configuration
print_header "MongoDB Configuration"

MONGODB_URI=""
USE_EMBEDDED_MONGODB=false

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    MONGODB_CHOICE=$(ask_yes_no "Use embedded MongoDB in Docker? (recommended)" "y")

    if [ "$MONGODB_CHOICE" = "yes" ]; then
        USE_EMBEDDED_MONGODB=true
        MONGODB_URI="mongodb://mongodb:27017/videox"
        print_success "Will use embedded MongoDB (no authentication needed)"
    else
        echo ""
        echo "Please provide MongoDB connection details:"
        MONGO_HOST=$(ask_question "MongoDB host" "localhost")
        MONGO_PORT=$(ask_question "MongoDB port" "27017")
        MONGO_DB=$(ask_question "MongoDB database name" "videox")

        MONGO_AUTH=$(ask_yes_no "Does MongoDB require authentication?" "n")

        if [ "$MONGO_AUTH" = "yes" ]; then
            MONGO_USER=$(ask_question "MongoDB username" "")
            MONGO_PASS=$(ask_question "MongoDB password" "")
            MONGO_AUTH_SOURCE=$(ask_question "MongoDB authSource" "admin")

            if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASS" ]; then
                MONGODB_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_SOURCE}"
            else
                print_warning "Username or password empty. Using no authentication."
                MONGODB_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
            fi
        else
            MONGODB_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
        fi
    fi
else
    # npm deployment always uses external MongoDB
    echo "Please provide MongoDB connection details:"
    MONGO_HOST=$(ask_question "MongoDB host" "localhost")
    MONGO_PORT=$(ask_question "MongoDB port" "27017")
    MONGO_DB=$(ask_question "MongoDB database name" "videox")

    MONGO_AUTH=$(ask_yes_no "Does MongoDB require authentication?" "n")

    if [ "$MONGO_AUTH" = "yes" ]; then
        MONGO_USER=$(ask_question "MongoDB username" "")
        MONGO_PASS=$(ask_question "MongoDB password" "")
        MONGO_AUTH_SOURCE=$(ask_question "MongoDB authSource" "admin")

        if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASS" ]; then
            MONGODB_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_SOURCE}"
        else
            print_warning "Username or password empty. Using no authentication."
            MONGODB_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
        fi
    else
        MONGODB_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
    fi
fi

print_success "MongoDB URI: $MONGODB_URI"

# Admin credentials
print_header "Admin Account"

ADMIN_USERNAME=$(ask_question "Admin username" "admin")

ADMIN_PASSWORD=""
while [ -z "$ADMIN_PASSWORD" ] || [ ${#ADMIN_PASSWORD} -lt 6 ]; do
    ADMIN_PASSWORD=$(ask_question "Admin password (min 6 characters)" "")
    if [ -z "$ADMIN_PASSWORD" ] || [ ${#ADMIN_PASSWORD} -lt 6 ]; then
        print_error "Password must be at least 6 characters"
    fi
done

print_success "Admin username: $ADMIN_USERNAME"
print_success "Admin password: ********"

# Storage configuration
print_header "Storage Configuration"

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    STORAGE_PATH=$(ask_question "Storage path on host (for recordings)" "./videox-storage")
    CONTAINER_STORAGE_PATH="/var/lib/videox-storage"
else
    STORAGE_PATH=$(ask_question "Storage path" "/var/lib/videox-storage")
    # Expand ~ to home directory
    STORAGE_PATH="${STORAGE_PATH/#\~/$HOME}"
fi

RETENTION_DAYS=$(ask_question "Recording retention (days)" "30")

print_success "Storage path: $STORAGE_PATH"
print_success "Retention: $RETENTION_DAYS days"

# Server configuration
print_header "Server Configuration"

API_PORT=$(ask_question "API server port" "3002")

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    NODE_ENV="production"
    print_success "Environment: production (Docker default)"
else
    NODE_ENV=$(ask_question "Environment (development/production)" "production")
fi

print_success "API port: $API_PORT"
print_success "Environment: $NODE_ENV"

# CORS configuration
print_header "CORS Configuration"

echo "Enter allowed client origins (comma-separated)"
echo "Examples: http://localhost:5173, https://videox.example.com"
CORS_ORIGIN=$(ask_question "CORS origins (* for all)" "http://localhost:5173")

print_success "CORS origins: $CORS_ORIGIN"

# Security configuration
print_header "Security Configuration"

echo "Generating secure random keys..."
JWT_SECRET=$(generate_random_key 48)
ENCRYPTION_KEY=$(generate_random_key 32)

print_success "JWT secret generated (48 characters)"
print_success "Encryption key generated (32 characters)"

# Logging configuration
print_header "Logging Configuration"

LOG_LEVEL=$(ask_question "Log level (debug/info/warn/error)" "info")

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    LOG_PATH="${CONTAINER_STORAGE_PATH}/logs"
else
    LOG_PATH=$(ask_question "Log directory" "/var/log/videox")
    LOG_PATH="${LOG_PATH/#\~/$HOME}"
fi

print_success "Log level: $LOG_LEVEL"
print_success "Log path: $LOG_PATH"

# Generate .env file
print_header "Generating Configuration"

ENV_FILE=".env"

# Check if .env exists
if [ -f "$ENV_FILE" ]; then
    BACKUP_FILE=".env.backup.$(date +%s)"
    cp "$ENV_FILE" "$BACKUP_FILE"
    print_warning ".env file exists - backed up to $BACKUP_FILE"
fi

# Write .env file
cat > "$ENV_FILE" << EOF
# =============================================================================
# VideoX VMS Configuration
# Generated: $(date -Iseconds)
# Deployment: $DEPLOYMENT_METHOD
# =============================================================================

# -----------------------------------------------------------------------------
# Admin Credentials
# -----------------------------------------------------------------------------
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# -----------------------------------------------------------------------------
# Database Configuration
# -----------------------------------------------------------------------------
MONGODB_URI=$MONGODB_URI

# -----------------------------------------------------------------------------
# Storage Configuration
# -----------------------------------------------------------------------------
EOF

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    echo "STORAGE_PATH=$CONTAINER_STORAGE_PATH" >> "$ENV_FILE"
else
    echo "STORAGE_PATH=$STORAGE_PATH" >> "$ENV_FILE"
fi

cat >> "$ENV_FILE" << EOF
GLOBAL_RETENTION_DAYS=$RETENTION_DAYS
CLEANUP_SCHEDULE=0 */6 * * *

# -----------------------------------------------------------------------------
# Server Configuration
# -----------------------------------------------------------------------------
API_PORT=$API_PORT
NODE_ENV=$NODE_ENV

# -----------------------------------------------------------------------------
# CORS Configuration
# -----------------------------------------------------------------------------
CORS_ORIGIN=$CORS_ORIGIN

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# -----------------------------------------------------------------------------
# Performance Limits
# -----------------------------------------------------------------------------
MAX_CONCURRENT_STREAMS=20
MAX_CONCURRENT_EXPORTS=3

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
LOG_LEVEL=$LOG_LEVEL
LOG_PATH=$LOG_PATH
EOF

print_success "Configuration saved to $ENV_FILE"

# Generate/modify docker-compose.yml for Docker deployment
if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    print_header "Docker Configuration"

    COMPOSE_FILE="docker-compose.yml"

    if [ "$USE_EMBEDDED_MONGODB" = true ]; then
        # Generate docker-compose.yml with embedded MongoDB
        cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  # MongoDB Database (embedded)
  mongodb:
    image: mongo:7
    container_name: videox-mongodb
    restart: unless-stopped
    volumes:
      - mongodb-data:/data/db
      - mongodb-config:/data/configdb
    networks:
      - videox-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  # VideoX VMS Application
  videox:
    image: pandosme/videox:latest
    container_name: videox
    restart: unless-stopped
    depends_on:
      mongodb:
        condition: service_healthy
    ports:
      - "${API_PORT}:${API_PORT}"
    networks:
      - videox-network
    env_file:
      - .env
    volumes:
EOF
        echo "      - ${STORAGE_PATH}:/var/lib/videox-storage" >> "$COMPOSE_FILE"
        cat >> "$COMPOSE_FILE" << 'EOF'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${API_PORT}/api/system/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  videox-network:
    driver: bridge

volumes:
  mongodb-data:
    driver: local
  mongodb-config:
    driver: local
EOF
        print_success "Generated docker-compose.yml with embedded MongoDB"
    else
        # Generate docker-compose.yml without MongoDB
        cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  # VideoX VMS Application
  videox:
    image: pandosme/videox:latest
    container_name: videox
    restart: unless-stopped
    ports:
      - "${API_PORT}:${API_PORT}"
    env_file:
      - .env
    volumes:
EOF
        echo "      - ${STORAGE_PATH}:/var/lib/videox-storage" >> "$COMPOSE_FILE"
        cat >> "$COMPOSE_FILE" << 'EOF'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${API_PORT}/api/system/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
        print_success "Generated docker-compose.yml with external MongoDB"
    fi
fi

# Post-setup tasks
print_header "Post-Setup Tasks"

if [ "$DEPLOYMENT_METHOD" = "npm" ]; then
    # Create storage directory for npm deployment
    if [ ! -d "$STORAGE_PATH" ]; then
        CREATE_STORAGE=$(ask_yes_no "Create storage directory?" "y")
        if [ "$CREATE_STORAGE" = "yes" ]; then
            mkdir -p "$STORAGE_PATH" 2>/dev/null && print_success "Created $STORAGE_PATH" || print_warning "Could not create $STORAGE_PATH - may need sudo"
        fi
    else
        print_success "Storage directory exists: $STORAGE_PATH"
    fi

    # Create log directory for npm deployment
    if [ ! -d "$LOG_PATH" ]; then
        mkdir -p "$LOG_PATH" 2>/dev/null && print_success "Created $LOG_PATH" || print_warning "Could not create $LOG_PATH - may need sudo"
    else
        print_success "Log directory exists: $LOG_PATH"
    fi
fi

# Final summary
echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║              Setup Complete Successfully!               ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}Next Steps:${NC}"
echo ""

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    echo "  To start VideoX with Docker:"
    echo -e "  ${BLUE}docker-compose up -d${NC}"
    echo ""
    echo "  To view logs:"
    echo -e "  ${BLUE}docker-compose logs -f videox${NC}"
    echo ""
    echo "  To stop:"
    echo -e "  ${BLUE}docker-compose down${NC}"
    echo ""
    if [ "$USE_EMBEDDED_MONGODB" = false ]; then
        print_warning "Make sure MongoDB is running and accessible at: $MONGODB_URI"
    fi
else
    echo "  1. Install dependencies:"
    echo -e "     ${BLUE}npm install${NC}"
    echo ""
    echo "  2. Start the server:"
    echo -e "     ${BLUE}npm start${NC}"
    echo ""
    print_warning "Make sure MongoDB is running and accessible at: $MONGODB_URI"
fi

echo ""
echo -e "${BOLD}Access Information:${NC}"
echo "  Server URL: http://localhost:$API_PORT"
echo "  Admin username: $ADMIN_USERNAME"
echo "  Admin password: ********"
echo ""
echo "  Health check: http://localhost:$API_PORT/api/system/health"
echo ""

if [ "$DEPLOYMENT_METHOD" = "docker" ]; then
    echo -e "${BOLD}Management UI:${NC}"
    echo "  Install videox-client to manage cameras and view recordings:"
    echo "  https://github.com/pandosme/videox-client"
    echo ""
fi

echo -e "${GREEN}Setup completed!${NC}"
