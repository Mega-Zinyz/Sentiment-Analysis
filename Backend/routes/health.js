const express = require('express');
const router = express.Router();
const { getDb } = require('../config/mysql-database');

// Health check endpoint
router.get('/', async (req, res) => {
  const db = getDb();
  
  const health = {
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      api: {
        status: 'online',
        message: 'API is running'
      },
      database: {
        status: 'checking',
        message: 'Checking connection...'
      },
      authentication: {
        status: 'online',
        message: 'Authentication service active'
      }
    },
    server: {
      port: process.env.PORT || 3000,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      nodeVersion: process.version
    }
  };

  // Check database connection
  try {
    await db.execute('SELECT 1');
    health.services.database.status = 'online';
    health.services.database.message = 'Database connected';
  } catch (error) {
    console.error('Health check - Database error:', error.message);
    health.services.database.status = 'offline';
    health.services.database.message = `Connection failed: ${error.message}`;
    health.status = 'degraded';
  }

  const statusCode = health.status === 'online' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
