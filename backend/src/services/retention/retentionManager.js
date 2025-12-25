const fs = require('fs').promises;
const logger = require('../../utils/logger');
const Recording = require('../../models/Recording');
const Camera = require('../../models/Camera');

/**
 * Retention Manager
 * Handles automatic deletion of old recordings based on retention policies
 */
class RetentionManager {
  constructor() {
    this.cleanupInterval = null;
    this.cleanupIntervalMs = 60 * 60 * 1000; // Run every hour
  }

  /**
   * Initialize retention manager and start periodic cleanup
   */
  async initialize() {
    logger.info('Initializing retention manager');

    // Run initial cleanup
    await this.runCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch((error) => {
        logger.error('Error in scheduled cleanup:', error);
      });
    }, this.cleanupIntervalMs);

    logger.info(`Retention manager initialized (cleanup every ${this.cleanupIntervalMs / 1000 / 60} minutes)`);
  }

  /**
   * Stop retention manager
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Retention manager stopped');
    }
  }

  /**
   * Run retention cleanup process
   * Deletes recordings that have passed their retention date
   */
  async runCleanup() {
    try {
      logger.info('Starting retention cleanup');

      const now = new Date();

      // Find recordings eligible for deletion
      const expiredRecordings = await Recording.find({
        status: { $ne: 'deleted' },
        protected: false, // Don't delete protected recordings
        retentionDate: { $lte: now },
      });

      if (expiredRecordings.length === 0) {
        logger.info('No recordings to clean up');
        return {
          deleted: 0,
          freed: 0,
        };
      }

      logger.info(`Found ${expiredRecordings.length} recordings to delete`);

      let deletedCount = 0;
      let freedBytes = 0;

      for (const recording of expiredRecordings) {
        try {
          // Delete file from disk
          try {
            await fs.unlink(recording.filePath);
            freedBytes += recording.size;
            logger.debug(`Deleted file: ${recording.filePath}`);
          } catch (error) {
            if (error.code !== 'ENOENT') {
              logger.error(`Error deleting file ${recording.filePath}:`, error);
            }
          }

          // Mark as deleted in database (keep metadata for audit)
          recording.status = 'deleted';
          await recording.save();

          deletedCount++;
        } catch (error) {
          logger.error(`Error processing recording ${recording._id}:`, error);
        }
      }

      const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
      const freedGB = (freedBytes / 1024 / 1024 / 1024).toFixed(2);

      logger.info(`Retention cleanup completed: ${deletedCount} recordings deleted, ${freedGB} GB freed`);

      return {
        deleted: deletedCount,
        freed: freedBytes,
        freedMB,
        freedGB,
      };
    } catch (error) {
      logger.error('Error during retention cleanup:', error);
      throw error;
    }
  }

  /**
   * Get retention statistics
   * @returns {Promise<Object>} Statistics about recordings and storage
   */
  async getRetentionStats() {
    try {
      const now = new Date();

      const stats = await Recording.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalSize: { $sum: '$size' },
          },
        },
      ]);

      const expiringWithin24h = await Recording.countDocuments({
        status: { $ne: 'deleted' },
        protected: false,
        retentionDate: {
          $gte: now,
          $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      const expiringWithin7d = await Recording.countDocuments({
        status: { $ne: 'deleted' },
        protected: false,
        retentionDate: {
          $gte: now,
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const protectedCount = await Recording.countDocuments({
        protected: true,
        status: { $ne: 'deleted' },
      });

      const overdueCount = await Recording.countDocuments({
        status: { $ne: 'deleted' },
        protected: false,
        retentionDate: { $lte: now },
      });

      // Format stats by status
      const statsByStatus = {};
      let totalSize = 0;
      let totalCount = 0;

      for (const stat of stats) {
        statsByStatus[stat._id] = {
          count: stat.count,
          size: stat.totalSize,
          sizeMB: (stat.totalSize / 1024 / 1024).toFixed(2),
          sizeGB: (stat.totalSize / 1024 / 1024 / 1024).toFixed(2),
        };
        totalSize += stat.totalSize;
        totalCount += stat.count;
      }

      return {
        byStatus: statsByStatus,
        total: {
          count: totalCount,
          size: totalSize,
          sizeMB: (totalSize / 1024 / 1024).toFixed(2),
          sizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
        },
        retention: {
          protected: protectedCount,
          expiringWithin24h,
          expiringWithin7d,
          overdue: overdueCount,
        },
      };
    } catch (error) {
      logger.error('Error getting retention stats:', error);
      throw error;
    }
  }

  /**
   * Update retention dates for all recordings of a camera
   * Called when camera retention policy changes
   * @param {string} cameraId - Camera ID
   * @param {number} newRetentionDays - New retention period in days
   */
  async updateCameraRetention(cameraId, newRetentionDays) {
    try {
      logger.info(`Updating retention for camera ${cameraId} to ${newRetentionDays} days`);

      const recordings = await Recording.find({
        cameraId,
        status: { $ne: 'deleted' },
        protected: false,
      });

      let updatedCount = 0;

      for (const recording of recordings) {
        recording.calculateRetentionDate(newRetentionDays);
        await recording.save();
        updatedCount++;
      }

      logger.info(`Updated retention dates for ${updatedCount} recordings`);

      return updatedCount;
    } catch (error) {
      logger.error(`Error updating camera retention for ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old deleted recording metadata
   * Removes database entries for deleted recordings older than specified days
   * @param {number} olderThanDays - Remove deleted entries older than this many days
   */
  async cleanupDeletedMetadata(olderThanDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await Recording.deleteMany({
        status: 'deleted',
        updatedAt: { $lte: cutoffDate },
      });

      logger.info(`Cleaned up ${result.deletedCount} old deleted recording metadata entries`);

      return result.deletedCount;
    } catch (error) {
      logger.error('Error cleaning up deleted metadata:', error);
      throw error;
    }
  }
}

// Create singleton instance
const retentionManager = new RetentionManager();

module.exports = retentionManager;
