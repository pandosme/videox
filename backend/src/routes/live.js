const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const authenticate = require('../middleware/auth/authenticate');
const Camera = require('../models/Camera');
const hlsStreamManager = require('../services/stream/hlsStreamManager');
const logger = require('../utils/logger');

// All live stream routes require authentication
router.use(authenticate);

/**
 * GET /api/live/:serial/start
 * Start live stream for a camera
 */
router.get('/:serial/start', async (req, res, next) => {
  try {
    const camera = await Camera.findById(req.params.serial);

    if (!camera) {
      return res.status(404).json({
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: 'Camera not found',
        },
      });
    }

    // Start HLS stream
    const playlistPath = await hlsStreamManager.startStream(camera);

    logger.info(`Live stream started for camera: ${req.params.serial}`);

    res.json({
      success: true,
      cameraId: camera._id,
      playlistUrl: hlsStreamManager.getPlaylistPath(camera._id),
    });
  } catch (error) {
    logger.error('Error starting live stream:', error);
    next(error);
  }
});

/**
 * GET /api/live/:serial/stop
 * Stop live stream for a camera
 */
router.get('/:serial/stop', async (req, res, next) => {
  try {
    await hlsStreamManager.stopStream(req.params.serial);

    logger.info(`Live stream stopped for camera: ${req.params.serial}`);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Error stopping live stream:', error);
    next(error);
  }
});

/**
 * GET /api/live/:serial/status
 * Get stream status for a camera
 */
router.get('/:serial/status', (req, res) => {
  const streamInfo = hlsStreamManager.getStreamInfo(req.params.serial);

  if (!streamInfo) {
    return res.json({
      running: false,
    });
  }

  res.json(streamInfo);
});

/**
 * GET /api/live/active
 * Get all active streams
 */
router.get('/active', (req, res) => {
  const streams = hlsStreamManager.getAllStreams();
  res.json(streams);
});

module.exports = router;
