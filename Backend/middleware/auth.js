const jwt = require('jsonwebtoken');
const { getDb } = require('../config/mysql-database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Debug JWT secret on startup
console.log('🔑 JWT_SECRET configured:', JWT_SECRET ? 'Yes' : 'No');
console.log('🔑 JWT_SECRET length:', JWT_SECRET ? JWT_SECRET.length : 0);

// Track which users have been logged (so we only log once per session)
const loggedUsers = new Set();

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  // For export endpoints, also check query parameter (for direct download links)
  if (!token && req.query.token) {
    token = req.query.token;
    console.log('🔍 Using token from query parameter');
  }
  
  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if session exists and is valid
    const db = getDb();
    const [sessions] = await db.execute(
      'SELECT * FROM user_sessions WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    
    const session = sessions.length > 0 ? sessions[0] : null;
    
    if (!session) {
      console.log('❌ No valid session found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user details
    const [users] = await db.execute(
      'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
      [decoded.userId]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found or inactive');
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    const user = users[0];
    
    // Log authentication only once per user session
    const userKey = `${user.id}_${token.slice(-8)}`;
    if (!loggedUsers.has(userKey)) {
      console.log('🔍 Verifying JWT token...');
      console.log('✅ JWT verified for user:', decoded.userId);
      console.log('🔍 Checking session in database...');
      console.log('📊 Sessions found:', sessions.length);
      console.log('🔍 Getting user details for ID:', decoded.userId);
      console.log('✅ User authenticated:', user.username);
      loggedUsers.add(userKey);
    }
    
    // Attach user info to request
    req.user = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

// Optional authentication (for public endpoints that can work with or without auth)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const db = getDb();
    const [sessions] = await db.execute(
      'SELECT * FROM user_sessions WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    
    if (sessions.length > 0) {
      const [users] = await db.execute(
        'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
        [decoded.userId]
      );
      
      if (users.length > 0) {
        const user = users[0];
        req.user = {
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        };
      }
    }
  } catch (error) {
    // Ignore auth errors for optional auth
    console.log('Optional auth error (ignored):', error.message);
    req.user = null;
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth
};