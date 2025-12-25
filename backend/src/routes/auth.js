const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { validate } = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * POST /api/auth/login
 * Login with username and password
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

      // Find user
      const user = await User.findOne({ username: username.toLowerCase() });

      if (!user || !user.active) {
        return res.status(401).json({
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
      }

      // Generate tokens
      const tokenPayload = {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ id: user._id.toString() });

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      logger.info(`User ${username} logged in successfully`);

      res.json({
        token: accessToken,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
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

    // Find user
    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Invalid refresh token',
        },
      });
    }

    // Generate new access token
    const tokenPayload = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
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
