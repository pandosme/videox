const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authenticate = require('../middleware/auth/authenticate');
const authorize = require('../middleware/auth/authorize');
const { validate } = require('../utils/validators');
const Camera = require('../models/Camera');
const AuditLog = require('../models/AuditLog');
const vapixService = require('../services/camera/vapixService');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

// All camera routes require authentication
router.use(authenticate);

/**
 * GET /api/cameras
 * Get all cameras with optional filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, tags, limit = 50, offset = 0 } = req.query;

    const query = {};

    if (status) {
      query['status.connectionState'] = status;
    }

    if (tags) {
      query['metadata.tags'] = { $in: tags.split(',') };
    }

    const cameras = await Camera.find(query)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    // Decrypt passwords before sending (or omit them)
    const camerasWithoutPasswords = cameras.map(camera => {
      const cam = camera.toObject();
      delete cam.credentials.password; // Don't send encrypted password to frontend
      return cam;
    });

    res.json(camerasWithoutPasswords);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/cameras/:serial
 * Get camera by serial number
 */
router.get('/:serial', async (req, res, next) => {
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

    const cam = camera.toObject();
    delete cam.credentials.password; // Don't send encrypted password

    res.json(cam);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cameras
 * Add a new camera (Admin or Operator only)
 */
router.post(
  '/',
  authorize(['admin', 'operator']),
  [
    body('name').trim().notEmpty().withMessage('Camera name is required'),
    body('address').trim().notEmpty().withMessage('Camera address is required'),
    body('credentials.username').notEmpty().withMessage('Username is required'),
    body('credentials.password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { name, address, credentials, streamSettings, recordingSettings, metadata } = req.body;
      const httpPort = req.body.port || 80; // HTTP port for VAPIX API

      logger.info(`Adding new camera: ${name} at ${address}`);

      // Test connection and get camera info via VAPIX
      const testResult = await vapixService.testConnection(
        address,
        httpPort,
        554,
        credentials.username,
        credentials.password
      );

      if (!testResult.connected) {
        return res.status(400).json({
          error: {
            code: 'CAMERA_CONNECTION_FAILED',
            message: `Failed to connect to camera: ${testResult.error}`,
          },
        });
      }

      const serial = testResult.serial;

      // Check if camera already exists
      const existingCamera = await Camera.findById(serial);
      if (existingCamera) {
        return res.status(409).json({
          error: {
            code: 'CAMERA_ALREADY_EXISTS',
            message: 'A camera with this serial number already exists',
            details: { serial },
          },
        });
      }

      // Encrypt password
      const encryptedPassword = encrypt(credentials.password);

      // Create camera document
      const camera = new Camera({
        _id: serial,
        name,
        address,
        // port defaults to 554 (RTSP port) in the schema
        credentials: {
          username: credentials.username,
          password: encryptedPassword,
        },
        streamSettings: streamSettings || {},
        recordingSettings: recordingSettings || {},
        metadata: {
          model: testResult.model,
          firmware: testResult.firmware,
          location: metadata?.location,
          tags: metadata?.tags || [],
          capabilities: testResult.capabilities,
        },
        status: {
          connectionState: 'online',
          lastSeen: new Date(),
          recordingState: 'stopped',
        },
      });

      await camera.save();

      // Log audit entry
      await AuditLog.log(req.user.id, 'camera.add', serial, {
        name,
        address,
        model: testResult.model,
      });

      logger.info(`Camera added successfully: ${serial}`);

      const result = camera.toObject();
      delete result.credentials.password;

      res.status(201).json(result);
    } catch (error) {
      logger.error('Error adding camera:', error);
      next(error);
    }
  }
);

/**
 * PUT /api/cameras/:serial
 * Update camera settings (Admin or Operator only)
 */
router.put('/:serial', authorize(['admin', 'operator']), async (req, res, next) => {
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

    const { name, streamSettings, recordingSettings, retentionDays, active, metadata } = req.body;

    // Update fields if provided
    if (name) camera.name = name;
    if (streamSettings) camera.streamSettings = { ...camera.streamSettings, ...streamSettings };
    if (recordingSettings) camera.recordingSettings = { ...camera.recordingSettings, ...recordingSettings };
    if (retentionDays !== undefined) camera.retentionDays = retentionDays;
    if (active !== undefined) camera.active = active;
    if (metadata) {
      camera.metadata = {
        ...camera.metadata,
        location: metadata.location || camera.metadata.location,
        tags: metadata.tags || camera.metadata.tags,
      };
    }

    await camera.save();

    // Log audit entry
    await AuditLog.log(req.user.id, 'camera.update', req.params.serial, req.body);

    logger.info(`Camera updated: ${req.params.serial}`);

    const result = camera.toObject();
    delete result.credentials.password;

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/cameras/:serial
 * Delete a camera (Admin only)
 */
router.delete('/:serial', authorize(['admin']), async (req, res, next) => {
  try {
    const camera = await Camera.findByIdAndDelete(req.params.serial);

    if (!camera) {
      return res.status(404).json({
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: 'Camera not found',
        },
      });
    }

    // Log audit entry
    await AuditLog.log(req.user.id, 'camera.delete', req.params.serial, {
      name: camera.name,
      address: camera.address,
    });

    logger.info(`Camera deleted: ${req.params.serial}`);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cameras/test
 * Test connection to a camera (before adding it)
 */
router.post('/test', authorize(['admin', 'operator']), async (req, res, next) => {
  try {
    const { address, port = 80, credentials } = req.body;

    if (!address || !credentials?.username || !credentials?.password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Address, username, and password are required',
        },
      });
    }

    const testResult = await vapixService.testConnection(
      address,
      port,
      554,
      credentials.username,
      credentials.password
    );

    res.json(testResult);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cameras/:serial/snapshot
 * Capture snapshot from camera
 */
router.post('/:serial/snapshot', async (req, res, next) => {
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

    // Decrypt password
    const password = decrypt(camera.credentials.password);

    const snapshot = await vapixService.captureSnapshot(
      camera.address,
      camera.port || 80,
      camera.credentials.username,
      password,
      camera.streamSettings.resolution
    );

    res.set('Content-Type', 'image/jpeg');
    res.send(snapshot);
  } catch (error) {
    logger.error('Error capturing snapshot:', error);
    next(error);
  }
});

/**
 * GET /api/cameras/:serial/status
 * Get real-time camera status
 */
router.get('/:serial/status', async (req, res, next) => {
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

    res.json({
      connectionState: camera.status.connectionState,
      recordingState: camera.status.recordingState,
      lastSeen: camera.status.lastSeen,
      currentBitrate: camera.status.currentBitrate,
      currentFps: camera.status.currentFps,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
