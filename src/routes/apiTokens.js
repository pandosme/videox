const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth/authenticate');
const ApiToken = require('../models/ApiToken');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

router.use(authenticate);

/**
 * GET /api/tokens
 * Get user's API tokens
 */
router.get('/', async (req, res, next) => {
  try {
    const tokens = await ApiToken.find({ userId: req.user.id })
      .select('-token') // Don't return actual token values
      .sort({ createdAt: -1 });

    res.json(tokens);
  } catch (error) {
    logger.error('Error fetching API tokens:', error);
    next(error);
  }
});

/**
 * POST /api/tokens
 * Create new API token
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, expiresInDays } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token name is required',
        },
      });
    }

    // Generate secure token
    const token = ApiToken.generateToken();

    // Calculate expiration date
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10));
    }

    const apiToken = new ApiToken({
      userId: req.user.id,
      name: name.trim(),
      token,
      expiresAt,
    });

    await apiToken.save();

    // Log audit entry
    await AuditLog.log(req.user.id, 'api_token.create', apiToken._id, {
      name: apiToken.name,
      expiresAt: apiToken.expiresAt,
    });

    logger.info(`API token created: ${apiToken.name} for user ${req.user.username}`);

    // Return token with actual token value (only time it's shown)
    res.status(201).json({
      _id: apiToken._id,
      name: apiToken.name,
      token: apiToken.token,
      expiresAt: apiToken.expiresAt,
      active: apiToken.active,
      createdAt: apiToken.createdAt,
      warning: 'Save this token now - it will not be shown again!',
    });
  } catch (error) {
    logger.error('Error creating API token:', error);
    next(error);
  }
});

/**
 * DELETE /api/tokens/:id
 * Delete API token
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const apiToken = await ApiToken.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!apiToken) {
      return res.status(404).json({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'API token not found',
        },
      });
    }

    await ApiToken.deleteOne({ _id: req.params.id });

    // Log audit entry
    await AuditLog.log(req.user.id, 'api_token.delete', apiToken._id, {
      name: apiToken.name,
    });

    logger.info(`API token deleted: ${apiToken.name} by user ${req.user.username}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting API token:', error);
    next(error);
  }
});

/**
 * PATCH /api/tokens/:id/toggle
 * Toggle API token active status
 */
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const apiToken = await ApiToken.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!apiToken) {
      return res.status(404).json({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'API token not found',
        },
      });
    }

    apiToken.active = !apiToken.active;
    await apiToken.save();

    // Log audit entry
    await AuditLog.log(req.user.id, 'api_token.toggle', apiToken._id, {
      name: apiToken.name,
      active: apiToken.active,
    });

    logger.info(`API token ${apiToken.active ? 'activated' : 'deactivated'}: ${apiToken.name}`);

    res.json({
      _id: apiToken._id,
      name: apiToken.name,
      active: apiToken.active,
      expiresAt: apiToken.expiresAt,
      lastUsed: apiToken.lastUsed,
    });
  } catch (error) {
    logger.error('Error toggling API token:', error);
    next(error);
  }
});

module.exports = router;
