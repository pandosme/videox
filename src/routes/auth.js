const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * POST /api/auth/login
 * Login with username and password (single-user system using .env credentials)
 */
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { username, password } = req.body;

      // Verify credentials against .env
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (username !== adminUsername || password !== adminPassword) {
        return res.status(401).json({
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
      }

      // Store user in session
      req.session.user = {
        id: 'admin',
        username: adminUsername,
        role: 'admin',
      };

      // Save session before responding
      req.session.save((err) => {
        if (err) {
          logger.error('Session save error:', err);
          return res.status(500).json({
            error: {
              code: 'SESSION_ERROR',
              message: 'Failed to create session',
            },
          });
        }

        logger.info(`Admin user logged in successfully`);

        res.json({
          user: {
            id: 'admin',
            username: adminUsername,
            role: 'admin',
          },
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout (destroy session)
 */
router.post('/logout', async (req, res, next) => {
  try {
    if (req.session) {
      const username = req.session.user?.username || 'unknown';

      req.session.destroy((err) => {
        if (err) {
          logger.error('Session destruction error:', err);
          return res.status(500).json({
            error: {
              code: 'LOGOUT_ERROR',
              message: 'Failed to logout',
            },
          });
        }

        res.clearCookie('connect.sid'); // Clear session cookie
        logger.info(`User ${username} logged out successfully`);

        res.json({ message: 'Logged out successfully' });
      });
    } else {
      res.json({ message: 'No active session' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/session
 * Get current session user info
 */
router.get('/session', async (req, res, next) => {
  try {
    if (req.session?.user) {
      res.json({
        user: req.session.user,
      });
    } else {
      res.status(401).json({
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'No active session',
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
