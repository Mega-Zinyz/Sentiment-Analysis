const crypto = require('crypto');
require('dotenv').config();

// Use a simpler but secure approach
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits

// Get encryption key from environment variable or generate one
const getEncryptionKey = () => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) { // 32 bytes in hex = 64 characters
    return Buffer.from(envKey, 'hex');
  }
  
  // Generate a new key if not provided (for development)
  const key = crypto.randomBytes(KEY_LENGTH);
  console.log('⚠️  Generated new encryption key. Add this to your .env file:');
  console.log(`ENCRYPTION_KEY=${key.toString('hex')}`);
  return key;
};

const ENCRYPTION_KEY = getEncryptionKey();

/**
 * Encrypt sensitive data using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted data in format: iv:encryptedText
 */
const encrypt = (text) => {
  if (!text || text.trim().length === 0) {
    return '';
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Return format: iv:encryptedText (both base64)
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data in format: iv:encryptedText
 * @returns {string} - Decrypted text
 */
const decrypt = (encryptedData) => {
  if (!encryptedData || encryptedData.trim().length === 0) {
    return '';
  }

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Encrypt API credentials object
 * @param {object} credentials - Object containing API credentials
 * @returns {object} - Object with encrypted credentials
 */
const encryptCredentials = (credentials) => {
  const encrypted = {};
  
  // Fields that should be encrypted
  const sensitiveFields = [
    'bearerToken', 
    'bearer_token',
    'apiKey', 
    'api_key',
    'apiSecret', 
    'api_secret',
    'accessToken', 
    'access_token',
    'accessTokenSecret', 
    'access_token_secret'
  ];

  for (const [key, value] of Object.entries(credentials)) {
    if (sensitiveFields.includes(key) && value) {
      encrypted[key] = encrypt(value);
    } else {
      encrypted[key] = value;
    }
  }

  return encrypted;
};

/**
 * Decrypt API credentials object
 * @param {object} encryptedCredentials - Object containing encrypted credentials
 * @returns {object} - Object with decrypted credentials
 */
const decryptCredentials = (encryptedCredentials) => {
  if (!encryptedCredentials) return {};
  
  const decrypted = {};
  
  // Fields that should be decrypted
  const sensitiveFields = [
    'bearerToken', 
    'bearer_token',
    'apiKey', 
    'api_key',
    'apiSecret', 
    'api_secret',
    'accessToken', 
    'access_token',
    'accessTokenSecret', 
    'access_token_secret'
  ];

  for (const [key, value] of Object.entries(encryptedCredentials)) {
    if (sensitiveFields.includes(key) && value) {
      try {
        decrypted[key] = decrypt(value);
      } catch (error) {
        console.error(`Failed to decrypt ${key}:`, error);
        decrypted[key] = '';
      }
    } else {
      decrypted[key] = value;
    }
  }

  return decrypted;
};

/**
 * Mask sensitive data for display purposes
 * @param {string} value - The sensitive value to mask
 * @returns {string} - Masked value showing only last 4 characters
 */
const maskSensitiveValue = (value) => {
  if (!value || value.length <= 4) {
    return '****';
  }
  return '***' + value.slice(-4);
};

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  maskSensitiveValue
};