const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Frontend Error Logging Endpoint
 * POST /api/error-log
 * 
 * Allows frontend to send errors to backend for centralized logging
 * Useful for tracking production issues
 */
router.post('/', (req, res) => {
  try {
    const { 
      message, 
      stack, 
      url, 
      userAgent, 
      userId, 
      componentName,
      severity = 'error',
      metadata = {}
    } = req.body;

    // Log frontend error with structured data
    const logData = {
      source: 'frontend',
      url,
      userAgent,
      userId,
      componentName,
      ...metadata
    };

    if (severity === 'error') {
      logger.error(`[FRONTEND] ${message}`, {
        ...logData,
        stack
      });
    } else if (severity === 'warn') {
      logger.warn(`[FRONTEND] ${message}`, logData);
    } else {
      logger.info(`[FRONTEND] ${message}`, logData);
    }

    res.json({ success: true, message: 'Error logged successfully' });
  } catch (error) {
    logger.error('[ERROR-LOG] Failed to log frontend error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, message: 'Failed to log error' });
  }
});

module.exports = router;
