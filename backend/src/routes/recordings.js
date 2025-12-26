const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/auth/authenticate');
const authorize = require('../middleware/auth/authorize');
const Recording = require('../models/Recording');
const Camera = require('../models/Camera');
const recordingManager = require('../services/recording/recordingManager');
const logger = require('../utils/logger');

// All recording routes require authentication
router.use(authenticate);

/**
 * GET /api/recordings/periods
 * Get continuous recording periods (grouped segments)
 * Designed for integrators - returns consolidated blocks instead of individual 60s segments
 *
 * Query parameters:
 * - cameraId: Filter by camera serial number (optional, returns all cameras if not specified)
 * - startDate: Filter periods starting after this date (ISO 8601 or epoch seconds)
 * - endDate: Filter periods ending before this date (ISO 8601 or epoch seconds)
 * - minDuration: Minimum period duration in seconds (optional)
 * - gapThreshold: Max gap in seconds to consider recordings continuous (default: 120)
 */
router.get('/periods', async (req, res, next) => {
  try {
    const {
      cameraId,
      startDate,
      endDate,
      minDuration,
      gapThreshold = 120, // 2 minutes default gap threshold
    } = req.query;

    // Build query
    const query = { status: 'completed' }; // Only include completed recordings

    if (cameraId) {
      query.cameraId = cameraId;
    }

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        // Support both ISO 8601 and epoch seconds
        const start = isNaN(startDate) ? new Date(startDate) : new Date(parseInt(startDate) * 1000);
        query.startTime.$gte = start;
      }
      if (endDate) {
        const end = isNaN(endDate) ? new Date(endDate) : new Date(parseInt(endDate) * 1000);
        query.startTime.$lte = end;
      }
    }

    // Fetch all matching recordings sorted by camera and time
    const recordings = await Recording.find(query)
      .sort({ cameraId: 1, startTime: 1 })
      .lean();

    if (recordings.length === 0) {
      return res.json({ periods: [], total: 0 });
    }

    // Group recordings into continuous periods
    const periods = [];
    const threshold = parseInt(gapThreshold) * 1000; // Convert to milliseconds
    let currentPeriod = null;

    for (const recording of recordings) {
      if (!currentPeriod ||
          currentPeriod.cameraId !== recording.cameraId ||
          (new Date(recording.startTime) - new Date(currentPeriod.endTime)) > threshold) {

        // Start new period
        if (currentPeriod) {
          periods.push(currentPeriod);
        }

        currentPeriod = {
          cameraId: recording.cameraId,
          startTime: recording.startTime,
          endTime: recording.endTime,
          segmentCount: 1,
          totalSize: recording.size,
          firstSegmentId: recording._id,
          lastSegmentId: recording._id,
        };
      } else {
        // Extend current period
        currentPeriod.endTime = recording.endTime;
        currentPeriod.segmentCount++;
        currentPeriod.totalSize += recording.size;
        currentPeriod.lastSegmentId = recording._id;
      }
    }

    // Add last period
    if (currentPeriod) {
      periods.push(currentPeriod);
    }

    // Calculate duration and filter by minDuration
    const finalPeriods = periods
      .map(period => {
        const durationMs = new Date(period.endTime) - new Date(period.startTime);
        const durationSeconds = Math.round(durationMs / 1000);

        return {
          ...period,
          durationSeconds,
          startTimeEpoch: Math.floor(new Date(period.startTime).getTime() / 1000),
          endTimeEpoch: Math.floor(new Date(period.endTime).getTime() / 1000),
        };
      })
      .filter(period => {
        if (minDuration) {
          return period.durationSeconds >= parseInt(minDuration);
        }
        return true;
      });

    logger.info(`Returning ${finalPeriods.length} recording periods (from ${recordings.length} segments)`);

    res.json({
      periods: finalPeriods,
      total: finalPeriods.length,
      gapThreshold: parseInt(gapThreshold),
    });
  } catch (error) {
    logger.error('Error fetching recording periods:', error);
    next(error);
  }
});

/**
 * GET /api/recordings
 * Get recordings with filtering and pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      cameraId,
      startDate,
      endDate,
      status,
      protected: isProtected,
      eventTags,
      limit = 100,
      offset = 0,
    } = req.query;

    const query = {};

    if (cameraId) {
      query.cameraId = cameraId;
    }

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }

    if (status) {
      query.status = status;
    }

    if (isProtected !== undefined) {
      query.protected = isProtected === 'true';
    }

    if (eventTags) {
      query.eventTags = { $in: eventTags.split(',') };
    }

    const recordings = await Recording.find(query)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ startTime: -1 })
      .lean();

    const total = await Recording.countDocuments(query);

    res.json({
      recordings,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error('Error fetching recordings:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/:id
 * Get recording by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not found',
        },
      });
    }

    res.json(recording);
  } catch (error) {
    logger.error('Error fetching recording:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/:id/stream
 * Stream recording video file
 */
router.get('/:id/stream', async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not found',
        },
      });
    }

    // Check if file exists
    if (!fs.existsSync(recording.filePath)) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Video file not found on disk',
        },
      });
    }

    const stat = fs.statSync(recording.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(recording.filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      file.pipe(res);
    } else {
      // Stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });

      fs.createReadStream(recording.filePath).pipe(res);
    }
  } catch (error) {
    logger.error('Error streaming recording:', error);
    next(error);
  }
});

/**
 * POST /api/recordings/:cameraId/start
 * Start recording for a camera (Admin or Operator only)
 */
router.post('/:cameraId/start', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const camera = await Camera.findById(req.params.cameraId);

    if (!camera) {
      return res.status(404).json({
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: 'Camera not found',
        },
      });
    }

    if (!camera.active) {
      return res.status(400).json({
        error: {
          code: 'CAMERA_INACTIVE',
          message: 'Cannot start recording for inactive camera',
        },
      });
    }

    await recordingManager.startRecording(camera);

    logger.info(`Recording started for camera: ${req.params.cameraId}`);

    res.json({
      success: true,
      cameraId: camera._id,
      status: 'recording',
    });
  } catch (error) {
    logger.error('Error starting recording:', error);
    next(error);
  }
});

/**
 * POST /api/recordings/:cameraId/stop
 * Stop recording for a camera (Admin or Operator only)
 */
router.post('/:cameraId/stop', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    await recordingManager.stopRecording(req.params.cameraId);

    logger.info(`Recording stopped for camera: ${req.params.cameraId}`);

    res.json({
      success: true,
      cameraId: req.params.cameraId,
      status: 'stopped',
    });
  } catch (error) {
    logger.error('Error stopping recording:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/:cameraId/status
 * Get recording status for a camera
 */
router.get('/:cameraId/status', async (req, res, next) => {
  try {
    // Check both in-memory state and database state
    const isRecording = recordingManager.isRecording(req.params.cameraId);
    const info = recordingManager.getRecordingInfo(req.params.cameraId);

    // Also check database for persistent state
    const camera = await Camera.findById(req.params.cameraId);
    const dbRecordingState = camera?.status?.recordingState === 'recording';

    res.json({
      cameraId: req.params.cameraId,
      recording: isRecording || dbRecordingState, // True if either in-memory or database shows recording
      ...info,
    });
  } catch (error) {
    logger.error('Error getting recording status:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/active/list
 * Get all active recordings
 */
router.get('/active/list', async (req, res, next) => {
  try {
    const activeRecordings = recordingManager.getAllRecordings();
    res.json(activeRecordings);
  } catch (error) {
    logger.error('Error getting active recordings:', error);
    next(error);
  }
});

/**
 * PUT /api/recordings/:id/protect
 * Mark recording as protected (prevents deletion by retention policy)
 */
router.put('/:id/protect', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const recording = await Recording.findByIdAndUpdate(
      req.params.id,
      { protected: true },
      { new: true }
    );

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not found',
        },
      });
    }

    logger.info(`Recording protected: ${req.params.id}`);

    res.json(recording);
  } catch (error) {
    logger.error('Error protecting recording:', error);
    next(error);
  }
});

/**
 * PUT /api/recordings/:id/unprotect
 * Remove protected flag from recording
 */
router.put('/:id/unprotect', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const recording = await Recording.findByIdAndUpdate(
      req.params.id,
      { protected: false },
      { new: true }
    );

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not found',
        },
      });
    }

    logger.info(`Recording unprotected: ${req.params.id}`);

    res.json(recording);
  } catch (error) {
    logger.error('Error unprotecting recording:', error);
    next(error);
  }
});

/**
 * DELETE /api/recordings/:id
 * Delete a recording (Admin only)
 */
router.delete('/:id', authorize(['admin']), async (req, res, next) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Recording not found',
        },
      });
    }

    if (recording.protected) {
      return res.status(403).json({
        error: {
          code: 'RECORDING_PROTECTED',
          message: 'Cannot delete protected recording',
        },
      });
    }

    // Delete file from disk
    try {
      if (fs.existsSync(recording.filePath)) {
        await fs.promises.unlink(recording.filePath);
      }
    } catch (error) {
      logger.error(`Error deleting file ${recording.filePath}:`, error);
    }

    // Delete from database
    await Recording.findByIdAndDelete(req.params.id);

    logger.info(`Recording deleted: ${req.params.id}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting recording:', error);
    next(error);
  }
});

module.exports = router;
