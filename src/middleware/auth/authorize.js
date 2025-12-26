const logger = require('../../utils/logger');

/**
 * Middleware to authorize requests based on user role
 * Must be used after authenticate middleware
 * @param {Array<string>} allowedRoles - Array of roles that can access the route
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error('Authorization middleware called before authentication');
      return res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Server configuration error',
        },
      });
    }

    const { role } = req.user;

    if (!allowedRoles.includes(role)) {
      logger.warn(`User ${req.user.username} with role ${role} attempted to access restricted resource`);
      return res.status(403).json({
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to access this resource',
        },
      });
    }

    next();
  };
};

module.exports = authorize;
