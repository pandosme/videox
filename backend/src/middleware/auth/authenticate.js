const { verifyToken } = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * Middleware to authenticate requests using JWT
 * Verifies the JWT token and attaches user info to request
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Authorization token is required',
        },
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    // Attach user info to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (error) {
    logger.warn('Authentication failed:', error.message);

    if (error.message === 'Token expired') {
      return res.status(401).json({
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
    }

    return res.status(401).json({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    });
  }
};

module.exports = authenticate;
