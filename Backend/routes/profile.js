const { getDb } = require('../config/mysql-database');
const bcrypt = require('bcryptjs');
const AuditLogger = require('../utils/auditLogger');
const PlaywrightCrawler = require('../crawlers/playwright-crawler');
const { encryptCredentials, decryptCredentials, maskSensitiveValue } = require('../utils/encryption');

// Get user profile
const getProfileHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;

    // Get user basic info
    const [userRows] = await db.execute(
      'SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];

    // Get API credentials status
    const [credentialsRows] = await db.execute(
      'SELECT expires_at, is_active, created_at, updated_at FROM user_api_credentials WHERE user_id = ?',
      [userId]
    );

    const credentialsInfo = credentialsRows.length > 0 ? {
      hasCredentials: true,
      expiresAt: credentialsRows[0].expires_at,
      isActive: credentialsRows[0].is_active,
      lastUpdated: credentialsRows[0].updated_at,
      isExpired: credentialsRows[0].expires_at ? new Date() > new Date(credentialsRows[0].expires_at) : false
    } : {
      hasCredentials: false,
      expiresAt: null,
      isActive: false,
      lastUpdated: null,
      isExpired: false
    };

    // Get user statistics
    const [analysisCount] = await db.execute(
      'SELECT COUNT(*) as count FROM analysis_history WHERE user_id = ?',
      [userId]
    );

    const [wordLibraryCount] = await db.execute(
      'SELECT COUNT(*) as count FROM word_libraries WHERE user_id = ?',
      [userId]
    );

    console.log('Profile stats - userId:', userId, 'wordLibraryCount:', wordLibraryCount[0].count);

    await AuditLogger.logCredentialAccess(userId, 'PROFILE_VIEW', req.ip, req.get('User-Agent'));

    res.json({
      user,
      credentials: credentialsInfo,
      statistics: {
        totalAnalyses: analysisCount[0].count,
        totalWordLibraries: wordLibraryCount[0].count
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Update user profile (username, email)
const updateProfileHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if username/email already exists (excluding current user)
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
      [username, email, userId]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Update user profile
    await db.execute(
      'UPDATE users SET username = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [username, email, userId]
    );

    // Log the profile update
    await AuditLogger.logCredentialAccess(
      userId, 
      'PROFILE_UPDATE', 
      req.ip, 
      req.get('User-Agent'),
      { updatedFields: ['username', 'email'] }
    );

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: { username, email }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Change password
const changePasswordHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current password hash
    const [userRows] = await db.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userRows[0].password_hash);
    if (!isValidPassword) {
      // Log failed password change attempt
      await AuditLogger.logCredentialAccess(
        userId, 
        'PASSWORD_CHANGE_FAILED', 
        req.ip, 
        req.get('User-Agent')
      );
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.execute(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId]
    );

    // Log successful password change
    await AuditLogger.logCredentialAccess(
      userId, 
      'PASSWORD_CHANGE_SUCCESS', 
      req.ip, 
      req.get('User-Agent')
    );

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Get API credentials for profile view (masked)
const getApiCredentialsHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;

    const [rows] = await db.execute(
      'SELECT * FROM user_api_credentials WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.json({
        configured: false,
        credentials: {
          bearerToken: '',
          apiKey: '',
          apiSecret: '',
          accessToken: '',
          accessTokenSecret: ''
        },
        expiresAt: null,
        isActive: false
      });
    }

    const encryptedCredentials = rows[0];
    const decryptedCredentials = decryptCredentials({
      bearerToken: encryptedCredentials.bearer_token,
      apiKey: encryptedCredentials.api_key,
      apiSecret: encryptedCredentials.api_secret,
      accessToken: encryptedCredentials.access_token,
      accessTokenSecret: encryptedCredentials.access_token_secret,
    });

    await AuditLogger.logCredentialAccess(userId, 'CREDENTIAL_VIEW', req.ip, req.get('User-Agent'));

    res.json({
      configured: true,
      credentials: {
        bearerToken: decryptedCredentials.bearerToken ? maskSensitiveValue(decryptedCredentials.bearerToken) : '',
        apiKey: decryptedCredentials.apiKey ? maskSensitiveValue(decryptedCredentials.apiKey) : '',
        apiSecret: decryptedCredentials.apiSecret ? maskSensitiveValue(decryptedCredentials.apiSecret) : '',
        accessToken: decryptedCredentials.accessToken ? maskSensitiveValue(decryptedCredentials.accessToken) : '',
        accessTokenSecret: decryptedCredentials.accessTokenSecret ? maskSensitiveValue(decryptedCredentials.accessTokenSecret) : ''
      },
      expiresAt: encryptedCredentials.expires_at,
      isActive: encryptedCredentials.is_active,
      isExpired: encryptedCredentials.expires_at ? new Date() > new Date(encryptedCredentials.expires_at) : false,
      lastUpdated: encryptedCredentials.updated_at
    });
  } catch (error) {
    console.error('Get API credentials error:', error);
    res.status(500).json({ error: 'Failed to get API credentials' });
  }
};

// Update API credentials with expiry
const updateApiCredentialsHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const { bearerToken, apiKey, apiSecret, accessToken, accessTokenSecret, expiresAt } = req.body;

    if (!bearerToken && !apiKey) {
      return res.status(400).json({ error: 'Bearer Token or API Key is required' });
    }

    if (apiKey && (!apiSecret || !accessToken || !accessTokenSecret)) {
      return res.status(400).json({
        error: 'If API Key is provided, all advanced credentials are required'
      });
    }

    let expiryDate = null;
    if (expiresAt) {
      expiryDate = new Date(expiresAt);
      if (expiryDate <= new Date()) {
        return res.status(400).json({ error: 'Expiry date must be in the future' });
      }
    }

    const encryptedCredentials = encryptCredentials({
      bearer_token: bearerToken || '',
      api_key: apiKey || '',
      api_secret: apiSecret || '',
      access_token: accessToken || '',
      access_token_secret: accessTokenSecret || ''
    });

    const [existing] = await db.execute(
      'SELECT id FROM user_api_credentials WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      await db.execute(`
        UPDATE user_api_credentials
        SET bearer_token = ?, api_key = ?, api_secret = ?,
            access_token = ?, access_token_secret = ?, expires_at = ?, is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [
        encryptedCredentials.bearer_token,
        encryptedCredentials.api_key,
        encryptedCredentials.api_secret,
        encryptedCredentials.access_token,
        encryptedCredentials.access_token_secret,
        expiryDate,
        userId
      ]);
    } else {
      await db.execute(`
        INSERT INTO user_api_credentials
        (user_id, bearer_token, api_key, api_secret, access_token, access_token_secret, expires_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [
        userId,
        encryptedCredentials.bearer_token,
        encryptedCredentials.api_key,
        encryptedCredentials.api_secret,
        encryptedCredentials.access_token,
        encryptedCredentials.access_token_secret,
        expiryDate
      ]);
    }

    // Log credential update
    await AuditLogger.logCredentialAccess(
      userId, 
      'CREDENTIAL_UPDATE', 
      req.ip, 
      req.get('User-Agent'),
      { 
        hasAdvanced: !!(apiKey),
        hasExpiry: !!(expiryDate),
        expiresAt: expiryDate
      }
    );

    res.json({ 
      success: true, 
      message: 'API credentials updated successfully',
      expiresAt: expiryDate,
      isActive: true
    });
  } catch (error) {
    console.error('Update API credentials error:', error);
    res.status(500).json({ error: 'Failed to update API credentials' });
  }
};

// Delete API credentials
const deleteApiCredentialsHandler = async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;

    await db.execute(
      'DELETE FROM user_api_credentials WHERE user_id = ?',
      [userId]
    );

    // Log credential deletion
    await AuditLogger.logCredentialAccess(
      userId, 
      'CREDENTIAL_DELETE', 
      req.ip, 
      req.get('User-Agent')
    );

    res.json({ 
      success: true, 
      message: 'API credentials deleted successfully' 
    });
  } catch (error) {
    console.error('Delete API credentials error:', error);
    res.status(500).json({ error: 'Failed to delete API credentials' });
  }
};

const verifyXCredentialsHandler = (_req, res) => {
  res.status(410).json({ error: 'Username/password login removed — use session cookies instead' });
};

// Save X.com session cookies (bypasses bot detection)
const saveCookiesHandler = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { cookies } = req.body;
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: 'cookies must be a non-empty array' });
    }
    const db = getDb();
    const cookieJson = JSON.stringify(cookies);
    const [existing] = await db.execute('SELECT id FROM user_api_credentials WHERE user_id = ?', [userId]);
    if (existing.length > 0) {
      await db.execute(
        'UPDATE user_api_credentials SET x_cookies = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [cookieJson, userId]
      );
    } else {
      await db.execute(
        'INSERT INTO user_api_credentials (user_id, x_cookies, is_active) VALUES (?, ?, TRUE)',
        [userId, cookieJson]
      );
    }
    res.json({ success: true, message: `Saved ${cookies.length} cookies`, count: cookies.length });
  } catch (error) {
    console.error('Save cookies error:', error);
    res.status(500).json({ error: 'Failed to save cookies' });
  }
};

// Delete X.com session cookies
const deleteCookiesHandler = async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = getDb();
    await db.execute(
      'UPDATE user_api_credentials SET x_cookies = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [userId]
    );
    res.json({ success: true, message: 'Cookies deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete cookies' });
  }
};

// Get cookie status (count only, never expose actual values)
const getCookieStatusHandler = async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT x_cookies, updated_at FROM user_api_credentials WHERE user_id = ? AND is_active = TRUE LIMIT 1',
      [userId]
    );
    if (!rows.length || !rows[0].x_cookies) {
      return res.json({ hasCookies: false, count: 0 });
    }
    const cookies = JSON.parse(rows[0].x_cookies);
    res.json({ hasCookies: true, count: cookies.length, updatedAt: rows[0].updated_at });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cookie status' });
  }
};

module.exports = {
  getProfileHandler,
  updateProfileHandler,
  changePasswordHandler,
  getApiCredentialsHandler,
  updateApiCredentialsHandler,
  deleteApiCredentialsHandler,
  verifyXCredentialsHandler,
  saveCookiesHandler,
  getCookieStatusHandler,
  deleteCookiesHandler
};