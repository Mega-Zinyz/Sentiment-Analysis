-- Sentiment Analysis Database Schema for MySQL/MariaDB
-- Run this script to create the database and tables

-- Create database
CREATE DATABASE IF NOT EXISTS sentiment_analysis 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Users table
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
) ENGINE=InnoDB;

-- User API credentials table
CREATE TABLE IF NOT EXISTS user_api_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  bearer_token TEXT,
  api_key VARCHAR(255),
  api_secret VARCHAR(255),
  access_token VARCHAR(255),
  access_token_secret VARCHAR(255),
  expires_at DATETIME DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB;

-- Tweet datasets table (for managing collected tweets)
CREATE TABLE IF NOT EXISTS tweet_datasets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Tweet tweets table (stores individual tweets in datasets)
CREATE TABLE IF NOT EXISTS tweet_tweets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dataset_id INT NOT NULL,
  tweet_id VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  author_id VARCHAR(50),
  username VARCHAR(50),
  keywords VARCHAR(500),
  edited BOOLEAN DEFAULT FALSE,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (dataset_id) REFERENCES tweet_datasets(id) ON DELETE CASCADE,
  UNIQUE KEY unique_tweet_per_dataset (dataset_id, tweet_id),
  INDEX idx_dataset_id (dataset_id),
  INDEX idx_tweet_id (tweet_id),
  INDEX idx_created_at (created_at),
  INDEX idx_keywords (keywords)
) ENGINE=InnoDB;

-- User datasets table
CREATE TABLE IF NOT EXISTS user_datasets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  data LONGTEXT NOT NULL, -- JSON string of the dataset
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_default (is_default),
  INDEX idx_name (name)
) ENGINE=InnoDB;

-- Training data table for original uploaded data
CREATE TABLE IF NOT EXISTS training_data_original (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  dataset_name VARCHAR(100) DEFAULT 'Default Dataset',
  tweet_text TEXT NOT NULL,
  sentiment_label ENUM('Positive', 'Negative', 'Neutral') NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_sentiment (sentiment_label),
  INDEX idx_dataset_name (dataset_name)
) ENGINE=InnoDB;

-- Training data table for processed/cleaned data
CREATE TABLE IF NOT EXISTS training_data_processed (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  original_id INT NOT NULL,
  dataset_name VARCHAR(100) DEFAULT 'Default Dataset',
  original_text TEXT NOT NULL,
  processed_text TEXT NOT NULL,
  sentiment_label ENUM('Positive', 'Negative', 'Neutral') NOT NULL,
  processing_notes TEXT,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (original_id) REFERENCES training_data_original(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_original_id (original_id),
  INDEX idx_sentiment (sentiment_label),
  INDEX idx_dataset_name (dataset_name)
) ENGINE=InnoDB;

-- Raw Twitter data table for sentiment analysis
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
) ENGINE=InnoDB;

-- User sessions table (authentication)
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

-- Data processing sessions table (tracks upload and analysis status)
CREATE TABLE IF NOT EXISTS data_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(100) NOT NULL UNIQUE,
  session_name VARCHAR(255) NOT NULL,
  status ENUM('uploading', 'uploaded', 'labeling', 'processing', 'completed', 'failed') DEFAULT 'uploading',
  total_items INT DEFAULT 0,
  processed_items INT DEFAULT 0,
  valid_items INT DEFAULT 0,
  invalid_items INT DEFAULT 0,
  training_samples INT DEFAULT 0,
  analysis_type ENUM('manual', 'library') DEFAULT NULL,
  error_message TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Analysis history table
CREATE TABLE IF NOT EXISTS analysis_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  session_name VARCHAR(255) NOT NULL,
  analysis_type ENUM('manual', 'api', 'library') DEFAULT 'manual',
  source_description TEXT,
  total_items INT DEFAULT 0,
  processed_items INT DEFAULT 0,
  training_samples INT DEFAULT 0,
  results LONGTEXT, -- JSON string of sentiment distribution
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
) ENGINE=InnoDB;

-- Audit logs table for security monitoring
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Create default admin user
-- Password: admin123 (bcrypt hash)
INSERT IGNORE INTO users (username, email, password_hash, role, is_active) 
VALUES ('admin', 'admin@sentimentanalysis.com', '$2b$10$TODNGxjQjUH7dwWWgewjIOfGXc42rqhGEpeaI6dcu0DprOfwoC2we', 'admin', TRUE);

-- Get the admin user ID for default dataset
SET @admin_id = (SELECT id FROM users WHERE username = 'admin');

-- Create default dataset for admin
INSERT IGNORE INTO user_datasets (user_id, name, description, data, is_default) 
VALUES (@admin_id, 'Default Indonesian Sentiment Dataset', 'Base dataset with Indonesian sentiment examples', 
'[
  {"Tweet": "saya sangat suka produk ini, kualitasnya luar biasa", "Sentiment": "positive"},
  {"Tweet": "pelayanan yang memuaskan, terima kasih", "Sentiment": "positive"},
  {"Tweet": "pengalaman berbelanja yang menyenangkan", "Sentiment": "positive"},
  {"Tweet": "rekomendasi terbaik untuk semua orang", "Sentiment": "positive"},
  {"Tweet": "saya kecewa dengan layanan ini", "Sentiment": "negative"},
  {"Tweet": "produk tidak sesuai ekspektasi, mengecewakan", "Sentiment": "negative"},
  {"Tweet": "pelayanan buruk dan tidak profesional", "Sentiment": "negative"},
  {"Tweet": "pengalaman yang tidak menyenangkan", "Sentiment": "negative"},
  {"Tweet": "produk standar, tidak ada yang istimewa", "Sentiment": "neutral"},
  {"Tweet": "layanan biasa saja, cukup memuaskan", "Sentiment": "neutral"},
  {"Tweet": "tidak buruk tapi juga tidak bagus", "Sentiment": "neutral"},
  {"Tweet": "sesuai dengan harga yang dibayar", "Sentiment": "neutral"}
]', TRUE);

-- Show created tables
SHOW TABLES;

-- Show admin user
SELECT id, username, email, role, is_active, created_at FROM users WHERE username = 'admin';