const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Database configuration for XAMPP
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sentiment_analysis',
  charset: 'utf8mb4',
  timezone: '+00:00',
  connectTimeout: 60000,
  multipleStatements: true
};

let connection = null;

// Initialize database connection
const initDatabase = async () => {
  try {
    console.log('Connecting to MySQL database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database successfully');
    
    // Test the connection
    await connection.execute('SELECT 1');
    console.log('✅ Database connection test successful');
    
    // Create tables if they don't exist
    await createTables();
    await createDefaultData();
    
    return connection;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    
    // If database doesn't exist, try to create it
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('Database does not exist, attempting to create...');
      await createDatabase();
      return initDatabase(); // Retry connection
    }
    
    throw error;
  }
};

// Create database if it doesn't exist
const createDatabase = async () => {
  try {
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();
    console.log('✅ Database created successfully');
  } catch (error) {
    console.error('❌ Failed to create database:', error);
    throw error;
  }
};

// Create tables
const createTables = async () => {
  try {
    console.log('Creating database tables...');
    
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB
    `);

    // User API credentials table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_api_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        bearer_token TEXT,
        api_key VARCHAR(255),
        api_secret VARCHAR(255),
        access_token VARCHAR(255),
        access_token_secret VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB
    `);

    // User sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INT NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB
    `);

    // Analysis history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        keyword VARCHAR(255),
        tweet_count INT,
        results LONGTEXT,
        dataset_used VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_keyword (keyword),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);

    // Word libraries table (Training Data)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS word_libraries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);

    // Word library words table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS word_library_words (
        id INT AUTO_INCREMENT PRIMARY KEY,
        library_id INT NOT NULL,
        word VARCHAR(255) NOT NULL,
        sentiment ENUM('positive', 'negative', 'neutral') NOT NULL,
        weight DECIMAL(3,2) DEFAULT 1.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (library_id) REFERENCES word_libraries(id) ON DELETE CASCADE,
        UNIQUE KEY unique_word_per_library (library_id, word),
        INDEX idx_library_id (library_id),
        INDEX idx_sentiment (sentiment)
      ) ENGINE=InnoDB
    `);

    // Word library samples table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS word_library_samples (
        id INT AUTO_INCREMENT PRIMARY KEY,
        library_id INT NOT NULL,
        user_id INT NOT NULL,
        tweet_text TEXT NOT NULL,
        sentiment ENUM('positive', 'negative', 'neutral') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (library_id) REFERENCES word_libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_library_id (library_id),
        INDEX idx_user_id (user_id),
        INDEX idx_sentiment (sentiment),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);

    console.log('✅ Database tables created successfully');
  } catch (error) {
    console.error('❌ Failed to create tables:', error);
    throw error;
  }
};

// Create default data
const createDefaultData = async () => {
  try {
    console.log('Creating default data...');
    
    // Check if admin user exists
    const [adminRows] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      ['admin']
    );

    if (adminRows.length === 0) {
      // Create default admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const [adminResult] = await connection.execute(
        'INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@sentimentanalysis.com', hashedPassword, 'admin', true]
      );
      
      const adminId = adminResult.insertId;
      console.log('✅ Default admin user created');
    } else {
      console.log('✅ Admin user already exists');
    }
    
  } catch (error) {
    console.error('❌ Failed to create default data:', error);
    throw error;
  }
};

// Get database connection
const getDb = () => {
  if (!connection) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return connection;
};

// Close database connection
const closeDb = async () => {
  if (connection) {
    await connection.end();
    connection = null;
    console.log('✅ Database connection closed');
  }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await connection.execute(query, params);
    return results;
  } catch (error) {
    console.error('❌ Query execution failed:', error);
    throw error;
  }
};

module.exports = {
  initDatabase,
  getDb,
  closeDb,
  executeQuery,
  dbConfig
};