const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../../utils/logger');
const Recording = require('../../models/Recording');
const Camera = require('../../models/Camera');
const SystemConfig = require('../../models/SystemConfig');

const execAsync = promisify(exec);

/**
 * Retention Manager
 * Handles automatic deletion of old recordings based on retention policies (time and storage)
 */
class RetentionManager {
  constructor() {
    this.cleanupInterval = null;
    this.cleanupIntervalMs = 60 * 60 * 1000; // Run every hour
    this.storageBasePath = process.env.STORAGE_PATH || '/tmp/videox-storage';
    this.orphanAgeThresholdMs = 24 * 60 * 60 * 1000; // Only clean orphans older than 24 hours
  }

  /**
   * Get total size of all recordings from database
   */
  async getTotalRecordingSize() {
    try {
      const result = await Recording.aggregate([
        {
          $match: {
            status: { $ne: 'deleted' },
          },
        },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$size' },
          },
        },
      ]);

      return result.length > 0 ? result[0].totalSize : 0;
    } catch (error) {
      logger.error('Error getting total recording size:', error);
      return 0;
    }
  }

  /**
   * Get disk usage for the storage path
   */
  async getDiskUsage() {
    try {
      const { stdout } = await execAsync(`df -k "${this.storageBasePath}" | tail -1`);
      const parts = stdout.trim().split(/\s+/);

      if (parts.length >= 4) {
        const totalKB = parseInt(parts[1], 10);
        const usedKB = parseInt(parts[2], 10);
        const availableKB = parseInt(parts[3], 10);

        return {
          totalBytes: totalKB * 1024,
          usedBytes: usedKB * 1024,
          availableBytes: availableKB * 1024,
          usagePercent: (usedKB / totalKB) * 100,
        };
      }
    } catch (error) {
      logger.error('Error getting disk usage:', error);
    }

    return null;
  }

  /**
   * Check if recording storage exceeds user-defined GB limit
   */
  async isRecordingStorageOverLimit() {
    try {
      const maxStorageGB = await SystemConfig.getValue('maxStorageGB', null);
      if (!maxStorageGB) {
        return false; // No limit configured
      }

      const totalRecordingSize = await this.getTotalRecordingSize();
      const totalRecordingGB = totalRecordingSize / 1024 / 1024 / 1024;
      const isOverLimit = totalRecordingGB >= maxStorageGB;

      if (isOverLimit) {
        logger.info(
          `Recording storage is over limit: ${totalRecordingGB.toFixed(2)} GB used ` +
          `(limit: ${maxStorageGB} GB)`
        );
      }

      return isOverLimit;
    } catch (error) {
      logger.error('Error checking recording storage limit:', error);
      return false;
    }
  }

  /**
   * Check if disk usage exceeds safety threshold (emergency brake)
   */
  async isDiskSpaceOverLimit() {
    try {
      const diskUsage = await this.getDiskUsage();
      if (!diskUsage) {
        return false;
      }

      const maxStoragePercent = await SystemConfig.getValue('maxStoragePercent', 95);
      const isOverLimit = diskUsage.usagePercent >= maxStoragePercent;

      if (isOverLimit) {
        logger.warn(
          `Disk space is over safety limit: ${diskUsage.usagePercent.toFixed(1)}% used ` +
          `(limit: ${maxStoragePercent}%) - emergency cleanup activated`
        );
      }

      return isOverLimit;
    } catch (error) {
      logger.error('Error checking disk space limit:', error);
      return false;
    }
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
   * Deletes recordings based on:
   * 1. Time-based retention (recordings past their retention date)
   * 2. Storage-based retention (delete oldest recordings when storage exceeds limit)
   */
  async runCleanup() {
    try {
      logger.info('Starting retention cleanup');

      const now = new Date();
      let deletedCount = 0;
      let freedBytes = 0;

      // Phase 1: Time-based retention - delete expired recordings
      const expiredRecordings = await Recording.find({
        status: { $ne: 'deleted' },
        protected: false,
        retentionDate: { $lte: now },
      }).sort({ startTime: 1 }); // Oldest first

      if (expiredRecordings.length > 0) {
        logger.info(`Found ${expiredRecordings.length} expired recordings to delete`);

        for (const recording of expiredRecordings) {
          try {
            const freed = await this.deleteRecording(recording);
            if (freed > 0) {
              deletedCount++;
              freedBytes += freed;
            }
          } catch (error) {
            logger.error(`Error deleting expired recording ${recording._id}:`, error);
          }
        }
      }

      // Phase 2: User-defined GB limit - delete oldest recordings if total recording size exceeds limit
      let recordingStorageOverLimit = await this.isRecordingStorageOverLimit();
      if (recordingStorageOverLimit) {
        logger.info('Recording storage exceeds user-defined limit, starting cleanup');

        // Get oldest unprotected recordings
        let oldestRecordings = await Recording.find({
          status: { $ne: 'deleted' },
          protected: false,
        })
          .sort({ startTime: 1 }) // Oldest first
          .limit(1000); // Process in batches

        for (const recording of oldestRecordings) {
          // Check if we're still over limit
          recordingStorageOverLimit = await this.isRecordingStorageOverLimit();
          if (!recordingStorageOverLimit) {
            logger.info('Recording storage now within user-defined limit');
            break;
          }

          try {
            const freed = await this.deleteRecording(recording);
            if (freed > 0) {
              deletedCount++;
              freedBytes += freed;
            }
          } catch (error) {
            logger.error(`Error deleting recording for storage cleanup ${recording._id}:`, error);
          }
        }
      }

      // Phase 3: Disk space safety - delete oldest recordings if disk usage exceeds safety threshold
      let diskSpaceOverLimit = await this.isDiskSpaceOverLimit();
      if (diskSpaceOverLimit) {
        logger.warn('Disk space exceeds safety threshold, starting emergency cleanup');

        // Get oldest unprotected recordings
        let oldestRecordings = await Recording.find({
          status: { $ne: 'deleted' },
          protected: false,
        })
          .sort({ startTime: 1 }) // Oldest first
          .limit(1000); // Process in batches

        for (const recording of oldestRecordings) {
          // Check if we're still over limit
          diskSpaceOverLimit = await this.isDiskSpaceOverLimit();
          if (!diskSpaceOverLimit) {
            logger.info('Disk space now within safety threshold');
            break;
          }

          try {
            const freed = await this.deleteRecording(recording);
            if (freed > 0) {
              deletedCount++;
              freedBytes += freed;
              logger.debug(
                `Emergency cleanup: deleted ${recording.filename} ` +
                `(${(freed / 1024 / 1024).toFixed(2)} MB)`
              );
            }
          } catch (error) {
            logger.error(`Error deleting recording for emergency cleanup ${recording._id}:`, error);
          }
        }
      }

      const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
      const freedGB = (freedBytes / 1024 / 1024 / 1024).toFixed(2);

      if (deletedCount === 0) {
        logger.info('No recordings to clean up');
      } else {
        logger.info(
          `Retention cleanup completed: ${deletedCount} recordings deleted, ${freedGB} GB freed`
        );
      }

      // Clean up empty directories
      const recordingsPath = path.join(this.storageBasePath, 'recordings');
      await this.cleanupEmptyDirectories(recordingsPath);

      // Also clean up orphaned files
      const orphanResult = await this.cleanupOrphanedFiles();

      return {
        deleted: deletedCount,
        freed: freedBytes,
        freedMB,
        freedGB,
        orphansDeleted: orphanResult.deleted,
        orphansFreed: orphanResult.freed,
      };
    } catch (error) {
      logger.error('Error during retention cleanup:', error);
      throw error;
    }
  }

  /**
   * Delete a single recording (file and database record)
   * @param {Object} recording - Recording document
   * @returns {number} Bytes freed
   */
  async deleteRecording(recording) {
    try {
      let freedBytes = 0;

      // Delete file from disk
      try {
        await fs.unlink(recording.filePath);
        freedBytes = recording.size;
        logger.debug(`Deleted file: ${recording.filePath}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(`Error deleting file ${recording.filePath}:`, error);
        }
      }

      // Mark as deleted in database (keep metadata for audit)
      recording.status = 'deleted';
      await recording.save();

      return freedBytes;
    } catch (error) {
      logger.error(`Error deleting recording ${recording._id}:`, error);
      return 0;
    }
  }

  /**
   * Clean up orphaned files (files on disk but not in database)
   * Only cleans files older than the threshold to avoid removing files still being written
   */
  async cleanupOrphanedFiles() {
    try {
      const recordingsPath = path.join(this.storageBasePath, 'recordings');
      const now = Date.now();

      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch {
        return { deleted: 0, freed: 0 };
      }

      // Get all cameras to know which directories to scan
      const cameras = await Camera.find({});

      let deletedCount = 0;
      let freedBytes = 0;

      for (const camera of cameras) {
        const cameraDir = path.join(recordingsPath, camera._id.toString());

        try {
          await fs.access(cameraDir);
        } catch {
          continue; // Camera directory doesn't exist
        }

        // Find all .mp4 files recursively
        const mp4Files = await this.findMp4Files(cameraDir);

        for (const filePath of mp4Files) {
          try {
            // Check if file is in database
            const recording = await Recording.findOne({ filePath });
            if (recording) {
              continue; // File has a database record, not an orphan
            }

            // Get file stats to check age
            const stats = await fs.stat(filePath);
            const fileAge = now - stats.mtime.getTime();

            // Only delete orphans older than threshold (to avoid deleting files being written)
            if (fileAge < this.orphanAgeThresholdMs) {
              logger.debug(`Skipping recent orphan file (${Math.round(fileAge / 1000 / 60)} min old): ${filePath}`);
              continue;
            }

            // Delete the orphan file
            await fs.unlink(filePath);
            deletedCount++;
            freedBytes += stats.size;
            logger.info(`Deleted orphan file: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          } catch (err) {
            if (err.code !== 'ENOENT') {
              logger.error(`Error processing potential orphan ${filePath}:`, err);
            }
          }
        }
      }

      // Also clean up empty directories
      await this.cleanupEmptyDirectories(recordingsPath);

      if (deletedCount > 0) {
        logger.info(`Orphan cleanup: ${deletedCount} files deleted, ${(freedBytes / 1024 / 1024).toFixed(2)} MB freed`);
      }

      return { deleted: deletedCount, freed: freedBytes };
    } catch (error) {
      logger.error('Error cleaning up orphaned files:', error);
      return { deleted: 0, freed: 0 };
    }
  }

  /**
   * Recursively find all .mp4 files in a directory
   * @param {string} dir - Directory to search
   * @returns {Promise<string[]>} Array of file paths
   */
  async findMp4Files(dir) {
    const files = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findMp4Files(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      logger.debug(`Error reading directory ${dir}: ${err.message}`);
    }

    return files;
  }

  /**
   * Clean up empty directories recursively
   * @param {string} dir - Directory to clean
   */
  async cleanupEmptyDirectories(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          await this.cleanupEmptyDirectories(fullPath);

          // Try to remove directory if empty
          try {
            const subEntries = await fs.readdir(fullPath);
            if (subEntries.length === 0) {
              await fs.rmdir(fullPath);
              logger.debug(`Removed empty directory: ${fullPath}`);
            }
          } catch (err) {
            // Ignore errors when removing directories
          }
        }
      }
    } catch (err) {
      // Ignore errors
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
