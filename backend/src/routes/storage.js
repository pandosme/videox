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

      perCamera.push({
        cameraId: camera._id,
        cameraName: camera.name,
        recordingCount: cameraRecordingCount,
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
