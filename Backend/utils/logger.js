const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Configure transports based on environment
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  );
}

// File transports for production (and development if needed)
if (process.env.NODE_ENV === 'production') {
  // Error logs - keep for 30 days
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat
    })
  );

  // Combined logs (info and above) - keep for 14 days
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat
    })
  );

  // Analysis logs - separate file for sentiment analysis operations
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'analysis-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '50m',
      maxFiles: '30d',
      format: logFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transports,
  exitOnError: false
});

// Helper methods for structured logging
logger.logAnalysis = (sessionId, message, meta = {}) => {
  logger.info(`[ANALYSIS:${sessionId}] ${message}`, meta);
};

logger.logAuth = (userId, action, meta = {}) => {
  logger.info(`[AUTH:${userId}] ${action}`, meta);
};

logger.logAPI = (endpoint, method, status, meta = {}) => {
  logger.info(`[API] ${method} ${endpoint} - ${status}`, meta);
};

logger.logError = (context, error, meta = {}) => {
  logger.error(`[${context}] ${error.message}`, {
    ...meta,
    stack: error.stack,
    name: error.name
  });
};

// Suppress verbose console logs in production
if (process.env.NODE_ENV === 'production') {
  // Override console methods in production to use logger
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.log = (...args) => {
    // Only log important messages that start with specific emojis
    const message = args.join(' ');
    if (message.match(/^[✅❌⚠️🔴🟢🔵]/)) {
      logger.info(message);
    }
    // Suppress other console.log in production
  };

  console.error = (...args) => {
    logger.error(args.join(' '));
  };

  console.warn = (...args) => {
    logger.warn(args.join(' '));
  };

  // Keep original for debugging if needed
  console._originalLog = originalConsoleLog;
  console._originalError = originalConsoleError;
  console._originalWarn = originalConsoleWarn;
}

module.exports = logger;
