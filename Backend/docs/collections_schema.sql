-- Crawler Collections Schema
-- Tables for organizing crawled tweets into named collections
-- Run AFTER crawler_schema.sql (02_crawler_schema.sql)

CREATE TABLE IF NOT EXISTS crawler_collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  collection_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  keywords TEXT,
  status ENUM('active', 'archived', 'deleted') DEFAULT 'active',
  tweet_count INT DEFAULT 0,
  total_tweets_target INT,
  total_tweets_collected INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crawler_tweets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  collection_id INT NOT NULL,
  tweet_id VARCHAR(50) NOT NULL,
  text LONGTEXT,
  username VARCHAR(255),
  author_id VARCHAR(50),
  created_at_tweet DATETIME,
  url TEXT,
  likes INT DEFAULT 0,
  retweets INT DEFAULT 0,
  replies INT DEFAULT 0,
  language VARCHAR(10),
  is_labeled BOOLEAN DEFAULT FALSE,
  sentiment_label ENUM('positive', 'negative', 'neutral') DEFAULT NULL,
  manual_label ENUM('positive', 'negative', 'neutral') DEFAULT NULL,
  notes TEXT,
  source VARCHAR(50),
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES crawler_collections(id) ON DELETE CASCADE,
  UNIQUE KEY unique_tweet_per_collection (tweet_id, collection_id),
  INDEX idx_user_id (user_id),
  INDEX idx_collection_id (collection_id),
  INDEX idx_is_labeled (is_labeled),
  INDEX idx_sentiment (sentiment_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
