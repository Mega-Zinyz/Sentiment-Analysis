#!/usr/bin/env node

// Database setup script for MySQL
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const setupDatabase = async () => {
  console.log('🚀 Setting up MySQL database for Sentiment Analysis...\n');
  
  // Get database credentials for XAMPP
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    connectTimeout: 60000
  };
  
  try {
    console.log('📡 Connecting to MySQL server...');
    const connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to MySQL server');
    
    // Create database first
    console.log('📋 Creating database...');
    try {
      await connection.execute(`
        CREATE DATABASE IF NOT EXISTS sentiment_analysis 
        CHARACTER SET utf8mb4 
        COLLATE utf8mb4_unicode_ci
      `);
      console.log('✅ Database created successfully');
    } catch (dbError) {
      console.log('⚠️  Database creation error:', dbError.message);
      // Continue anyway in case database already exists
    }
    
    // Close current connection and reconnect to the specific database
    await connection.end();
    
    console.log('🔄 Reconnecting to sentiment_analysis database...');
    const dbConnection = await mysql.createConnection({
      ...dbConfig,
      database: 'sentiment_analysis'
    });
    
    console.log('✅ Connected to sentiment_analysis database');
    
    console.log('📋 Creating tables...');
    
    // Create tables one by one for better compatibility
    await dbConnection.execute(`
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
    
    await dbConnection.execute(`
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
    
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS user_datasets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        data LONGTEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_default (is_default),
        INDEX idx_name (name)
      ) ENGINE=InnoDB
    `);
    
    await dbConnection.execute(`
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

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS raw_twitter_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(100) NOT NULL,
        raw_data TEXT NOT NULL,
        timestamp_extracted DATETIME,
        username_extracted VARCHAR(100),
        clean_text TEXT,
        sentiment_label ENUM('Positive', 'Negative', 'Neutral') DEFAULT NULL,
        is_training_sample BOOLEAN DEFAULT FALSE,
        predicted_sentiment ENUM('Positive', 'Negative', 'Neutral') DEFAULT NULL,
        prediction_confidence DECIMAL(5,4) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_session_id (session_id),
        INDEX idx_sentiment_label (sentiment_label),
        INDEX idx_is_training (is_training_sample),
        INDEX idx_predicted_sentiment (predicted_sentiment)
      ) ENGINE=InnoDB
    `);
    
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(100) NOT NULL,
        session_name VARCHAR(255) NOT NULL,
        analysis_type ENUM('manual', 'api') DEFAULT 'manual',
        source_description TEXT,
        total_items INT DEFAULT 0,
        processed_items INT DEFAULT 0,
        training_samples INT DEFAULT 0,
        results LONGTEXT,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        error_message TEXT,
        processing_time_ms INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_session_id (session_id),
        INDEX idx_status (status),
        INDEX idx_analysis_type (analysis_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB
    `);
    
    console.log('✅ All tables created successfully!');
    
    // Create default admin user
    console.log('👤 Creating default admin user...');
    
    const bcrypt = require('bcryptjs');
    const adminPassword = await bcrypt.hash('admin123', 10);
    
    try {
      await dbConnection.execute(`
        INSERT IGNORE INTO users (username, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `, ['admin', 'admin@example.com', adminPassword, 'admin']);
      
      console.log('✅ Default admin user created!');
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
      console.log('ℹ️  Default admin user already exists');
    }
    
    // Create default dataset
    console.log('📊 Creating default dataset...');
    
    const sampleDataset = JSON.stringify([
      { text: "Saya sangat senang dengan produk ini", sentiment: "positive" },
      { text: "Pelayanan yang mengecewakan", sentiment: "negative" },
      { text: "Produk biasa saja tidak istimewa", sentiment: "neutral" },
      { text: "Luar biasa! Sangat merekomendasikan", sentiment: "positive" },
      { text: "Tidak sesuai ekspektasi", sentiment: "negative" }
    ]);
    
    try {
      // Get admin user ID
      const [adminRows] = await dbConnection.execute(
        'SELECT id FROM users WHERE username = ?', 
        ['admin']
      );
      
      if (adminRows.length > 0) {
        const adminId = adminRows[0].id;
        
        await dbConnection.execute(`
          INSERT IGNORE INTO user_datasets (user_id, name, description, data, is_default)
          VALUES (?, ?, ?, ?, ?)
        `, [
          adminId, 
          'Default Dataset', 
          'Sample dataset for sentiment analysis training', 
          sampleDataset, 
          true
        ]);
        
        console.log('✅ Default dataset created!');
      }
    } catch (error) {
      console.log('⚠️  Could not create default dataset:', error.message);
    }
    
    // Test the setup
    const [tables] = await dbConnection.execute('SHOW TABLES');
    
    console.log('\n📊 Created tables:');
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });
    
    // Check admin user
    const [adminUser] = await dbConnection.execute(
      'SELECT username, email, role FROM users WHERE username = "admin"'
    );
    
    if (adminUser.length > 0) {
      console.log('\n👤 Default admin user:');
      console.log(`  Username: ${adminUser[0].username}`);
      console.log(`  Email: ${adminUser[0].email}`);
      console.log(`  Role: ${adminUser[0].role}`);
      console.log('  Password: admin123');
    }
    
    await dbConnection.end();
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file with the correct database credentials');
    console.log('2. Start your Node.js server: npm start');
    console.log('3. Login with admin/admin123 to test the system');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Fix: Check your XAMPP MySQL credentials');
      console.log('- Default XAMPP username: root');
      console.log('- Default XAMPP password: (empty)');
      console.log('- Update the .env file if you changed these');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Fix: Start XAMPP MySQL service');
      console.log('1. Open XAMPP Control Panel');
      console.log('2. Click "Start" next to MySQL');
      console.log('3. Wait for MySQL to show "Running" status');
      console.log('4. Try running this script again');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Fix: Check your database host');
      console.log('Make sure DB_HOST=localhost in your .env file');
    }
    
    process.exit(1);
  }
};

// Run the setup
if (require.main === module) {
  require('dotenv').config();
  setupDatabase();
}

module.exports = setupDatabase;