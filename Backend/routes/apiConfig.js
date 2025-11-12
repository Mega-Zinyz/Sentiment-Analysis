const { getDb } = require('../config/mysql-database');
const { encryptCredentials, decryptCredentials, maskSensitiveValue } = require('../utils/encryption');
const AuditLogger = require('../utils/auditLogger');

// Helper function to get user's API credentials (decrypted)
const getUserCredentials = async (userId) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT * FROM user_api_credentials WHERE user_id = ?', 
      [userId]
    );
    
    if (rows.length === 0) {
      return null;
    }

    // Decrypt the credentials before returning
    const encryptedCredentials = rows[0];
    const decryptedCredentials = decryptCredentials(encryptedCredentials);
    
    return decryptedCredentials;
  } catch (error) {
    console.error('Error getting user credentials:', error);
    throw error;
  }
};

// Helper function to save user's API credentials (encrypted)
const saveUserCredentials = async (userId, credentials) => {
  try {
    const db = getDb();
    // Encrypt credentials before storing
    const encryptedCredentials = encryptCredentials({
      bearer_token: credentials.bearerToken || '',
      api_key: credentials.apiKey || '',
      api_secret: credentials.apiSecret || '',
      access_token: credentials.accessToken || '',
      access_token_secret: credentials.accessTokenSecret || ''
    });

    // Check if credentials exist
    const [existing] = await db.execute(
      'SELECT id FROM user_api_credentials WHERE user_id = ?', 
      [userId]
    );

    if (existing.length > 0) {
      // Update existing credentials
      await db.execute(`
        UPDATE user_api_credentials 
        SET bearer_token = ?, api_key = ?, api_secret = ?, 
            access_token = ?, access_token_secret = ?, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `, [
        encryptedCredentials.bearer_token,
        encryptedCredentials.api_key,
        encryptedCredentials.api_secret,
        encryptedCredentials.access_token,
        encryptedCredentials.access_token_secret,
        userId
      ]);
    } else {
      // Create new credentials
      await db.execute(`
        INSERT INTO user_api_credentials 
        (user_id, bearer_token, api_key, api_secret, access_token, access_token_secret, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        userId,
        encryptedCredentials.bearer_token,
        encryptedCredentials.api_key,
        encryptedCredentials.api_secret,
        encryptedCredentials.access_token,
        encryptedCredentials.access_token_secret
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving user credentials:', error);
    throw error;
  }
};

// Check if user has configured API credentials
const checkCredentialsHandler = async (req, res) => {
  try {
    // Handle case where user is not authenticated (optionalAuth)
    if (!req.user || !req.user.userId) {
      return res.json({
        configured: false,
        hasAdvanced: false,
        message: 'User not authenticated'
      });
    }
    
    console.log('Checking credentials for user:', req.user.userId);
    
    // Audit log credential check
    await AuditLogger.logCredentialAccess(
      req.user.userId, 
      'CREDENTIAL_CHECK', 
      req.ip, 
      req.get('User-Agent')
    );
    
    const credentials = await getUserCredentials(req.user.userId);
    
    if (!credentials) {
      return res.json({
        configured: false,
        hasAdvanced: false,
        message: 'No API credentials configured'
      });
    }

    const isConfigured = !!(credentials.bearer_token && credentials.bearer_token.trim());
    const hasAdvanced = !!(credentials.api_key && credentials.api_secret && credentials.access_token && credentials.access_token_secret);

    console.log('Credentials check result:', { isConfigured, hasAdvanced });
    
    res.json({
      configured: isConfigured,
      hasAdvanced: hasAdvanced,
      message: isConfigured ? 'API credentials configured' : 'API credentials not configured'
    });
  } catch (error) {
    console.error('Check credentials error:', error);
    res.status(500).json({ error: 'Failed to check credentials' });
  }
};

// Configure user's API credentials
const configureCredentialsHandler = async (req, res) => {
  try {
    console.log('Configuring credentials for user:', req.user.userId);
    
    // Audit log credential configuration
    await AuditLogger.logCredentialAccess(
      req.user.userId, 
      'CREDENTIAL_UPDATE', 
      req.ip, 
      req.get('User-Agent'),
      { hasAdvanced: !!(req.body.apiKey) }
    );
    
    const { bearerToken, apiKey, apiSecret, accessToken, accessTokenSecret } = req.body;
    
    if (!bearerToken && !apiKey) {
      return res.status(400).json({ error: 'At least Bearer Token or API Key is required' });
    }

    // Validate advanced credentials if provided
    if (apiKey && (!apiSecret || !accessToken || !accessTokenSecret)) {
      return res.status(400).json({ 
        error: 'If API Key is provided, all advanced credentials (API Secret, Access Token, Access Token Secret) are required' 
      });
    }

    await saveUserCredentials(req.user.userId, {
      bearerToken,
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret
    });

    console.log('✅ Credentials saved successfully for user:', req.user.userId);
    
    res.json({ 
      success: true, 
      message: 'API credentials configured successfully',
      security: 'Credentials are encrypted and stored securely'
    });
  } catch (error) {
    console.error('Configure credentials error:', error);
    res.status(500).json({ error: 'Failed to configure credentials' });
  }
};

// Get credentials status with masked values
const getCredentialsStatusHandler = async (req, res) => {
  try {
    // Handle case where user is not authenticated (optionalAuth)
    if (!req.user || !req.user.userId) {
      return res.json({
        configured: false,
        hasAdvanced: false,
        credentials: {
          bearerToken: '',
          apiKey: '',
          apiSecret: '',
          accessToken: '',
          accessTokenSecret: ''
        }
      });
    }
    
    const credentials = await getUserCredentials(req.user.userId);
    
    if (!credentials) {
      return res.json({
        configured: false,
        hasAdvanced: false,
        credentials: {
          bearerToken: '',
          apiKey: '',
          apiSecret: '',
          accessToken: '',
          accessTokenSecret: ''
        }
      });
    }

    // Return masked values for security
    res.json({
      configured: !!(credentials.bearer_token && credentials.bearer_token.trim()),
      hasAdvanced: !!(credentials.api_key && credentials.api_secret && credentials.access_token && credentials.access_token_secret),
      credentials: {
        bearerToken: credentials.bearer_token ? maskSensitiveValue(credentials.bearer_token) : '',
        apiKey: credentials.api_key ? maskSensitiveValue(credentials.api_key) : '',
        apiSecret: credentials.api_secret ? maskSensitiveValue(credentials.api_secret) : '',
        accessToken: credentials.access_token ? maskSensitiveValue(credentials.access_token) : '',
        accessTokenSecret: credentials.access_token_secret ? maskSensitiveValue(credentials.access_token_secret) : ''
      },
      security: 'All credentials are encrypted at rest'
    });
  } catch (error) {
    console.error('Get credentials status error:', error);
    res.status(500).json({ error: 'Failed to get credentials status' });
  }
};

// Get decrypted credentials for internal use (e.g., API calls)
const getDecryptedCredentialsForUser = async (userId) => {
  try {
    const credentials = await getUserCredentials(userId);
    
    if (credentials && credentials.bearer_token) {
      return {
        bearerToken: credentials.bearer_token,
        apiKey: credentials.api_key,
        apiSecret: credentials.api_secret,
        accessToken: credentials.access_token,
        accessTokenSecret: credentials.access_token_secret
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting decrypted credentials:', error);
    throw error;
  }
};

// Delete user's API credentials
const deleteCredentialsHandler = async (req, res) => {
  try {
    const db = getDb();
    await db.execute(
      'DELETE FROM user_api_credentials WHERE user_id = ?',
      [req.user.userId]
    );

    res.json({ 
      success: true, 
      message: 'API credentials deleted successfully' 
    });
  } catch (error) {
    console.error('Delete credentials error:', error);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
};

// Legacy function name for backwards compatibility
const getUserCredentialsForRequest = async (userId) => {
  return await getDecryptedCredentialsForUser(userId);
};

module.exports = {
  checkCredentialsHandler,
  configureCredentialsHandler,
  getCredentialsStatusHandler,
  getDecryptedCredentialsForUser,
  deleteCredentialsHandler,
  getUserCredentialsForRequest // For backwards compatibility
};