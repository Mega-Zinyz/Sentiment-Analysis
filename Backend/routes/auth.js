const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/mysql-database');
const AuditLogger = require('../utils/auditLogger');
const { withRetry } = require('../utils/requestGuard');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Register new user
const registerHandler = async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if username already exists
    const db = getDb();
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ 
        error: 'Username or email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [username, email, hashedPassword, 'user', true]
    );

    const userId = result.insertId;

    console.log('✅ User registered successfully:', username);
    
    res.status(201).json({ 
      success: true, 
      message: 'User registered successfully',
      userId: userId
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
const loginHandler = async (req, res) => {
  const { username, password } = req.body;
  
  console.log('Login attempt for username:', username);
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Get user
    console.log('Login handler started.');
    const db = getDb();
    console.log('Database connection obtained.');
    
    const [users] = await withRetry(async () => {
      return db.execute(
        'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
        [username]
      );
    }, {
      retries: 2,
      baseDelayMs: 400,
      shouldRetry: (error) => /ECONNRESET|ETIMEDOUT|deadlock|timeout|temporar/i.test(error.message || ''),
      logger: console,
      operationName: 'auth lookup'
    });

    console.log('User query executed. Found:', users.length);

    if (users.length === 0) {
      console.log('No active user found for username:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = users[0];
    console.log('User found:', user.username);

    console.log('Comparing password...');
    const isValidPassword = await withRetry(async () => bcrypt.compare(password, user.password_hash), {
      retries: 1,
      baseDelayMs: 300,
      shouldRetry: (error) => /ECONNRESET|ETIMEDOUT|temporar/i.test(error.message || ''),
      logger: console,
      operationName: 'password validation'
    });
    console.log('Password comparison result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Password validation failed for user:', username);
      await AuditLogger.logAuthEvent(user.id, 'AUTH_LOGIN_FAILED', req.ip, req.get('User-Agent'));
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    console.log('Password is valid. Generating token...');
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    console.log('Token generated.');

    console.log('Saving session to database...');
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await withRetry(async () => {
      return db.execute(
        'INSERT INTO user_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, NOW())',
        [sessionId, user.id, token, expiresAt]
      );
    }, {
      retries: 2,
      baseDelayMs: 400,
      shouldRetry: (error) => /ECONNRESET|ETIMEDOUT|deadlock|timeout|temporar/i.test(error.message || ''),
      logger: console,
      operationName: 'session insert'
    });
    console.log('Session saved.');

    console.log('✅ User logged in successfully:', username);
    await AuditLogger.logAuthEvent(user.id, 'AUTH_LOGIN_SUCCESS', req.ip, req.get('User-Agent'));
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Logout user
const logoutHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Remove session from database
      const db = getDb();
      await db.execute(
        'DELETE FROM user_sessions WHERE token = ?',
        [token]
      );
    }

    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Get user profile
const profileHandler = async (req, res) => {
  try {
    const db = getDb();
    const [users] = await db.execute(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

module.exports = {
  registerHandler,
  loginHandler,
  logoutHandler,
  profileHandler
};