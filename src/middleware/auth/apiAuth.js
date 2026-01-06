const ApiToken = require('../../models/ApiToken');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * API Authentication Middleware
 * Authenticates external clients using API tokens only
 *
 * Methods:
 * 1. Authorization header: Authorization: Bearer <token>
 * 2. Query parameter: ?token=<token> (for simple clients like VLC)
 */
const apiAuth = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fallback to query parameter for simple clients (VLC, curl, etc.)
    if (!token && req.query.token) {
      token = req.query.token;
      logger.debug('Using token from query parameter');
    }

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authentication token (provide via Authorization header or ?token= parameter)',
        },
      });
    }

    // Look up API token
    const apiToken = await ApiToken.findOne({ token, active: true });

    if (!apiToken) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });
    }

    // Check if expired
    if (apiToken.isExpired()) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'API token has expired',
        },
      });
    }

    // Handle single-user admin system (userId: 'admin' from .env)
    if (apiToken.userId === 'admin') {
      req.user = {
        id: 'admin',
        username: process.env.ADMIN_USERNAME,
        role: 'admin',
      };
      req.authType = 'api_token';
      req.apiToken = apiToken;

      // Update last used timestamp (async, don't wait)
      apiToken.updateLastUsed().catch(err => {
        logger.error('Error updating API token last used:', err);
      });

      return next();
    }

    // Handle database users (multi-user system) - populate the user
    await apiToken.populate('userId');

    // Check if user is still active
    if (!apiToken.userId || !apiToken.userId.active) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found or inactive',
        },
      });
    }

    // Update last used timestamp (async, don't wait)
    apiToken.updateLastUsed().catch(err => {
      logger.error('Error updating API token last used:', err);
    });

    req.user = {
      id: apiToken.userId._id,
      username: apiToken.userId.username,
      role: apiToken.userId.role,
    };

    req.authType = 'api_token';
    req.apiToken = apiToken;

    next();
  } catch (error) {
    logger.error('API auth error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error',
      },
    });
  }
};

module.exports = apiAuth;
