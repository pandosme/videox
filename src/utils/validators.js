const { validationResult } = require('express-validator');

/**
 * Middleware to validate request using express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean}
 */
const isValidIP = (ip) => {
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Validate hostname format
 * @param {string} hostname - Hostname to validate
 * @returns {boolean}
 */
const isValidHostname = (hostname) => {
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return hostnameRegex.test(hostname);
};

/**
 * Validate port number
 * @param {number} port - Port number to validate
 * @returns {boolean}
 */
const isValidPort = (port) => {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
};

/**
 * Validate resolution format (e.g., "1920x1080")
 * @param {string} resolution - Resolution string to validate
 * @returns {boolean}
 */
const isValidResolution = (resolution) => {
  const resolutionRegex = /^\d{2,4}x\d{2,4}$/;
  return resolutionRegex.test(resolution);
};

/**
 * Sanitize string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string}
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
};

/**
 * Validate cron expression format
 * @param {string} cronExpr - Cron expression to validate
 * @returns {boolean}
 */
const isValidCronExpression = (cronExpr) => {
  // Basic validation for cron expression (5 or 6 fields)
  const parts = cronExpr.split(' ');
  return parts.length === 5 || parts.length === 6;
};

module.exports = {
  validate,
  isValidIP,
  isValidHostname,
  isValidPort,
  isValidResolution,
  sanitizeString,
  isValidCronExpression,
};
