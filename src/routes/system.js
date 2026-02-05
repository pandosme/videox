const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../utils/validators');
const authenticate = require('../middleware/auth/authenticate');
const authorize = require('../middleware/auth/authorize');
const SystemConfig = require('../models/SystemConfig');
const retentionManager = require('../services/retention/retentionManager');
const logger = require('../utils/logger');

// Health endpoint is public (defined in server.js)
// Other system endpoints require admin role

/**
 * GET /api/system/config
 * Get system configuration
 */
router.get('/config', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    // Get retention and storage settings
    const retentionDays = await SystemConfig.getValue('retentionDays', parseInt(process.env.GLOBAL_RETENTION_DAYS) || 30);
    const maxStorageGB = await SystemConfig.getValue('maxStorageGB', null);
    const maxStoragePercent = await SystemConfig.getValue('maxStoragePercent', 90);

    res.json({
      retention: {
        days: retentionDays,
        description: 'Number of days to keep recordings (time-based retention)',
      },
      storage: {
        maxGB: maxStorageGB,
        maxPercent: maxStoragePercent,
        description: 'Storage limits: GB limit for recordings (optional), and disk safety threshold',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/system/config
 * Update system configuration
 */
router.put(
  '/config',
  authenticate,
  authorize(['admin']),
  [
    body('retentionDays')
      .optional()
      .isInt({ min: 1, max: 3650 })
      .withMessage('Retention days must be between 1 and 3650 (10 years)'),
    body('maxStorageGB')
      .optional()
      .isInt({ min: 1, max: 50000 })
      .withMessage('Max storage GB must be between 1 and 50000'),
    body('maxStoragePercent')
      .optional()
      .isInt({ min: 50, max: 99 })
      .withMessage('Disk safety threshold must be between 50 and 99'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { retentionDays, maxStorageGB, maxStoragePercent } = req.body;
      const userId = req.user?.id || 'admin';

      const updates = {};

      if (retentionDays !== undefined) {
        await SystemConfig.setValue('retentionDays', retentionDays, userId);
        updates.retentionDays = retentionDays;
        logger.info(`Retention days updated to ${retentionDays} by ${req.user?.username || 'admin'}`);
      }

      if (maxStorageGB !== undefined) {
        await SystemConfig.setValue('maxStorageGB', maxStorageGB, userId);
        updates.maxStorageGB = maxStorageGB;
        logger.info(`Max storage GB updated to ${maxStorageGB} GB by ${req.user?.username || 'admin'}`);
      }

      if (maxStoragePercent !== undefined) {
        await SystemConfig.setValue('maxStoragePercent', maxStoragePercent, userId);
        updates.maxStoragePercent = maxStoragePercent;
        logger.info(`Disk safety threshold updated to ${maxStoragePercent}% by ${req.user?.username || 'admin'}`);
      }

      res.json({
        message: 'System configuration updated successfully',
        updates,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/system/cleanup
 * Manually trigger retention cleanup
 */
router.post('/cleanup', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    logger.info(`Manual retention cleanup initiated by ${req.user?.username || 'admin'}`);
    
    // Run cleanup in background and return immediately
    const cleanupPromise = retentionManager.runCleanup();
    
    res.json({
      message: 'Retention cleanup initiated',
      status: 'running',
    });

    // Wait for cleanup to complete and log results
    cleanupPromise.then((result) => {
      logger.info(
        `Manual cleanup completed: ${result.deleted} recordings deleted, ` +
        `${result.freedGB} GB freed, ${result.orphansDeleted} orphans removed`
      );
    }).catch((error) => {
      logger.error('Manual cleanup failed:', error);
    });
  } catch (error) {
    next(error);
  }
});

router.get('/logs', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    res.json([]);
  } catch (error) {
    next(error);
  }
});

router.get('/audit', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    res.json([]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
