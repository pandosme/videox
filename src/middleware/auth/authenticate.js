const logger = require('../../utils/logger');

/**
 * Middleware to authenticate requests using session
 * Verifies the session and attaches user info to request
 */
const authenticate = (req, res, next) => {
  try {
    // Check if session exists and has user
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        error: {
          code: 'AUTH_SESSION_MISSING',
          message: 'Authentication required',
        },
      });
    }

    // Attach user info to request
    req.user = req.session.user;
    req.authType = 'session';

    next();
  } catch (error) {
    logger.warn('Authentication failed:', error.message);

    return res.status(401).json({
      error: {
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      },
    });
  }
};

module.exports = authenticate;
