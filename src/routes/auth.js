const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
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

      // Generate tokens
      const tokenPayload = {
        id: 'admin',
        username: adminUsername,
        role: 'admin',
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ id: 'admin' });

      logger.info(`Admin user logged in successfully`);

      res.json({
        token: accessToken,
        refreshToken,
        user: {
          id: 'admin',
          username: adminUsername,
          role: 'admin',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token (single-user system)
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Refresh token is required',
        },
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    if (decoded.id !== 'admin') {
      return res.status(401).json({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Invalid refresh token',
        },
      });
    }

    // Generate new access token
    const tokenPayload = {
      id: 'admin',
      username: process.env.ADMIN_USERNAME,
      role: 'admin',
    };

    const accessToken = generateAccessToken(tokenPayload);

    res.json({
      token: accessToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, optional server-side blacklisting)
 */
router.post('/logout', (req, res) => {
  // In a simple JWT implementation, logout is handled client-side by removing the token
  // For enhanced security, implement token blacklisting here
  res.json({
    message: 'Logged out successfully',
  });
});

module.exports = router;
