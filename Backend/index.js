// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { initDatabase } = require('./config/mysql-database');
const SessionManager = require('./utils/sessionManager');
const logger = require('./utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost', 'http://localhost:80'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const port = process.env.PORT || 5000;

// Enhanced CORS configuration with pattern matching
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost', 'http://localhost:80'];

// Check if origin matches allowed patterns
function isOriginAllowed(origin, allowedOrigins) {
  // Allow requests with no origin (same-origin, mobile apps, Postman)
  if (!origin) return true;

  for (const allowed of allowedOrigins) {
    // Special cases for wildcard patterns
    if (allowed === '*') {
      // Full wildcard - allow any origin (NOT RECOMMENDED for production)
      logger.warn('CORS: Wildcard (*) allows ALL origins - security risk!');
      return true;
    }
    
    // Pattern: *.domain.com - allows any subdomain
    if (allowed.startsWith('*.')) {
      const domain = allowed.substring(2); // Remove '*.'
      const originUrl = new URL(origin);
      if (originUrl.hostname === domain || originUrl.hostname.endsWith('.' + domain)) {
        return true;
      }
    }
    
    // Pattern: http://* or https://* - allows any domain with that protocol
    if (allowed === 'http://*' && origin.startsWith('http://')) {
      logger.warn('CORS: http://* allows ALL http origins - security risk!');
      return true;
    }
    if (allowed === 'https://*' && origin.startsWith('https://')) {
      logger.warn('CORS: https://* allows ALL https origins - security risk!');
      return true;
    }
    
    // Exact match
    if (origin === allowed) {
      return true;
    }
  }
  
  return false;
}

const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate limiting — applied after CORS so preflight is unaffected
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many login attempts, please try again later.' }
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// Initialize database
const initializeApp = async () => {
  try {
    await initDatabase();
    logger.info('✅ MySQL database initialized successfully');
    
    // Initialize job queue and processor
    const { createJobQueue, initializeQueueProcessor, setIO } = require('./utils/job-queue');
    setIO(io);
    const queue = createJobQueue();
    initializeQueueProcessor(queue);
    logger.info('✅ Job queue initialized successfully');
    
  } catch (error) {
    logger.error('❌ Database initialization failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Root endpoint - Serve API documentation page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Health check route
const healthRoute = require('./routes/health');
app.use('/health', healthRoute);

// Use routes from routes.js
const routes = require('./routes');
app.use('/api', routes);

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist'
  });
});

// Global error handler - must be last middleware
app.use((err, req, res, next) => {
  // Log error details internally
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Determine if we're in production
  const isProduction = process.env.NODE_ENV === 'production';

  // Send sanitized error to client
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal Server Error' : err.name || 'Error',
    message: isProduction ? 'An unexpected error occurred' : err.message,
    // Only include stack trace in development
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Start the server after database initialization
initializeApp().then(() => {
  // Start automatic session cleanup (every hour)
  SessionManager.startCleanupJob(60);
  
  // Socket.io connection handling
  io.on('connection', (socket) => {
    logger.info(`📱 Client connected: ${socket.id}`);

    // Client must emit 'authenticate' with JWT so we can scope events to that user's room
    socket.on('authenticate', ({ token } = {}) => {
      try {
        if (!token) throw new Error('No token');
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = String(decoded.userId);
        socket.join(`user:${userId}`);
        socket.emit('authenticated', { userId });
        logger.info(`🔐 Socket ${socket.id} authenticated as user ${userId}`);
      } catch (e) {
        logger.warn(`⚠️  Socket auth failed (${socket.id}): ${e.message}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`📱 Client disconnected: ${socket.id}`);
    });
  });
  
  // Make io accessible to routes
  app.locals.io = io;
  
  server.listen(port, () => {
    logger.info(`🚀 Backend server running on http://localhost:${port}`, {
      port,
      nodeEnv: process.env.NODE_ENV || 'development'
    });
  });
});