-- Playwright Crawler System Database Schema
-- Add these tables to sentiment_analysis database
-- Run after main database_schema.sql

-- Crawler Jobs Table - Track all crawling tasks
CREATE TABLE IF NOT EXISTS crawler_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(100) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  target_count INT DEFAULT 100,
  status ENUM('queued', 'processing', 'completed', 'failed', 'paused', 'cancelled') DEFAULT 'queued',
  
  -- Progress tracking
  collected_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  estimated_time_remaining INT DEFAULT NULL,
  
  -- Timing
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Configuration
  config JSON,  -- Store crawler config: proxies, rate_limit, retries, etc
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_job_id (job_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_keyword (keyword)
) ENGINE=InnoDB;

-- Crawler Job Progress Table - Real-time updates
CREATE TABLE IF NOT EXISTS crawler_job_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  
  -- Current state
  current_page INT DEFAULT 1,
  tweets_on_page INT DEFAULT 0,
  total_collected INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  
  -- Performance metrics
  avg_response_time_ms INT DEFAULT NULL,
  current_rate_tweets_per_sec DECIMAL(5,2) DEFAULT NULL,
  
  -- Status message
  status_message VARCHAR(255),
  last_error VARCHAR(255),
  
  -- Timestamp for real-time updates
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES crawler_jobs(job_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_job_id (job_id),
  INDEX idx_user_id (user_id),
  UNIQUE KEY unique_job (job_id)
) ENGINE=InnoDB;

-- Crawler Logs Table - Detailed logging
CREATE TABLE IF NOT EXISTS crawler_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  log_level ENUM('info', 'warning', 'error', 'debug') DEFAULT 'info',
  message TEXT NOT NULL,
  context JSON,  -- Additional context: proxy used, response time, etc
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES crawler_jobs(job_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_job_id (job_id),
  INDEX idx_user_id (user_id),
  INDEX idx_log_level (log_level),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Update raw_twitter_data to link with crawler jobs
ALTER TABLE raw_twitter_data 
ADD COLUMN job_id VARCHAR(100) DEFAULT NULL AFTER session_id,
ADD COLUMN collected_via ENUM('api', 'crawler', 'manual', 'mock') DEFAULT 'mock',
ADD FOREIGN KEY (job_id) REFERENCES crawler_jobs(job_id) ON DELETE SET NULL,
ADD INDEX idx_job_id (job_id),
ADD INDEX idx_collected_via (collected_via);

-- Crawler Statistics Table - Aggregate stats
CREATE TABLE IF NOT EXISTS crawler_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  job_id VARCHAR(100),
  
  -- Stats
  total_tweets_collected BIGINT DEFAULT 0,
  total_jobs_completed INT DEFAULT 0,
  total_jobs_failed INT DEFAULT 0,
  avg_tweets_per_job INT DEFAULT 0,
  total_crawling_time_seconds INT DEFAULT 0,
  
  -- Last update
  last_crawl_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES crawler_jobs(job_id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_job_id (job_id)
) ENGINE=InnoDB;

-- Proxy Pool Table - For rotating proxies
CREATE TABLE IF NOT EXISTS proxy_pool (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proxy_url VARCHAR(255) NOT NULL UNIQUE,
  protocol ENUM('http', 'https', 'socks5') DEFAULT 'http',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP NULL,
  failed_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  ban_status ENUM('active', 'banned', 'slow') DEFAULT 'active',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_is_active (is_active),
  INDEX idx_ban_status (ban_status),
  INDEX idx_last_used_at (last_used_at)
) ENGINE=InnoDB;

-- Create indexes for better query performance
CREATE INDEX idx_raw_twitter_job ON raw_twitter_data(job_id, user_id);
CREATE INDEX idx_crawler_jobs_user_status ON crawler_jobs(user_id, status);
CREATE INDEX idx_crawler_progress_updates ON crawler_job_progress(updated_at);
