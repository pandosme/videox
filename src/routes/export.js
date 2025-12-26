const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const apiAuth = require('../middleware/auth/apiAuth');
const Recording = require('../models/Recording');
const Camera = require('../models/Camera');
const logger = require('../utils/logger');

router.use(apiAuth);

/**
 * GET /api/export
 * Export or stream recordings
 *
 * Query parameters:
 * - cameraId: Camera serial number (required)
 * - startTime: Start time in epoch seconds (required)
 * - duration: Duration in seconds (required)
 * - type: 'stream' or 'file' (default: 'stream')
 */
router.get('/', async (req, res, next) => {
  try {
    const { cameraId, startTime, duration, type = 'stream' } = req.query;

    // Validate parameters
    if (!cameraId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'cameraId is required',
        },
      });
    }

    if (!startTime || isNaN(parseInt(startTime, 10))) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'startTime (epoch seconds) is required',
        },
      });
    }

    if (!duration || isNaN(parseInt(duration, 10)) || parseInt(duration, 10) <= 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'duration (seconds) must be a positive number',
        },
      });
    }

    if (type !== 'stream' && type !== 'file') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'type must be "stream" or "file"',
        },
      });
    }

    // Verify camera exists
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      return res.status(404).json({
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: 'Camera not found',
        },
      });
    }

    // Calculate time range
    const start = parseInt(startTime, 10) * 1000; // Convert to milliseconds
    const durationMs = parseInt(duration, 10) * 1000;
    const end = start + durationMs;

    const startDate = new Date(start);
    const endDate = new Date(end);

    logger.info(`Export request: camera=${cameraId}, start=${startDate.toISOString()}, end=${endDate.toISOString()}, type=${type}, user=${req.user.username}, authType=${req.authType}`);

    // Find recordings that overlap with requested time range
    const recordings = await Recording.find({
      cameraId,
      $or: [
        // Recording starts within range
        { startTime: { $gte: startDate, $lt: endDate } },
        // Recording ends within range
        { endTime: { $gt: startDate, $lte: endDate } },
        // Recording spans entire range
        { startTime: { $lte: startDate }, endTime: { $gte: endDate } },
      ],
    }).sort({ startTime: 1 });

    if (recordings.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NO_RECORDINGS',
          message: 'No recordings found for specified time range',
        },
      });
    }

    logger.info(`Found ${recordings.length} recordings for export`);

    // Check if all files exist
    const missingFiles = [];
    for (const recording of recordings) {
      if (!fs.existsSync(recording.filePath)) {
        missingFiles.push(recording.filePath);
      }
    }

    if (missingFiles.length > 0) {
      logger.error(`Missing recording files: ${missingFiles.join(', ')}`);
      return res.status(404).json({
        error: {
          code: 'FILES_NOT_FOUND',
          message: 'Some recording files are missing',
          details: { missingCount: missingFiles.length },
        },
      });
    }

    // If single recording, stream/send directly
    if (recordings.length === 1) {
      return handleSingleRecording(recordings[0], type, startDate, endDate, res);
    }

    // Multiple recordings - need to concatenate with FFmpeg
    return handleMultipleRecordings(recordings, type, startDate, endDate, camera.name, res);
  } catch (error) {
    logger.error('Export error:', error);
    next(error);
  }
});

/**
 * Handle single recording (direct stream or download)
 */
function handleSingleRecording(recording, type, startDate, endDate, res) {
  const stat = fs.statSync(recording.filePath);

  if (type === 'file') {
    // Download as file
    const filename = `${path.basename(recording.filePath, '.mp4')}_export.mp4`;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(recording.filePath);
    stream.pipe(res);
  } else {
    // Stream with range support
    const range = res.req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      fs.createReadStream(recording.filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'video/mp4',
      });

      fs.createReadStream(recording.filePath).pipe(res);
    }
  }
}

/**
 * Handle multiple recordings (concatenate with FFmpeg)
 */
function handleMultipleRecordings(recordings, type, startDate, endDate, cameraName, res) {
  // Create FFmpeg concat file
  const concatList = recordings.map(r => `file '${r.filePath}'`).join('\n');

  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${cameraName.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.mp4`;

  // FFmpeg arguments
  const ffmpegArgs = [
    '-f', 'concat',
    '-safe', '0',
    '-protocol_whitelist', 'file,pipe',
    '-i', 'pipe:0', // Read concat list from stdin
    '-c', 'copy', // Copy streams (no re-encoding)
    '-movflags', '+faststart', // Enable streaming
    '-f', 'mp4',
    'pipe:1', // Output to stdout
  ];

  logger.info(`Starting FFmpeg concatenation: ${recordings.length} files`);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  // Write concat list to stdin
  ffmpeg.stdin.write(concatList);
  ffmpeg.stdin.end();

  // Set response headers
  if (type === 'file') {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  } else {
    res.setHeader('Content-Type', 'video/mp4');
  }

  // Pipe FFmpeg output to response
  ffmpeg.stdout.pipe(res);

  // Log FFmpeg errors
  ffmpeg.stderr.on('data', (data) => {
    logger.debug(`FFmpeg: ${data.toString()}`);
  });

  ffmpeg.on('error', (error) => {
    logger.error('FFmpeg process error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          code: 'EXPORT_ERROR',
          message: 'Failed to export recordings',
        },
      });
    }
  });

  ffmpeg.on('exit', (code, signal) => {
    if (code !== 0) {
      logger.error(`FFmpeg exited with code ${code}, signal ${signal}`);
    } else {
      logger.info('FFmpeg concatenation completed successfully');
    }
  });
}

module.exports = router;
