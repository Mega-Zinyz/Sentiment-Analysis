require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sentiment_analysis',
  charset: 'utf8mb4',
  timezone: '+00:00'
};

async function addTweetTables() {
  let connection;
  
  try {
    console.log('🔗 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Create tweet_datasets table
    console.log('📋 Creating tweet_datasets table...');
    await connection.execute(`
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
      ) ENGINE=InnoDB
    `);
    console.log('✅ tweet_datasets table created');
    
    // Create tweet_tweets table  
    console.log('📋 Creating tweet_tweets table...');
    await connection.execute(`
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
      ) ENGINE=InnoDB
    `);
    console.log('✅ tweet_tweets table created');
    
    console.log('🎉 Tweet tables setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addTweetTables()
  .then(() => {
    console.log('✨ Setup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });