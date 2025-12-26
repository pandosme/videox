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
  'STORAGE_PATH',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
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

// CORS configuration for API service integration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Allow all origins by default (configurable via env)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  maxAge: 86400, // Cache preflight requests for 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate client IP detection
app.set('trust proxy', true);

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

// API Request Logging Middleware
app.use('/api', (req, res, next) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent') || 'Unknown';

  // Log request
  logger.info(`API Request: ${req.method} ${req.originalUrl} from ${clientIp}`);
  logger.debug(`User-Agent: ${userAgent}`);

  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const authType = req.authType || 'unauthenticated';
    const username = req.user?.username || 'anonymous';

    logger.info(
      `API Response: ${req.method} ${req.originalUrl} - ` +
      `Status: ${res.statusCode} - ` +
      `Duration: ${duration}ms - ` +
      `Auth: ${authType} - ` +
      `User: ${username} - ` +
      `IP: ${clientIp}`
    );
  });

  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cameras', require('./routes/cameras'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/events', require('./routes/events'));
app.use('/api/users', require('./routes/users'));
app.use('/api/system', require('./routes/system'));
app.use('/api/live', require('./routes/live'));
app.use('/api/tokens', require('./routes/apiTokens'));
app.use('/api/export', require('./routes/export'));

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
 * Check for configured storage path in database
 */
async function checkStoragePathConfig() {
  try {
    const SystemConfig = require('./models/SystemConfig');
    const configuredPath = await SystemConfig.getValue('storagePath', null);

    if (configuredPath && configuredPath !== process.env.STORAGE_PATH) {
      logger.info(`Using configured storage path: ${configuredPath}`);
      process.env.STORAGE_PATH = configuredPath;
    }
  } catch (error) {
    logger.warn('Could not check storage path configuration:', error.message);
  }
}

/**
 * Startup sequence
 */
async function startup() {
  try {
    logger.info('VideoX starting up...');

    // 1. Connect to database
    logger.info('Connecting to database...');

    try {
      await databaseManager.connectMongoDB(5, 5000);
    } catch (error) {
      logger.error('Failed to connect to MongoDB');
      process.exit(2);
    }

    logger.info('Database connected successfully');

    // 1.5. Check for configured storage path
    await checkStoragePathConfig();

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
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`VideoX API server listening on 0.0.0.0:${PORT}`);
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
