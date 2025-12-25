const jwt = require('jsonwebtoken');
const ApiToken = require('../../models/ApiToken');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * API Authentication Middleware
 * Supports both JWT tokens and long-lived API tokens
 *
 * JWT: Authorization: Bearer <jwt_token>
 * API: Authorization: Bearer <api_token>
 */
const apiAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
    }

    const token = authHeader.substring(7);

    // Try JWT first
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user || !user.active) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not found or inactive',
          },
        });
      }

      req.user = {
        id: user._id,
        username: user.username,
        role: user.role,
      };

      req.authType = 'jwt';
      return next();
    } catch (jwtError) {
      // JWT verification failed, try API token
      logger.debug('JWT verification failed, trying API token');
    }

    // Try API token
    const apiToken = await ApiToken.findOne({ token, active: true }).populate('userId');

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
