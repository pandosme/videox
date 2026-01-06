require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
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
  'SESSION_SECRET',
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
const PORT = process.env.API_PORT || 3302;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource access
  crossOriginOpenerPolicy: false, // Disable in development to avoid trustworthiness warnings
  hsts: false, // Disable HSTS in development (prevents forcing HTTPS)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for frontend
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for frontend
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null, // Don't force HTTPS upgrade
    },
  },
})); // Security headers

// CORS configuration - Allow all origins for external integrations
// Use dynamic origin to avoid Opaque Response Blocking (ORB) for media files
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins by reflecting the request origin
    // This is required for session cookies and works around browser ORB blocking
    callback(null, origin || true);
  },
  credentials: true, // Required for session cookies to work cross-origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Cookie'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Set-Cookie'],
  maxAge: 86400, // Cache preflight requests for 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate client IP detection
// 'loopback' trusts only localhost/127.0.0.1 (safe for local dev and Docker host mode)
app.set('trust proxy', 'loopback');

// Session middleware (uses lazy MongoDB connection via mongoUrl)
// MongoStore will connect to MongoDB independently with its own retry logic
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600, // Lazy session update (once per 24 hours)
    mongoOptions: {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    },
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS attacks
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax', // CSRF protection
  },
}));

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

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Catch-all route for frontend (SPA routing)
// Must be after API routes but before 404 handler
app.get('*', (req, res, next) => {
  // Skip if this is an API route
  if (req.path.startsWith('/api/') || req.path.startsWith('/hls/')) {
    return next();
  }

  // Serve index.html for all other routes (SPA)
  res.sendFile(path.join(frontendPath, 'index.html'));
});

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
    const { execSync } = require('child_process');

    // Get disk usage using df command (works in Docker and Linux)
    const dfOutput = execSync(`df -BG "${storagePath}" | tail -1`).toString();
    const parts = dfOutput.split(/\s+/);

    // df output: Filesystem 1G-blocks Used Available Use% Mounted
    const totalGB = parseInt(parts[1]) || 0;
    const usedGB = parseInt(parts[2]) || 0;
    const availableGB = parseInt(parts[3]) || 0;
    const usagePercent = parseInt(parts[4]) || 0;

    return {
      totalGB,
      usedGB,
      availableGB,
      usagePercent,
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

    // 2. Check for configured storage path
    await checkStoragePathConfig();

    // 3. Initialize storage
    await initializeStorage();

    // 4. Initialize HLS stream manager
    await hlsStreamManager.initialize();
    logger.info('HLS stream manager initialized');

    // 5. Initialize recording manager
    await recordingManager.initialize();
    logger.info('Recording manager initialized');

    // 6. Initialize retention manager
    await retentionManager.initialize();
    logger.info('Retention manager initialized');

    // 7. Start health monitoring
    databaseManager.startHealthMonitoring();

    // 8. Start API server
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
