#!/usr/bin/env node

/**
 * VideoX Setup Script
 * Interactive configuration generator for .env file
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function print(message, color = colors.reset) {
  console.log(color + message + colors.reset);
}

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function generateRandomKey(length = 32) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

function validatePort(port) {
  const num = parseInt(port);
  return !isNaN(num) && num > 0 && num <= 65535;
}

function validateRetentionDays(days) {
  const num = parseInt(days);
  return !isNaN(num) && num >= 1 && num <= 365;
}

async function setup() {
  print('\n╔═══════════════════════════════════════════════════════════╗', colors.bright);
  print('║           VideoX Server Configuration Setup             ║', colors.bright);
  print('╚═══════════════════════════════════════════════════════════╝\n', colors.bright);

  const config = {};

  // ===== MongoDB Configuration =====
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  MongoDB Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const mongoHost = await question('MongoDB host [localhost]: ') || 'localhost';

  let mongoPort = await question('MongoDB port [27017]: ') || '27017';
  while (!validatePort(mongoPort)) {
    print('  Invalid port. Please enter a valid port (1-65535).', colors.red);
    mongoPort = await question('MongoDB port [27017]: ') || '27017';
  }

  const mongoDb = await question('MongoDB database name [videox]: ') || 'videox';

  const useAuth = (await question('Does MongoDB require authentication? (y/n) [n]: ') || 'n').toLowerCase();

  if (useAuth === 'y' || useAuth === 'yes') {
    const mongoUser = await question('MongoDB username: ');
    const mongoPassword = await question('MongoDB password: ');
    const authSource = await question('MongoDB authSource [admin]: ') || 'admin';

    if (mongoUser && mongoPassword) {
      config.MONGODB_URI = `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}/${mongoDb}?authSource=${authSource}`;
    } else {
      print('  Warning: Username or password empty. Using no authentication.', colors.yellow);
      config.MONGODB_URI = `mongodb://${mongoHost}:${mongoPort}/${mongoDb}`;
    }
  } else {
    config.MONGODB_URI = `mongodb://${mongoHost}:${mongoPort}/${mongoDb}`;
  }

  print(`  ✓ MongoDB URI: ${config.MONGODB_URI}`, colors.green);

  // ===== Admin Credentials =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Admin Account', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  let adminUsername = await question('Admin username [admin]: ') || 'admin';
  config.ADMIN_USERNAME = adminUsername;

  let adminPassword = '';
  while (!adminPassword || adminPassword.length < 6) {
    adminPassword = await question('Admin password (min 6 characters): ');
    if (!adminPassword || adminPassword.length < 6) {
      print('  Password must be at least 6 characters.', colors.red);
    }
  }
  config.ADMIN_PASSWORD = adminPassword;

  print(`  ✓ Admin username: ${config.ADMIN_USERNAME}`, colors.green);
  print('  ✓ Admin password: ********', colors.green);

  // ===== Storage Configuration =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Storage Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  let storagePath = await question('Storage path [/var/lib/videox-storage]: ') || '/var/lib/videox-storage';

  // Expand ~ to home directory
  if (storagePath.startsWith('~')) {
    storagePath = storagePath.replace('~', process.env.HOME);
  }

  config.STORAGE_PATH = storagePath;
  print(`  ✓ Storage path: ${config.STORAGE_PATH}`, colors.green);

  let retentionDays = await question('Recording retention days [30]: ') || '30';
  while (!validateRetentionDays(retentionDays)) {
    print('  Invalid retention period. Please enter a number between 1 and 365.', colors.red);
    retentionDays = await question('Recording retention days [30]: ') || '30';
  }
  config.GLOBAL_RETENTION_DAYS = retentionDays;
  print(`  ✓ Retention: ${config.GLOBAL_RETENTION_DAYS} days`, colors.green);

  config.CLEANUP_SCHEDULE = '0 */6 * * *'; // Every 6 hours

  // ===== Server Configuration =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Server Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  let apiPort = await question('API server port [3002]: ') || '3002';
  while (!validatePort(apiPort)) {
    print('  Invalid port. Please enter a valid port (1-65535).', colors.red);
    apiPort = await question('API server port [3002]: ') || '3002';
  }
  config.API_PORT = apiPort;
  print(`  ✓ API port: ${config.API_PORT}`, colors.green);

  const nodeEnv = (await question('Environment (development/production) [production]: ') || 'production').toLowerCase();
  config.NODE_ENV = nodeEnv === 'development' ? 'development' : 'production';
  print(`  ✓ Environment: ${config.NODE_ENV}`, colors.green);

  // ===== CORS Configuration =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  CORS Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Enter allowed client origins (comma-separated)', colors.blue);
  print('  Examples: http://localhost:5173, https://videox.example.com', colors.blue);

  const corsOrigin = await question('CORS origins (* for all) [http://localhost:5173]: ') || 'http://localhost:5173';
  config.CORS_ORIGIN = corsOrigin;
  print(`  ✓ CORS origins: ${config.CORS_ORIGIN}`, colors.green);

  // ===== Security Configuration =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Security Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Generating secure random keys...', colors.blue);

  config.JWT_SECRET = generateRandomKey(48);
  config.ENCRYPTION_KEY = generateRandomKey(32);

  print('  ✓ JWT secret generated (48 characters)', colors.green);
  print('  ✓ Encryption key generated (32 characters)', colors.green);

  // ===== Performance Limits =====
  config.MAX_CONCURRENT_STREAMS = '20';
  config.MAX_CONCURRENT_EXPORTS = '3';

  // ===== Logging Configuration =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Logging Configuration', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const logLevel = (await question('Log level (debug/info/warn/error) [info]: ') || 'info').toLowerCase();
  config.LOG_LEVEL = ['debug', 'info', 'warn', 'error'].includes(logLevel) ? logLevel : 'info';

  let logPath = await question('Log directory [/var/log/videox]: ') || '/var/log/videox';
  if (logPath.startsWith('~')) {
    logPath = logPath.replace('~', process.env.HOME);
  }
  config.LOG_PATH = logPath;

  print(`  ✓ Log level: ${config.LOG_LEVEL}`, colors.green);
  print(`  ✓ Log path: ${config.LOG_PATH}`, colors.green);

  // ===== Generate .env file =====
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Generating Configuration File', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const envContent = `# =============================================================================
# VideoX VMS Configuration
# Generated: ${new Date().toISOString()}
# =============================================================================

# -----------------------------------------------------------------------------
# Admin Credentials (Single User System)
# -----------------------------------------------------------------------------
ADMIN_USERNAME=${config.ADMIN_USERNAME}
ADMIN_PASSWORD=${config.ADMIN_PASSWORD}

# -----------------------------------------------------------------------------
# Database Configuration
# -----------------------------------------------------------------------------
# MongoDB is used to store camera configurations and recording metadata
MONGODB_URI=${config.MONGODB_URI}

# -----------------------------------------------------------------------------
# Storage Configuration
# -----------------------------------------------------------------------------
# Base path where recordings and HLS streams are stored
STORAGE_PATH=${config.STORAGE_PATH}

# Global retention period in days (can be overridden per camera)
GLOBAL_RETENTION_DAYS=${config.GLOBAL_RETENTION_DAYS}

# Cron schedule for automatic cleanup of expired recordings
# Format: minute hour day month weekday
# Default: Every 6 hours
CLEANUP_SCHEDULE=${config.CLEANUP_SCHEDULE}

# -----------------------------------------------------------------------------
# Server Configuration
# -----------------------------------------------------------------------------
API_PORT=${config.API_PORT}
NODE_ENV=${config.NODE_ENV}

# -----------------------------------------------------------------------------
# CORS Configuration
# -----------------------------------------------------------------------------
# Allow requests from the VideoX client (use comma-separated list for multiple origins)
CORS_ORIGIN=${config.CORS_ORIGIN}

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------
# JWT secret for session tokens (min 32 characters)
JWT_SECRET=${config.JWT_SECRET}

# AES-256 encryption key for camera credentials (exactly 32 characters)
ENCRYPTION_KEY=${config.ENCRYPTION_KEY}

# -----------------------------------------------------------------------------
# Performance Limits
# -----------------------------------------------------------------------------
# Maximum number of concurrent HLS streams
MAX_CONCURRENT_STREAMS=${config.MAX_CONCURRENT_STREAMS}

# Maximum number of concurrent export operations
MAX_CONCURRENT_EXPORTS=${config.MAX_CONCURRENT_EXPORTS}

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
LOG_LEVEL=${config.LOG_LEVEL}
LOG_PATH=${config.LOG_PATH}
`;

  const envPath = path.join(__dirname, '.env');

  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    print('\n  ⚠ Warning: .env file already exists!', colors.yellow);
    const overwrite = (await question('  Overwrite existing .env file? (y/n) [n]: ') || 'n').toLowerCase();

    if (overwrite !== 'y' && overwrite !== 'yes') {
      print('\n  Setup cancelled. Existing .env file was not modified.', colors.yellow);
      rl.close();
      return;
    }

    // Backup existing .env
    const backupPath = path.join(__dirname, `.env.backup.${Date.now()}`);
    fs.copyFileSync(envPath, backupPath);
    print(`  ✓ Backup created: ${path.basename(backupPath)}`, colors.green);
  }

  // Write .env file
  fs.writeFileSync(envPath, envContent, 'utf8');
  print(`\n  ✓ Configuration saved to: ${envPath}`, colors.green);

  // Create storage directory if it doesn't exist
  print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  print('  Post-Setup Tasks', colors.bright + colors.blue);
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const createStorage = (await question('\n  Create storage directory? (y/n) [y]: ') || 'y').toLowerCase();

  if (createStorage === 'y' || createStorage === 'yes') {
    try {
      if (!fs.existsSync(config.STORAGE_PATH)) {
        fs.mkdirSync(config.STORAGE_PATH, { recursive: true });
        print(`  ✓ Created storage directory: ${config.STORAGE_PATH}`, colors.green);
      } else {
        print(`  ✓ Storage directory already exists: ${config.STORAGE_PATH}`, colors.green);
      }
    } catch (error) {
      print(`  ✗ Failed to create storage directory: ${error.message}`, colors.red);
      print(`    You may need to create it manually with appropriate permissions.`, colors.yellow);
    }
  }

  // Create log directory
  try {
    if (!fs.existsSync(config.LOG_PATH)) {
      fs.mkdirSync(config.LOG_PATH, { recursive: true });
      print(`  ✓ Created log directory: ${config.LOG_PATH}`, colors.green);
    } else {
      print(`  ✓ Log directory already exists: ${config.LOG_PATH}`, colors.green);
    }
  } catch (error) {
    print(`  ✗ Failed to create log directory: ${error.message}`, colors.red);
    print(`    You may need to create it manually with appropriate permissions.`, colors.yellow);
  }

  // Summary
  print('\n╔═══════════════════════════════════════════════════════════╗', colors.green);
  print('║              Setup Complete Successfully!               ║', colors.bright + colors.green);
  print('╚═══════════════════════════════════════════════════════════╝', colors.green);

  print('\n  Next Steps:', colors.bright);
  print('  1. Review the generated .env file');
  print('  2. Ensure MongoDB is running and accessible');
  print('  3. Install dependencies: npm install');
  print('  4. Start the server: npm start');
  print('');
  print(`  Server will be available at: http://localhost:${config.API_PORT}`, colors.blue);
  print(`  Admin username: ${config.ADMIN_USERNAME}`, colors.blue);
  print('');

  rl.close();
}

// Run setup
setup().catch(error => {
  print('\n✗ Setup failed: ' + error.message, colors.red);
  console.error(error);
  rl.close();
  process.exit(1);
});
