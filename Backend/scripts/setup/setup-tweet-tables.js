const mysql = require('mysql2/promise');
const dbConfig = require('./config/mysql-database');

async function checkAndCreateTables() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    // Check if tweet_datasets table exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'tweet_datasets'"
    );
    
    if (tables.length === 0) {
      console.log('tweet_datasets table does not exist. Creating...');
      
      // Create tweet_datasets table
      await connection.execute(`
        CREATE TABLE tweet_datasets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_user_id (user_id),
          INDEX idx_name (name),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB
      `);
      
      // Create tweet_tweets table
      await connection.execute(`
        CREATE TABLE tweet_tweets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dataset_id INT NOT NULL,
          tweet_id VARCHAR(255) NOT NULL,
          text TEXT NOT NULL,
          clean_text TEXT,
          author_id VARCHAR(255),
          username VARCHAR(255),
          created_at TIMESTAMP NOT NULL,
          keywords TEXT,
          sentiment_label VARCHAR(50),
          sentiment_score DECIMAL(5,4),
          collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE KEY unique_tweet_dataset (dataset_id, tweet_id),
          INDEX idx_dataset_id (dataset_id),
          INDEX idx_tweet_id (tweet_id),
          INDEX idx_author_id (author_id),
          INDEX idx_sentiment (sentiment_label),
          INDEX idx_collected_at (collected_at),
          
          FOREIGN KEY (dataset_id) REFERENCES tweet_datasets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      
      console.log('Tables created successfully!');
    } else {
      console.log('tweet_datasets table already exists.');
    }
    
    // Check if tweet_tweets table exists
    const [tweetTables] = await connection.execute(
      "SHOW TABLES LIKE 'tweet_tweets'"
    );
    
    if (tweetTables.length === 0) {
      console.log('tweet_tweets table missing, but should have been created above.');
    } else {
      console.log('tweet_tweets table exists.');
    }
    
    console.log('Database check completed successfully!');
    
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the check
checkAndCreateTables()
  .then(() => {
    console.log('Setup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });