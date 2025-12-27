const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/auth/authenticate');
const apiAuth = require('../middleware/auth/apiAuth');
const authorize = require('../middleware/auth/authorize');
const Recording = require('../models/Recording');
const Camera = require('../models/Camera');
const recordingManager = require('../services/recording/recordingManager');
const logger = require('../utils/logger');

/**
 * GET /api/recordings/periods
 * Get continuous recording periods (grouped segments)
 * Designed for integrators - returns consolidated blocks instead of individual 60s segments
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 *
 * Query parameters:
 * - cameraId: Filter by camera serial number (optional, returns all cameras if not specified)
 * - startDate: Filter periods starting after this date (ISO 8601 or epoch seconds)
 * - endDate: Filter periods ending before this date (ISO 8601 or epoch seconds)
 * - minDuration: Minimum period duration in seconds (optional)
 * - gapThreshold: Max gap in seconds to consider recordings continuous (default: 120)
 * - token: API token for authentication (optional, alternative to Authorization header)
 */
router.get('/periods', apiAuth, async (req, res, next) => {
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
 * GET /api/recordings/stream-by-time
 * Stream recording by camera serial, start time, and duration
 * More user-friendly for external integrators
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 *
 * Query parameters:
 * - cameraId: Camera serial number (required)
 * - startTime: Start time in epoch seconds or ISO 8601 (required)
 * - duration: Duration in seconds (optional, defaults to finding single segment)
 * - token: API token for authentication (optional)
 *
 * Example: /api/recordings/stream-by-time?cameraId=B8A44F3024BB&startTime=1766759087&duration=60&token=xxx
 */
router.get('/stream-by-time', apiAuth, async (req, res, next) => {
  try {
    const { cameraId, startTime, duration } = req.query;

    if (!cameraId || !startTime) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'cameraId and startTime are required',
        },
      });
    }

    // Parse start time (support both epoch seconds and ISO 8601)
    const start = isNaN(startTime) ? new Date(startTime) : new Date(parseInt(startTime) * 1000);

    // Build query to find recording(s) that overlap with requested time range
    const query = {
      cameraId,
      status: 'completed',
      startTime: { $lte: start },
      endTime: { $gte: start },
    };

    // Find the recording that contains the requested start time
    const recording = await Recording.findOne(query).sort({ startTime: 1 });

    if (!recording) {
      return res.status(404).json({
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: `No recording found for camera ${cameraId} at ${start.toISOString()}`,
        },
      });
    }

    // Check if file exists
    const filePath = recording.filePath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Recording file not found on disk',
        },
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests (for seeking in video)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Stream entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }

    logger.info(`Streaming recording by time: ${cameraId} at ${start.toISOString()}`);
  } catch (error) {
    logger.error('Error streaming recording by time:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/export-clip
 * Export a video clip with exact duration by stitching segments
 * Designed for event-based retrieval where exact timing matters
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 *
 * Query parameters:
 * - cameraId: Camera serial number (required)
 * - startTime: Start time in epoch seconds or ISO 8601 (required)
 * - duration: Duration in seconds (required, can span multiple segments)
 * - token: API token for authentication (optional)
 *
 * Example: /api/recordings/export-clip?cameraId=B8A44F3024BB&startTime=1766759087&duration=90&token=xxx
 *
 * Returns: MP4 file as download with exact duration
 */
router.get('/export-clip', apiAuth, async (req, res, next) => {
  try {
    const { cameraId, startTime, duration } = req.query;

    if (!cameraId || !startTime || !duration) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'cameraId, startTime, and duration are required',
        },
      });
    }

    const durationSec = parseInt(duration);
    if (durationSec <= 0 || durationSec > 3600) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DURATION',
          message: 'Duration must be between 1 and 3600 seconds (1 hour)',
        },
      });
    }

    // Parse start time (support both epoch seconds and ISO 8601)
    const start = isNaN(startTime) ? new Date(startTime) : new Date(parseInt(startTime) * 1000);
    const end = new Date(start.getTime() + (durationSec * 1000));

    // Find all segments that overlap with the requested time range
    const query = {
      cameraId,
      status: 'completed',
      $or: [
        // Segment starts within range
        { startTime: { $gte: start, $lt: end } },
        // Segment ends within range
        { endTime: { $gt: start, $lte: end } },
        // Segment spans entire range
        { startTime: { $lte: start }, endTime: { $gte: end } },
      ],
    };

    const segments = await Recording.find(query).sort({ startTime: 1 });

    if (segments.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NO_RECORDINGS',
          message: `No recordings found for camera ${cameraId} in the requested time range`,
        },
      });
    }

    // Verify all segment files exist
    for (const segment of segments) {
      if (!fs.existsSync(segment.filePath)) {
        return res.status(404).json({
          error: {
            code: 'FILE_NOT_FOUND',
            message: `Recording file not found: ${segment.filename}`,
          },
        });
      }
    }

    logger.info(`Exporting clip: camera=${cameraId}, start=${start.toISOString()}, duration=${durationSec}s, segments=${segments.length}`);

    // Create temporary directory for processing
    const tmpDir = path.join(process.env.STORAGE_PATH || '/tmp/videox-storage', 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const outputFilename = `${cameraId}_${Math.floor(start.getTime() / 1000)}_${durationSec}s.mp4`;
    const outputPath = path.join(tmpDir, outputFilename);

    // If single segment and no trimming needed, just serve the file
    if (segments.length === 1) {
      const segment = segments[0];
      const segmentStart = new Date(segment.startTime);
      const segmentEnd = new Date(segment.endTime);

      // Check if requested clip fits exactly within this segment
      if (start >= segmentStart && end <= segmentEnd) {
        // Calculate trim offsets
        const trimStart = (start.getTime() - segmentStart.getTime()) / 1000;

        // Use FFmpeg to trim the segment
        const { spawn } = require('child_process');

        // Put -ss before -i for input seeking (more reliable with low bitrate Zipstream)
        const ffmpegArgs = [
          '-ss', trimStart.toString(),
          '-t', durationSec.toString(),
          '-i', segment.filePath,
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-y',
          outputPath,
        ];

        logger.info(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        let ffmpegStderr = '';
        ffmpeg.stderr.on('data', (data) => {
          ffmpegStderr += data.toString();
        });

        await new Promise((resolve, reject) => {
          ffmpeg.on('exit', (code) => {
            if (code === 0) {
              logger.info(`FFmpeg completed successfully. Output: ${outputPath}`);
              logger.info(`FFmpeg stderr: ${ffmpegStderr}`);
              resolve();
            } else {
              logger.error(`FFmpeg failed with code ${code}. stderr: ${ffmpegStderr}`);
              reject(new Error(`FFmpeg exited with code ${code}`));
            }
          });
          ffmpeg.on('error', (err) => {
            logger.error(`FFmpeg spawn error: ${err.message}`);
            reject(err);
          });
        });

        // Stream the output file with range support
        const stat = fs.statSync(outputPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          // Handle range requests for video seeking
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
            'Content-Disposition': `inline; filename="${outputFilename}"`,
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          });

          const fileStream = fs.createReadStream(outputPath, { start, end });
          fileStream.pipe(res);

          // Cleanup after streaming
          fileStream.on('end', () => {
            fs.unlink(outputPath, (err) => {
              if (err) logger.error(`Failed to delete temp file ${outputPath}:`, err);
            });
          });
        } else {
          // Stream entire file
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Content-Disposition': `inline; filename="${outputFilename}"`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          });

          const fileStream = fs.createReadStream(outputPath);
          fileStream.pipe(res);

          // Cleanup after streaming
          fileStream.on('end', () => {
            fs.unlink(outputPath, (err) => {
              if (err) logger.error(`Failed to delete temp file ${outputPath}:`, err);
            });
          });
        }

        return;
      }
    }

    // Multiple segments or complex trimming - need to concatenate
    // Create a concat list file
    const concatListPath = path.join(tmpDir, `concat_${Date.now()}.txt`);
    const concatList = segments.map(s => `file '${s.filePath}'`).join('\n');
    await fs.promises.writeFile(concatListPath, concatList);

    // Calculate trim start (offset from first segment)
    const firstSegmentStart = new Date(segments[0].startTime);
    const trimStart = Math.max(0, (start.getTime() - firstSegmentStart.getTime()) / 1000);

    // Use FFmpeg to concatenate and trim
    const { spawn } = require('child_process');

    // Put -ss before -i for input seeking (more reliable with low bitrate Zipstream)
    const ffmpegArgs = [
      '-ss', trimStart.toString(),
      '-t', durationSec.toString(),
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      outputPath,
    ];

    logger.info(`FFmpeg concat command: ffmpeg ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    let ffmpegStderr = '';
    ffmpeg.stderr.on('data', (data) => {
      ffmpegStderr += data.toString();
    });

    await new Promise((resolve, reject) => {
      ffmpeg.on('exit', (code) => {
        if (code === 0) {
          logger.info(`FFmpeg concat completed successfully. Output: ${outputPath}`);
          logger.info(`FFmpeg concat stderr: ${ffmpegStderr}`);
          resolve();
        } else {
          logger.error(`FFmpeg concat failed with code ${code}. stderr: ${ffmpegStderr}`);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      ffmpeg.on('error', (err) => {
        logger.error(`FFmpeg concat spawn error: ${err.message}`);
        reject(err);
      });
    });

    // Clean up concat list
    await fs.promises.unlink(concatListPath).catch(err =>
      logger.error(`Failed to delete concat list ${concatListPath}:`, err)
    );

    // Stream the output file with range support
    const stat = fs.statSync(outputPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${outputFilename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });

      const fileStream = fs.createReadStream(outputPath, { start, end });
      fileStream.pipe(res);

      // Cleanup after streaming
      fileStream.on('end', () => {
        fs.unlink(outputPath, (err) => {
          if (err) logger.error(`Failed to delete temp file ${outputPath}:`, err);
        });
      });
    } else {
      // Stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${outputFilename}"`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });

      const fileStream = fs.createReadStream(outputPath);
      fileStream.pipe(res);

      // Cleanup after streaming
      fileStream.on('end', () => {
        fs.unlink(outputPath, (err) => {
          if (err) logger.error(`Failed to delete temp file ${outputPath}:`, err);
        });
      });
    }

    logger.info(`Clip exported successfully: ${outputFilename}`);
  } catch (error) {
    logger.error('Error exporting clip:', error);
    next(error);
  }
});

/**
 * GET /api/recordings/active/list
 * Get all active recordings
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 */
router.get('/active/list', apiAuth, async (req, res, next) => {
  try {
    const activeRecordings = recordingManager.getAllRecordings();
    res.json(activeRecordings);
  } catch (error) {
    logger.error('Error getting active recordings:', error);
    next(error);
  }
});

/**
 * GET /api/recordings
 * Get recordings with filtering and pagination
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 */
router.get('/', apiAuth, async (req, res, next) => {
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
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 */
router.get('/:id', apiAuth, async (req, res, next) => {
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
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 */
router.get('/:id/stream', apiAuth, async (req, res, next) => {
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
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });

      file.pipe(res);
    } else {
      // Stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
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
router.post('/:cameraId/start', authenticate, authorize(['admin', 'operator']), async (req, res, next) => {
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
router.post('/:cameraId/stop', authenticate, authorize(['admin', 'operator']), async (req, res, next) => {
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
 *
 * Supports authentication via:
 * - Authorization header: Bearer <token> (JWT or API token)
 * - Query parameter: ?token=<api_token> (API token only, for simple clients)
 */
router.get('/:cameraId/status', apiAuth, async (req, res, next) => {
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
 * PUT /api/recordings/:id/protect
 * Mark recording as protected (prevents deletion by retention policy)
 */
router.put('/:id/protect', authenticate, authorize(['admin', 'operator']), async (req, res, next) => {
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
router.put('/:id/unprotect', authenticate, authorize(['admin', 'operator']), async (req, res, next) => {
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
router.delete('/:id', authenticate, authorize(['admin']), async (req, res, next) => {
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
