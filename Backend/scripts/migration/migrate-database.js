#!/usr/bin/env node

// Database migration script to update analysis_history table
const mysql = require('mysql2/promise');

const migrateDatabase = async () => {
  console.log('🔄 Migrating analysis_history table...\n');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'sentiment_analysis'
  };
  
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database');
    
    // Check current table structure
    console.log('🔍 Checking current table structure...');
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM analysis_history
    `);
    
    console.log('Current columns:', columns.map(col => col.Field));
    
    // Check if session_id column exists
    const hasSessionId = columns.some(col => col.Field === 'session_id');
    
    if (!hasSessionId) {
      console.log('❌ session_id column missing, adding...');
      
      // Drop and recreate table with new structure
      await connection.execute('DROP TABLE IF EXISTS analysis_history_backup');
      await connection.execute('CREATE TABLE analysis_history_backup AS SELECT * FROM analysis_history');
      
      await connection.execute('DROP TABLE analysis_history');
      
      await connection.execute(`
        CREATE TABLE analysis_history (
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
      
      console.log('✅ analysis_history table recreated with new structure');
      console.log('📋 Backup saved as analysis_history_backup');
    } else {
      console.log('✅ session_id column already exists');
    }
    
    await connection.end();
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateDatabase();