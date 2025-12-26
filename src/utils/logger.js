const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || 'info';
const logPath = process.env.LOG_PATH || path.join(__dirname, '../../logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create transports
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, service, context, stack }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (service) log += ` | service: ${service}`;
        if (context) log += ` | context: ${JSON.stringify(context)}`;
        if (stack) log += `\n${stack}`;
        return log;
      })
    ),
  }),
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  // Error log file (errors and warnings)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logPath, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
      maxFiles: '30d',
      format: logFormat,
    })
  );

  // Combined log file (all levels)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logPath, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: logFormat,
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'videox-api' },
  transports,
});

// Create a stream for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
