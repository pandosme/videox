const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor() {
    this.mongooseConnection = null;
    this.isMongoConnected = false;
  }

  /**
   * Connect to MongoDB with retry logic
   * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
   * @param {number} retryInterval - Interval between retries in ms (default: 5000)
   */
  async connectMongoDB(maxRetries = 5, retryInterval = 5000) {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        attempts++;
        logger.info(`MongoDB connection attempt ${attempts}/${maxRetries}`);

        await mongoose.connect(process.env.MONGODB_URI, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
        });

        this.mongooseConnection = mongoose.connection;
        this.isMongoConnected = true;

        logger.info('MongoDB connected successfully');

        // Set up connection event handlers
        mongoose.connection.on('error', (err) => {
          logger.error('MongoDB connection error:', err);
          this.isMongoConnected = false;
        });

        mongoose.connection.on('disconnected', () => {
          logger.warn('MongoDB disconnected');
          this.isMongoConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
          logger.info('MongoDB reconnected');
          this.isMongoConnected = true;
        });

        return true;
      } catch (error) {
        logger.error(`MongoDB connection attempt ${attempts} failed:`, error.message);

        if (attempts >= maxRetries) {
          logger.error('MongoDB connection failed after all retry attempts');
          throw new Error('Failed to connect to MongoDB after maximum retry attempts');
        }

        logger.info(`Retrying in ${retryInterval / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    return false;
  }

  /**
   * Ping MongoDB to check connection health
   */
  async pingMongoDB() {
    try {
      await mongoose.connection.db.admin().ping();
      this.isMongoConnected = true;
      return true;
    } catch (error) {
      logger.warn('MongoDB ping failed:', error.message);
      this.isMongoConnected = false;
      return false;
    }
  }

  /**
   * Start health monitoring for MongoDB
   * Pings every 30 seconds
   */
  startHealthMonitoring() {
    setInterval(async () => {
      await this.pingMongoDB();
    }, 30000); // 30 seconds

    logger.info('Database health monitoring started');
  }

  /**
   * Close database connection
   */
  async closeConnections() {
    try {
      if (this.mongooseConnection) {
        await mongoose.connection.close();
        this.isMongoConnected = false;
        logger.info('MongoDB connection closed');
      }

      logger.info('Database connection closed successfully');
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error;
    }
  }

  /**
   * Get the current health status of the database
   */
  getHealthStatus() {
    return {
      mongodb: this.isMongoConnected,
      overall: this.isMongoConnected ? 'healthy' : 'degraded',
    };
  }
}

// Create and export a singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;
