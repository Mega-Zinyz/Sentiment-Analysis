-- Word Libraries System
-- Stores user-created word libraries with sentiment classifications

-- Word library collections (user's library sets)
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
) ENGINE=InnoDB;

-- Individual words in libraries
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
  INDEX idx_sentiment (sentiment),
  INDEX idx_word (word)
) ENGINE=InnoDB;

-- Sample tweets for each library
CREATE TABLE IF NOT EXISTS word_library_samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  library_id INT NOT NULL,
  tweet_text TEXT NOT NULL,
  sentiment ENUM('positive', 'negative', 'neutral') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (library_id) REFERENCES word_libraries(id) ON DELETE CASCADE,
  INDEX idx_library_id (library_id),
  INDEX idx_sentiment (sentiment)
) ENGINE=InnoDB;
