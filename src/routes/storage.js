const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const authenticate = require('../middleware/auth/authenticate');
const authorize = require('../middleware/auth/authorize');
const Camera = require('../models/Camera');
const Recording = require('../models/Recording');
const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger');
const recordingManager = require('../services/recording/recordingManager');

const execAsync = promisify(exec);

router.use(authenticate);

/**
 * Get directory size by summing all file sizes
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Directory might not exist or be inaccessible
    logger.debug(`Error reading directory ${dirPath}:`, error.message);
  }

  return totalSize;
}

/**
 * Get disk usage for a path using df command (Linux/Unix)
 */
async function getDiskUsage(dirPath) {
  try {
    // Use df to get filesystem info
    const { stdout } = await execAsync(`df -k "${dirPath}" | tail -1`);
    const parts = stdout.trim().split(/\s+/);

    if (parts.length >= 4) {
      const totalKB = parseInt(parts[1], 10);
      const usedKB = parseInt(parts[2], 10);
      const availableKB = parseInt(parts[3], 10);

      return {
        totalGB: (totalKB / 1024 / 1024).toFixed(2),
        usedGB: (usedKB / 1024 / 1024).toFixed(2),
        availableGB: (availableKB / 1024 / 1024).toFixed(2),
        usagePercent: ((usedKB / totalKB) * 100).toFixed(1),
      };
    }
  } catch (error) {
    logger.error('Error getting disk usage:', error);
  }

  // Fallback values
  return {
    totalGB: 0,
    usedGB: 0,
    availableGB: 0,
    usagePercent: 0,
  };
}

/**
 * GET /api/storage/stats
 * Get storage statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const recordingsPath = path.join(storagePath, 'recordings');

    // Get disk usage
    const diskUsage = await getDiskUsage(storagePath);

    // Get total recording count
    const totalRecordings = await Recording.countDocuments();

    // Get oldest and newest recordings
    const oldestRecording = await Recording.findOne().sort({ startTime: 1 });
    const newestRecording = await Recording.findOne().sort({ startTime: -1 });

    // Get per-camera statistics
    const cameras = await Camera.find({ active: true });
    const perCamera = [];

    for (const camera of cameras) {
      const cameraRecordingCount = await Recording.countDocuments({ cameraId: camera._id });

      // Calculate size of camera's recordings directory
      const cameraDir = path.join(recordingsPath, camera._id);
      const cameraSizeBytes = await getDirectorySize(cameraDir);
      const cameraSizeGB = (cameraSizeBytes / 1024 / 1024 / 1024).toFixed(2);

      // Get oldest and newest for this camera
      const cameraOldest = await Recording.findOne({ cameraId: camera._id }).sort({ startTime: 1 });
      const cameraNewest = await Recording.findOne({ cameraId: camera._id }).sort({ startTime: -1 });

      // Calculate continuous segments (periods)
      const gapThreshold = 120 * 1000; // 2 minutes in milliseconds
      const cameraRecordings = await Recording.find({
        cameraId: camera._id,
        status: 'completed'
      }).sort({ startTime: 1 }).lean();

      let continuousSegments = 0;
      let lastEndTime = null;

      for (const recording of cameraRecordings) {
        if (!lastEndTime || (new Date(recording.startTime) - lastEndTime) > gapThreshold) {
          continuousSegments++;
        }
        lastEndTime = new Date(recording.endTime);
      }

      perCamera.push({
        cameraId: camera._id,
        cameraName: camera.name,
        recordingCount: cameraRecordingCount,
        continuousSegments: continuousSegments,
        sizeGB: parseFloat(cameraSizeGB),
        oldestRecording: cameraOldest ? cameraOldest.startTime : null,
        newestRecording: cameraNewest ? cameraNewest.startTime : null,
        retentionDays: camera.retentionDays || 30,
      });
    }

    // Calculate total recordings size
    const totalRecordingsSizeBytes = perCamera.reduce((sum, cam) => sum + (cam.sizeGB * 1024 * 1024 * 1024), 0);
    const totalRecordingsSizeGB = (totalRecordingsSizeBytes / 1024 / 1024 / 1024).toFixed(2);

    // Calculate average recording size
    const avgRecordingSizeMB = totalRecordings > 0
      ? ((totalRecordingsSizeBytes / totalRecordings) / 1024 / 1024).toFixed(2)
      : 0;

    res.json({
      storagePath,
      disk: {
        totalGB: parseFloat(diskUsage.totalGB),
        usedGB: parseFloat(diskUsage.usedGB),
        availableGB: parseFloat(diskUsage.availableGB),
        usagePercent: parseFloat(diskUsage.usagePercent),
      },
      recordings: {
        totalCount: totalRecordings,
        totalSizeGB: parseFloat(totalRecordingsSizeGB),
        avgSizeMB: parseFloat(avgRecordingSizeMB),
        oldestRecording: oldestRecording ? oldestRecording.startTime : null,
        newestRecording: newestRecording ? newestRecording.startTime : null,
      },
      perCamera,
    });
  } catch (error) {
    logger.error('Error getting storage stats:', error);
    next(error);
  }
});

/**
 * GET /api/storage/path
 * Get current storage path
 */
router.get('/path', async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const configPath = await SystemConfig.getValue('storagePath', null);

    res.json({
      currentPath: storagePath,
      configuredPath: configPath,
      canChange: true,
      requiresRestart: true,
    });
  } catch (error) {
    logger.error('Error getting storage path:', error);
    next(error);
  }
});

/**
 * POST /api/storage/path
 * Update storage path (requires restart)
 * Admin only
 */
router.post('/path', authorize(['admin']), async (req, res, next) => {
  try {
    const { newPath } = req.body;

    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'newPath is required and must be a string',
        },
      });
    }

    // Validate path exists and is writable
    try {
      await fs.access(newPath, fs.constants.W_OK);
    } catch (error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PATH',
          message: `Path does not exist or is not writable: ${newPath}`,
        },
      });
    }

    // Save to database (will be used on next restart)
    await SystemConfig.setValue('storagePath', newPath, req.user.id);

    logger.info(`Storage path updated to ${newPath} by user ${req.user.username}`);

    res.json({
      success: true,
      newPath,
      message: 'Storage path updated. Restart backend for changes to take effect.',
      requiresRestart: true,
    });
  } catch (error) {
    logger.error('Error updating storage path:', error);
    next(error);
  }
});

/**
 * GET /api/storage/integrity
 * Check integrity of recordings - verify database vs filesystem
 */
router.get('/integrity', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const recordingsPath = path.join(storagePath, 'recordings');

    const issues = [];
    let dbRecordingsChecked = 0;
    let missingFiles = 0;
    let orphanedFiles = 0;

    // Check database recordings against filesystem
    const dbRecordings = await Recording.find();
    dbRecordingsChecked = dbRecordings.length;

    for (const recording of dbRecordings) {
      try {
        await fs.access(recording.filePath, fs.constants.F_OK);
      } catch {
        missingFiles++;
        issues.push({
          type: 'MISSING_FILE',
          severity: 'error',
          recordingId: recording._id,
          cameraId: recording.cameraId,
          filePath: recording.filePath,
          startTime: recording.startTime,
          message: `Database record exists but file is missing: ${recording.filePath}`,
        });
      }
    }

    // Check for orphaned files (files without database records)
    const cameras = await Camera.find();
    for (const camera of cameras) {
      const cameraDir = path.join(recordingsPath, camera._id);

      try {
        const files = await fs.readdir(cameraDir, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const fullPath = path.join(cameraDir, file);
            const dbRecord = dbRecordings.find(r => r.filePath === fullPath);

            if (!dbRecord) {
              orphanedFiles++;
              issues.push({
                type: 'ORPHANED_FILE',
                severity: 'warning',
                filePath: fullPath,
                cameraId: camera._id,
                message: `File exists without database record: ${fullPath}`,
              });
            }
          }
        }
      } catch (error) {
        // Camera directory might not exist
        logger.debug(`Cannot read camera directory ${cameraDir}:`, error.message);
      }
    }

    // Check for recordings with incorrect status
    const stuckRecordings = await Recording.find({
      status: 'recording',
      updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }, // Still "recording" after 5 minutes
    });

    for (const recording of stuckRecordings) {
      issues.push({
        type: 'STUCK_STATUS',
        severity: 'warning',
        recordingId: recording._id,
        cameraId: recording.cameraId,
        message: `Recording stuck in 'recording' status for ${Math.round((Date.now() - recording.updatedAt) / 60000)} minutes`,
      });
    }

    const summary = {
      healthy: issues.length === 0,
      dbRecordingsChecked,
      missingFiles,
      orphanedFiles,
      stuckRecordings: stuckRecordings.length,
      totalIssues: issues.length,
    };

    res.json({
      summary,
      issues,
    });
  } catch (error) {
    logger.error('Error checking integrity:', error);
    next(error);
  }
});

/**
 * POST /api/storage/integrity/import-orphaned
 * Import orphaned files into database
 * Admin only
 */
router.post('/integrity/import-orphaned', authorize(['admin']), async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const recordingsPath = path.join(storagePath, 'recordings');

    let importedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Get all cameras
    const cameras = await Camera.find();

    // Get existing database recordings for comparison
    const dbRecordings = await Recording.find();
    const existingPaths = new Set(dbRecordings.map(r => r.filePath));

    for (const camera of cameras) {
      const cameraDir = path.join(recordingsPath, camera._id);

      try {
        const files = await fs.readdir(cameraDir, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const fullPath = path.join(cameraDir, file);

            // Skip if already in database
            if (existingPaths.has(fullPath)) {
              continue;
            }

            try {
              // Get file stats
              const stats = await fs.stat(fullPath);

              // Parse filename to extract timestamp
              // New format: {SERIAL}_segment_YYYYMMDD_HHMMSS.mp4
              // Old format: segment_YYYYMMDD_HHMMSS.mp4
              const filename = path.basename(file);
              let match = filename.match(/(?:[A-Z0-9]+_)?segment_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp4/);

              if (!match) {
                errors.push(`Invalid filename format: ${filename}`);
                failedCount++;
                continue;
              }

              const [, year, month, day, hour, minute, second] = match;
              const startTime = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
              );

              // Calculate end time (60 seconds after start)
              const endTime = new Date(startTime.getTime() + 60000);

              // Create recording document
              const recording = new Recording({
                cameraId: camera._id,
                filename,
                filePath: fullPath,
                startTime,
                endTime,
                duration: 60,
                size: stats.size,
                status: 'completed',
                metadata: {
                  resolution: camera.streamSettings?.resolution || camera.recordingSettings?.resolution,
                  codec: 'h264',
                  bitrate: camera.recordingSettings?.bitrate,
                  fps: camera.recordingSettings?.fps,
                },
              });

              // Calculate retention date
              recording.calculateRetentionDate(camera.retentionDays || 30);

              await recording.save();
              importedCount++;

              if (importedCount % 100 === 0) {
                logger.info(`Imported ${importedCount} recordings so far...`);
              }
            } catch (error) {
              errors.push(`Failed to import ${file}: ${error.message}`);
              failedCount++;
            }
          }
        }
      } catch (error) {
        logger.error(`Error reading camera directory ${cameraDir}:`, error);
      }
    }

    logger.info(`Import completed: ${importedCount} imported, ${failedCount} failed`);

    res.json({
      success: true,
      importedCount,
      failedCount,
      errors: errors.slice(0, 10), // Return first 10 errors
      message: `Successfully imported ${importedCount} recordings into database`,
    });
  } catch (error) {
    logger.error('Error importing orphaned files:', error);
    next(error);
  }
});

/**
 * DELETE /api/storage/integrity/remove-orphaned
 * Remove orphaned files from filesystem
 * Admin only
 */
router.delete('/integrity/remove-orphaned', authorize(['admin']), async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const recordingsPath = path.join(storagePath, 'recordings');

    let deletedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Get all database recordings
    const dbRecordings = await Recording.find();
    const dbPaths = new Set(dbRecordings.map(r => r.filePath));

    // Get all cameras
    const cameras = await Camera.find();

    for (const camera of cameras) {
      const cameraDir = path.join(recordingsPath, camera._id);

      try {
        const files = await fs.readdir(cameraDir, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const fullPath = path.join(cameraDir, file);

            // Check if orphaned (not in database)
            if (!dbPaths.has(fullPath)) {
              try {
                await fs.unlink(fullPath);
                deletedCount++;

                if (deletedCount % 100 === 0) {
                  logger.info(`Deleted ${deletedCount} orphaned files so far...`);
                }
              } catch (error) {
                errors.push(`Failed to delete ${file}: ${error.message}`);
                failedCount++;
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error reading camera directory ${cameraDir}:`, error);
      }
    }

    logger.info(`Cleanup completed: ${deletedCount} deleted, ${failedCount} failed`);

    res.json({
      success: true,
      deletedCount,
      failedCount,
      errors: errors.slice(0, 10),
      message: `Successfully deleted ${deletedCount} orphaned files`,
    });
  } catch (error) {
    logger.error('Error removing orphaned files:', error);
    next(error);
  }
});

/**
 * DELETE /api/storage/flush-all
 * Flush all recordings - delete all database records and files
 * Admin only - DESTRUCTIVE OPERATION
 */
router.delete('/flush-all', authorize(['admin']), async (req, res, next) => {
  try {
    const storagePath = process.env.STORAGE_PATH;
    const recordingsPath = path.join(storagePath, 'recordings');

    let deletedFiles = 0;
    let deletedDbRecords = 0;
    const errors = [];

    logger.warn('FLUSH ALL RECORDINGS initiated by admin');

    // Get all recordings from database
    const allRecordings = await Recording.find();
    deletedDbRecords = allRecordings.length;

    // Delete all database records
    await Recording.deleteMany({});
    logger.info(`Deleted ${deletedDbRecords} recordings from database`);

    // Delete all recording files from filesystem
    const cameras = await Camera.find();

    for (const camera of cameras) {
      const cameraDir = path.join(recordingsPath, camera._id);

      try {
        // Read all files in camera directory recursively
        const files = await fs.readdir(cameraDir, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const fullPath = path.join(cameraDir, file);
            try {
              await fs.unlink(fullPath);
              deletedFiles++;

              if (deletedFiles % 100 === 0) {
                logger.info(`Deleted ${deletedFiles} files so far...`);
              }
            } catch (error) {
              errors.push(`Failed to delete ${file}: ${error.message}`);
            }
          }
        }
      } catch (error) {
        logger.error(`Error reading camera directory ${cameraDir}:`, error);
      }
    }

    logger.warn(`FLUSH COMPLETED: Deleted ${deletedDbRecords} DB records and ${deletedFiles} files`);

    // Restart all recordings to clear in-memory state
    logger.info('Restarting all recordings after flush...');
    try {
      await recordingManager.stopAllRecordings();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await recordingManager.initialize();
      logger.info('All recordings restarted successfully');
    } catch (restartError) {
      logger.error('Error restarting recordings after flush:', restartError);
      errors.push(`Failed to restart recordings: ${restartError.message}`);
    }

    res.json({
      success: true,
      deletedDbRecords,
      deletedFiles,
      errors: errors.slice(0, 10),
      message: `Successfully flushed all recordings: ${deletedDbRecords} database records and ${deletedFiles} files deleted. Recordings restarted.`,
    });
  } catch (error) {
    logger.error('Error flushing all recordings:', error);
    next(error);
  }
});

/**
 * GET /api/storage/cleanup/preview
 * Preview what would be deleted by retention cleanup
 */
router.get('/cleanup/preview', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const now = new Date();

    // Find recordings that would be deleted
    const recordingsToDelete = await Recording.find({
      retentionDate: { $lt: now },
      protected: false,
    }).populate('cameraId', 'name');

    // Calculate total size
    let totalSize = 0;
    const byCameraCount = {};

    for (const recording of recordingsToDelete) {
      totalSize += recording.size;

      const cameraId = recording.cameraId?._id || recording.cameraId;
      byCameraCount[cameraId] = (byCameraCount[cameraId] || 0) + 1;
    }

    const preview = {
      count: recordingsToDelete.length,
      totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
      byCamera: Object.entries(byCameraCount).map(([cameraId, count]) => ({
        cameraId,
        cameraName: recordingsToDelete.find(r => r.cameraId?._id === cameraId || r.cameraId === cameraId)?.cameraId?.name,
        count,
      })),
      oldestDate: recordingsToDelete.length > 0
        ? Math.min(...recordingsToDelete.map(r => r.startTime.getTime()))
        : null,
      newestDate: recordingsToDelete.length > 0
        ? Math.max(...recordingsToDelete.map(r => r.startTime.getTime()))
        : null,
    };

    res.json(preview);
  } catch (error) {
    logger.error('Error previewing cleanup:', error);
    next(error);
  }
});

module.exports = router;
