const mongoose = require('mongoose');
const { InfluxDB } = require('@influxdata/influxdb-client');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor() {
    this.mongooseConnection = null;
    this.influxClient = null;
    this.influxWriteApi = null;
    this.influxQueryApi = null;
    this.isMongoConnected = false;
    this.isInfluxConnected = false;
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
   * Connect to InfluxDB with retry logic
   * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
   * @param {number} retryInterval - Interval between retries in ms (default: 5000)
   */
  async connectInfluxDB(maxRetries = 5, retryInterval = 5000) {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        attempts++;
        logger.info(`InfluxDB connection attempt ${attempts}/${maxRetries}`);

        this.influxClient = new InfluxDB({
          url: process.env.INFLUXDB_URL,
          token: process.env.INFLUXDB_TOKEN,
        });

        // Initialize write and query APIs
        this.influxWriteApi = this.influxClient.getWriteApi(
          process.env.INFLUXDB_ORG,
          process.env.INFLUXDB_BUCKET,
          'ms' // millisecond precision
        );

        this.influxQueryApi = this.influxClient.getQueryApi(process.env.INFLUXDB_ORG);

        // Test the connection by performing a simple query
        const query = `from(bucket: "${process.env.INFLUXDB_BUCKET}") |> range(start: -1m) |> limit(n: 1)`;
        await this.influxQueryApi.collectRows(query);

        this.isInfluxConnected = true;
        logger.info('InfluxDB connected successfully');

        return true;
      } catch (error) {
        logger.error(`InfluxDB connection attempt ${attempts} failed:`, error.message);

        if (attempts >= maxRetries) {
          logger.error('InfluxDB connection failed after all retry attempts');
          throw new Error('Failed to connect to InfluxDB after maximum retry attempts');
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
   * Ping InfluxDB to check connection health
   */
  async pingInfluxDB() {
    try {
      const query = `from(bucket: "${process.env.INFLUXDB_BUCKET}") |> range(start: -1m) |> limit(n: 1)`;
      await this.influxQueryApi.collectRows(query);
      this.isInfluxConnected = true;
      return true;
    } catch (error) {
      logger.warn('InfluxDB ping failed:', error.message);
      this.isInfluxConnected = false;
      return false;
    }
  }

  /**
   * Start health monitoring for both databases
   * Pings every 30 seconds
   */
  startHealthMonitoring() {
    setInterval(async () => {
      await this.pingMongoDB();
      await this.pingInfluxDB();
    }, 30000); // 30 seconds

    logger.info('Database health monitoring started');
  }

  /**
   * Close all database connections
   */
  async closeConnections() {
    try {
      // Close MongoDB connection
      if (this.mongooseConnection) {
        await mongoose.connection.close();
        this.isMongoConnected = false;
        logger.info('MongoDB connection closed');
      }

      // Close InfluxDB connection
      if (this.influxWriteApi) {
        await this.influxWriteApi.close();
        this.isInfluxConnected = false;
        logger.info('InfluxDB connection closed');
      }

      logger.info('All database connections closed successfully');
    } catch (error) {
      logger.error('Error closing database connections:', error);
      throw error;
    }
  }

  /**
   * Get the current health status of both databases
   */
  getHealthStatus() {
    return {
      mongodb: this.isMongoConnected,
      influxdb: this.isInfluxConnected,
      overall: this.isMongoConnected && this.isInfluxConnected ? 'healthy' : 'degraded',
    };
  }
}

// Create and export a singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;
