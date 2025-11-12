/**
 * Safe error response utility
 * Prevents exposing internal details in production
 */

const logger = require('./logger');

/**
 * Send a safe error response to the client
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {Number} statusCode - HTTP status code (default: 500)
 * @param {String} userMessage - User-friendly message (optional)
 */
function sendErrorResponse(res, error, statusCode = 500, userMessage = null) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Log the full error internally
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    statusCode
  });

  // Prepare response
  const response = {
    error: true,
    message: userMessage || (isProduction ? 'An error occurred' : error.message)
  };

  // In development, include additional debug info
  if (!isProduction) {
    response.details = error.message;
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {String} message - Validation error message
 * @param {Object} errors - Validation errors object (optional)
 */
function sendValidationError(res, message, errors = null) {
  const response = {
    error: true,
    message,
    type: 'validation'
  };

  if (errors) {
    response.errors = errors;
  }

  res.status(400).json(response);
}

/**
 * Send a not found error response
 * @param {Object} res - Express response object
 * @param {String} resource - Resource name that was not found
 */
function sendNotFoundError(res, resource = 'Resource') {
  res.status(404).json({
    error: true,
    message: `${resource} not found`
  });
}

/**
 * Send an unauthorized error response
 * @param {Object} res - Express response object
 * @param {String} message - Custom message (optional)
 */
function sendUnauthorizedError(res, message = 'Unauthorized access') {
  res.status(401).json({
    error: true,
    message
  });
}

/**
 * Send a forbidden error response
 * @param {Object} res - Express response object
 * @param {String} message - Custom message (optional)
 */
function sendForbiddenError(res, message = 'Access forbidden') {
  res.status(403).json({
    error: true,
    message
  });
}

module.exports = {
  sendErrorResponse,
  sendValidationError,
  sendNotFoundError,
  sendUnauthorizedError,
  sendForbiddenError
};
