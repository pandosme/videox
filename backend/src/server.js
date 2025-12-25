require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');
const databaseManager = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler/errorHandler');

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'INFLUXDB_URL',
  'INFLUXDB_TOKEN',
  'INFLUXDB_ORG',
  'INFLUXDB_BUCKET',
  'STORAGE_PATH',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create Express app
const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*', // Configure for local network only in production
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});
app.use('/api/', limiter);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cameras', require('./routes/cameras'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/events', require('./routes/events'));
app.use('/api/users', require('./routes/users'));
app.use('/api/system', require('./routes/system'));
app.use('/api/live', require('./routes/live'));

// Serve HLS streams
const hlsStreamManager = require('./services/stream/hlsStreamManager');
app.use('/hls', express.static(path.join(process.env.STORAGE_PATH || '/tmp', 'hls')));

// Recording and retention managers
const recordingManager = require('./services/recording/recordingManager');
const retentionManager = require('./services/retention/retentionManager');

// Health check endpoint (public, no auth required)
app.get('/api/system/health', async (req, res) => {
  const dbHealth = databaseManager.getHealthStatus();
  const storageInfo = await getStorageInfo();

  const status = dbHealth.overall === 'healthy' && storageInfo.availableGB > 0
    ? 'healthy'
    : 'degraded';

  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    mongodb: dbHealth.mongodb,
    influxdb: dbHealth.influxdb,
    diskSpace: storageInfo,
    uptime: process.uptime(),
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

/**
 * Get storage information
 */
async function getStorageInfo() {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const stats = await fs.stat(storagePath);

    // Note: This is a simplified version. In production, use a library like 'diskusage'
    return {
      totalGB: 0,
      usedGB: 0,
      availableGB: 100, // Placeholder
      usagePercent: 0,
    };
  } catch (error) {
    logger.error('Failed to get storage info:', error);
    return {
      totalGB: 0,
      usedGB: 0,
      availableGB: 0,
      usagePercent: 0,
    };
  }
}

/**
 * Initialize storage directory
 */
async function initializeStorage() {
  try {
    const storagePath = process.env.STORAGE_PATH;

    // Create storage directory if it doesn't exist
    await fs.mkdir(storagePath, { recursive: true });

    // Check write permissions
    await fs.access(storagePath, fs.constants.W_OK);

    logger.info(`Storage initialized at: ${storagePath}`);

    // Get available disk space
    const storageInfo = await getStorageInfo();
    logger.info(`Available storage: ${storageInfo.availableGB} GB`);
  } catch (error) {
    logger.error('Failed to initialize storage:', error);
    throw error;
  }
}

/**
 * Startup sequence
 */
async function startup() {
  try {
    logger.info('VideoX starting up...');

    // 1. Connect to databases
    logger.info('Connecting to databases...');

    try {
      await databaseManager.connectMongoDB(5, 5000);
    } catch (error) {
      logger.error('Failed to connect to MongoDB');
      process.exit(2);
    }

    try {
      await databaseManager.connectInfluxDB(5, 5000);
    } catch (error) {
      logger.error('Failed to connect to InfluxDB');
      process.exit(3);
    }

    logger.info('Databases connected successfully');

    // 2. Initialize storage
    await initializeStorage();

    // 3. Initialize HLS stream manager
    await hlsStreamManager.initialize();
    logger.info('HLS stream manager initialized');

    // 4. Initialize recording manager
    await recordingManager.initialize();
    logger.info('Recording manager initialized');

    // 5. Initialize retention manager
    await retentionManager.initialize();
    logger.info('Retention manager initialized');

    // 6. Start health monitoring
    databaseManager.startHealthMonitoring();

    // 7. Start API server
    const server = app.listen(PORT, () => {
      logger.info(`VideoX API server listening on port ${PORT}`);
      logger.info('Service status: running');
    });

    // Setup graceful shutdown handlers
    setupShutdownHandlers(server);

    return server;
  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(server) {
  const shutdown = async (signal) => {
    logger.info(`${signal} received, initiating graceful shutdown...`);

    // 1. Stop accepting new requests
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // 2. Stop all HLS streams
    try {
      await hlsStreamManager.stopAllStreams();
    } catch (error) {
      logger.error('Error stopping HLS streams:', error);
    }

    // 3. Stop all recordings
    try {
      await recordingManager.stopAllRecordings();
    } catch (error) {
      logger.error('Error stopping recordings:', error);
    }

    // 4. Stop retention manager
    try {
      retentionManager.stop();
    } catch (error) {
      logger.error('Error stopping retention manager:', error);
    }

    // 5. Close database connections
    try {
      await databaseManager.closeConnections();
    } catch (error) {
      logger.error('Error closing database connections:', error);
    }

    // 6. Exit
    logger.info('VideoX stopped successfully');
    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

// Start the server
if (require.main === module) {
  startup();
}

module.exports = app;
