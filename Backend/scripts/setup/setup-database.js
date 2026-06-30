#!/usr/bin/env node

/**
 * Single source of truth for the entire database schema.
 *
 * Exported:
 *   ensureSchema(db)  – idempotent: creates every table if it doesn't exist,
 *                       then seeds default admin + dataset. Safe to call on
 *                       every server startup (uses CREATE TABLE IF NOT EXISTS).
 *
 * Standalone:
 *   node setup-database.js  – creates the DB and runs ensureSchema from scratch.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Schema – ordered so that every FK target is created before its referencing table
// ---------------------------------------------------------------------------

const TABLE_DEFINITIONS = [
  // 1. users
  `CREATE TABLE IF NOT EXISTS users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL UNIQUE,
    email        VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role         ENUM('user','admin') DEFAULT 'user',
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email    (email),
    INDEX idx_role     (role),
    INDEX idx_active   (is_active)
  ) ENGINE=InnoDB`,

  // 2. user_api_credentials
  `CREATE TABLE IF NOT EXISTS user_api_credentials (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    user_id              INT NOT NULL,
    bearer_token         TEXT,
    api_key              VARCHAR(255),
    api_secret           VARCHAR(255),
    access_token         VARCHAR(255),
    access_token_secret  VARCHAR(255),
    x_cookies            LONGTEXT,
    expires_at           DATETIME DEFAULT NULL,
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id   (user_id),
    INDEX idx_expires   (expires_at),
    INDEX idx_is_active (is_active)
  ) ENGINE=InnoDB`,

  // 3. user_sessions  (auth tokens)
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id         VARCHAR(255) PRIMARY KEY,
    user_id    INT NOT NULL,
    token      TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_expires (expires_at)
  ) ENGINE=InnoDB`,

  // 4. (removed — user_datasets was never used in any route or utility)

  // 5. training_data_original  (raw uploaded CSV/file rows)
  `CREATE TABLE IF NOT EXISTS training_data_original (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    dataset_name    VARCHAR(100) DEFAULT 'Default Dataset',
    tweet_text      TEXT NOT NULL,
    sentiment_label ENUM('Positive','Negative','Neutral') NOT NULL,
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id      (user_id),
    INDEX idx_sentiment    (sentiment_label),
    INDEX idx_dataset_name (dataset_name)
  ) ENGINE=InnoDB`,

  // 6. training_data_processed  (cleaned version of training_data_original)
  `CREATE TABLE IF NOT EXISTS training_data_processed (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    original_id      INT NOT NULL,
    dataset_name     VARCHAR(100) DEFAULT 'Default Dataset',
    original_text    TEXT NOT NULL,
    processed_text   TEXT NOT NULL,
    sentiment_label  ENUM('Positive','Negative','Neutral') NOT NULL,
    processing_notes TEXT,
    processed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)     REFERENCES users(id)                    ON DELETE CASCADE,
    FOREIGN KEY (original_id) REFERENCES training_data_original(id)   ON DELETE CASCADE,
    INDEX idx_user_id      (user_id),
    INDEX idx_original_id  (original_id),
    INDEX idx_sentiment    (sentiment_label),
    INDEX idx_dataset_name (dataset_name)
  ) ENGINE=InnoDB`,

  // 7. raw_twitter_data  (tweets uploaded for analysis)
  `CREATE TABLE IF NOT EXISTS raw_twitter_data (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    user_id               INT NOT NULL,
    session_id            VARCHAR(100) NOT NULL,
    job_id                VARCHAR(100) DEFAULT NULL,
    collected_via         ENUM('api','crawler','manual','mock') DEFAULT 'mock',
    raw_data              TEXT NOT NULL,
    timestamp_extracted   DATETIME,
    username_extracted    VARCHAR(100),
    clean_text            TEXT,
    sentiment_label       ENUM('Positive','Negative','Neutral') DEFAULT NULL,
    is_training_sample    BOOLEAN DEFAULT FALSE,
    predicted_sentiment   ENUM('Positive','Negative','Neutral') DEFAULT NULL,
    prediction_confidence DECIMAL(5,4) DEFAULT NULL,
    inset_score           DECIMAL(8,4) DEFAULT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id           (user_id),
    INDEX idx_session_id        (session_id),
    INDEX idx_sentiment_label   (sentiment_label),
    INDEX idx_is_training       (is_training_sample),
    INDEX idx_predicted_sentiment (predicted_sentiment)
  ) ENGINE=InnoDB`,

  // 8. data_sessions  (tracks upload/analysis lifecycle per session)
  `CREATE TABLE IF NOT EXISTS data_sessions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    session_id      VARCHAR(100) NOT NULL UNIQUE,
    session_name    VARCHAR(255) NOT NULL,
    status          ENUM('uploading','uploaded','labeling','processing','completed','failed') DEFAULT 'uploading',
    total_items     INT DEFAULT 0,
    processed_items INT DEFAULT 0,
    valid_items     INT DEFAULT 0,
    invalid_items   INT DEFAULT 0,
    training_samples INT DEFAULT 0,
    analysis_type   ENUM('manual','library','inset') DEFAULT NULL,
    error_message   TEXT,
    started_at      TIMESTAMP NULL,
    completed_at    TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id   (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_status    (status),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB`,

  // 9. analysis_history  (completed analysis results)
  `CREATE TABLE IF NOT EXISTS analysis_history (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    session_id       VARCHAR(100) NOT NULL,
    session_name     VARCHAR(255) NOT NULL,
    analysis_type    ENUM('manual','api','library') DEFAULT 'manual',
    source_description TEXT,
    total_items      INT DEFAULT 0,
    processed_items  INT DEFAULT 0,
    training_samples INT DEFAULT 0,
    results          LONGTEXT,
    status           ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_message    TEXT,
    processing_time_ms INT DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at     TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id      (user_id),
    INDEX idx_session_id   (session_id),
    INDEX idx_status       (status),
    INDEX idx_analysis_type (analysis_type),
    INDEX idx_created_at   (created_at)
  ) ENGINE=InnoDB`,

  // 10. audit_logs  (security trail)
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT,
    action     VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata   JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id    (user_id),
    INDEX idx_action     (action),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB`,

  // 11. word_libraries  (named collections of sentiment words)
  `CREATE TABLE IF NOT EXISTS word_libraries (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id   (user_id),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB`,

  // 12. word_library_words
  `CREATE TABLE IF NOT EXISTS word_library_words (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    library_id INT NOT NULL,
    word       VARCHAR(255) NOT NULL,
    sentiment  ENUM('positive','negative','neutral') NOT NULL,
    weight     DECIMAL(3,2) DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (library_id) REFERENCES word_libraries(id) ON DELETE CASCADE,
    UNIQUE KEY unique_word_per_library (library_id, word),
    INDEX idx_library_id (library_id),
    INDEX idx_sentiment  (sentiment)
  ) ENGINE=InnoDB`,

  // 13. word_library_samples  (sample tweets for training per library)
  `CREATE TABLE IF NOT EXISTS word_library_samples (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    library_id INT NOT NULL,
    user_id    INT NOT NULL,
    tweet_text TEXT NOT NULL,
    sentiment  ENUM('positive','negative','neutral') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (library_id) REFERENCES word_libraries(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    INDEX idx_library_id (library_id),
    INDEX idx_user_id    (user_id),
    INDEX idx_sentiment  (sentiment),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB`,

  // 14. crawler_jobs  (individual crawl requests)
  `CREATE TABLE IF NOT EXISTS crawler_jobs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          VARCHAR(100) UNIQUE NOT NULL,
    user_id         INT NOT NULL,
    keyword         VARCHAR(255) NOT NULL,
    target_count    INT DEFAULT 100,
    status          ENUM('queued','processing','completed','failed','paused','cancelled') DEFAULT 'queued',
    collected_count INT DEFAULT 0,
    failed_count    INT DEFAULT 0,
    config          JSON,
    started_at      TIMESTAMP NULL,
    completed_at    TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id   (user_id),
    INDEX idx_status    (status),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB`,

  // 15. crawler_job_progress  (real-time progress per job)
  `CREATE TABLE IF NOT EXISTS crawler_job_progress (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    job_id          VARCHAR(100) NOT NULL,
    user_id         INT NOT NULL,
    current_page    INT DEFAULT 1,
    tweets_on_page  INT DEFAULT 0,
    total_collected INT DEFAULT 0,
    total_failed    INT DEFAULT 0,
    status_message  VARCHAR(255),
    last_error      VARCHAR(255),
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id)  REFERENCES crawler_jobs(job_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)            ON DELETE CASCADE,
    UNIQUE KEY unique_job (job_id),
    INDEX idx_job_id  (job_id),
    INDEX idx_user_id (user_id)
  ) ENGINE=InnoDB`,

  // 16. crawler_collections  (named groups of crawled tweets)
  `CREATE TABLE IF NOT EXISTS crawler_collections (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    user_id                 INT NOT NULL,
    collection_id           VARCHAR(50) NOT NULL UNIQUE,
    name                    VARCHAR(255) NOT NULL,
    description             TEXT,
    keywords                TEXT,
    status                  ENUM('active','archived','deleted') DEFAULT 'active',
    tweet_count             INT DEFAULT 0,
    total_tweets_target     INT,
    total_tweets_collected  INT DEFAULT 0,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status  (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 17. crawler_tweets  (individual tweets inside a collection)
  `CREATE TABLE IF NOT EXISTS crawler_tweets (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    collection_id    INT NOT NULL,
    tweet_id         VARCHAR(50) NOT NULL,
    text             LONGTEXT,
    username         VARCHAR(255),
    author_id        VARCHAR(50),
    created_at_tweet DATETIME,
    url              TEXT,
    likes            INT DEFAULT 0,
    retweets         INT DEFAULT 0,
    replies          INT DEFAULT 0,
    language         VARCHAR(10),
    is_labeled       BOOLEAN DEFAULT FALSE,
    sentiment_label  ENUM('positive','negative','neutral') DEFAULT NULL,
    manual_label     ENUM('positive','negative','neutral') DEFAULT NULL,
    notes            TEXT,
    source           VARCHAR(50),
    imported_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)       REFERENCES users(id)               ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES crawler_collections(id) ON DELETE CASCADE,
    UNIQUE KEY unique_tweet_per_collection (tweet_id, collection_id),
    INDEX idx_user_id       (user_id),
    INDEX idx_collection_id (collection_id),
    INDEX idx_is_labeled    (is_labeled)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 18. analysis_validation  (external validation — manual re-labeling of classified tweets)
  `CREATE TABLE IF NOT EXISTS analysis_validation (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    analysis_id           INT NOT NULL,
    user_id               INT NOT NULL,
    raw_data_id           INT NOT NULL,
    clean_text            TEXT NOT NULL,
    raw_data              TEXT,
    username_extracted    VARCHAR(100),
    timestamp_extracted   DATETIME,
    predicted_sentiment   ENUM('Positive','Negative','Neutral') NOT NULL,
    prediction_confidence DECIMAL(5,4),
    manual_label          ENUM('Positive','Negative','Neutral') DEFAULT NULL,
    labeled_at            TIMESTAMP NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES analysis_history(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id)            ON DELETE CASCADE,
    INDEX idx_analysis_id  (analysis_id),
    INDEX idx_user_id      (user_id),
    INDEX idx_manual_label (manual_label),
    INDEX idx_predicted    (predicted_sentiment)
  ) ENGINE=InnoDB`,
];

// ---------------------------------------------------------------------------
// All tables in DROP order (reverse of creation, most dependent first)
// Used by reset-database.js
// ---------------------------------------------------------------------------
const ALL_TABLES_DROP_ORDER = [
  'analysis_validation',
  'crawler_tweets',
  'crawler_job_progress',
  'crawler_collections',
  'crawler_jobs',
  'word_library_samples',
  'word_library_words',
  'word_libraries',
  'audit_logs',
  'analysis_history',
  'data_sessions',
  'raw_twitter_data',
  'training_data_processed',
  'training_data_original',
  'user_sessions',
  'user_api_credentials',
  'users',
];

// ---------------------------------------------------------------------------
// ensureSchema – idempotent, safe to run on every server startup
// ---------------------------------------------------------------------------
const ensureSchema = async (db) => {
  console.log('Ensuring database schema...');

  for (const sql of TABLE_DEFINITIONS) {
    await db.execute(sql);
  }

  // Idempotent column migrations — MySQL 8.0 does NOT support ADD COLUMN IF NOT EXISTS
  // (that is MariaDB syntax), so we check information_schema manually.
  const addCol = async (table, column, definition) => {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows[0].cnt === 0) {
      await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  ✔ Added column ${table}.${column}`);
    }
  };

  const dropCol = async (table, column) => {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows[0].cnt > 0) {
      await db.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      console.log(`  ✔ Dropped column ${table}.${column}`);
    }
  };

  await addCol('user_api_credentials', 'x_cookies', 'LONGTEXT');
  await dropCol('user_api_credentials', 'x_username');
  await dropCol('user_api_credentials', 'x_password');
  await addCol('crawler_jobs', 'since_date', 'DATE NULL');
  await addCol('crawler_jobs', 'until_date', 'DATE NULL');
  // MODIFY COLUMN is safe to run repeatedly (enum extension only)
  await db.execute(
    `ALTER TABLE crawler_jobs MODIFY COLUMN status
     ENUM('queued','processing','completed','failed','paused','suspended','cancelled')
     DEFAULT 'queued'`
  ).catch(() => {});
  // Drop unused table — DROP TABLE IF EXISTS is standard MySQL, safe to run repeatedly
  await db.execute(`DROP TABLE IF EXISTS user_datasets`);
  console.log('  ✔ Removed unused table: user_datasets');

  // Ensure sentiment_user exists with correct privileges (idempotent)
  // Needed when mysql_data volume existed before MYSQL_USER env was set
  if (process.env.DB_USER && process.env.DB_PASSWORD) {
    await db.execute(
      `CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`,
      [process.env.DB_USER, process.env.DB_PASSWORD]
    ).catch(() => {});
    await db.execute(
      `GRANT ALL PRIVILEGES ON \`${process.env.DB_NAME || 'sentiment_analysis'}\`.* TO ?@'%'`,
      [process.env.DB_USER]
    ).catch(() => {});
    await db.execute(`FLUSH PRIVILEGES`).catch(() => {});
  }

  await seedDefaultData(db);
  await seedInsetIfNeeded(db);
  console.log('✅ Schema up to date');
};

// Seed InSet lexicon only when the library doesn't exist yet (fresh DB)
const seedInsetIfNeeded = async (db) => {
  try {
    const [rows] = await db.execute(
      "SELECT id FROM word_libraries WHERE name = 'InSet Lexicon' AND is_system = TRUE LIMIT 1"
    );
    if (rows.length > 0) return; // Already seeded

    console.log('🔤 InSet Lexicon not found — seeding from TSV files...');
    const { seedInset } = require('./seed-inset');
    await seedInset(db);
  } catch (err) {
    console.warn('⚠️  InSet seeding failed (non-fatal):', err.message);
  }
};

// ---------------------------------------------------------------------------
// seedDefaultData – creates admin user and default dataset if absent
// ---------------------------------------------------------------------------
const seedDefaultData = async (db) => {
  const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', ['admin']);

  if (rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      ['admin', 'admin@sentimentanalysis.com', hash, 'admin', true]
    );

    const adminId = result.insertId;

    const defaultDataset = JSON.stringify([
      { Tweet: 'saya sangat suka produk ini, kualitasnya luar biasa', Sentiment: 'positive' },
      { Tweet: 'pelayanan yang memuaskan, terima kasih', Sentiment: 'positive' },
      { Tweet: 'pengalaman berbelanja yang menyenangkan', Sentiment: 'positive' },
      { Tweet: 'rekomendasi terbaik untuk semua orang', Sentiment: 'positive' },
      { Tweet: 'saya kecewa dengan layanan ini', Sentiment: 'negative' },
      { Tweet: 'produk tidak sesuai ekspektasi, mengecewakan', Sentiment: 'negative' },
      { Tweet: 'pelayanan buruk dan tidak profesional', Sentiment: 'negative' },
      { Tweet: 'pengalaman yang tidak menyenangkan', Sentiment: 'negative' },
      { Tweet: 'produk standar, tidak ada yang istimewa', Sentiment: 'neutral' },
      { Tweet: 'layanan biasa saja, cukup memuaskan', Sentiment: 'neutral' },
      { Tweet: 'tidak buruk tapi juga tidak bagus', Sentiment: 'neutral' },
      { Tweet: 'sesuai dengan harga yang dibayar', Sentiment: 'neutral' },
    ]);

    await db.execute(
      'INSERT INTO user_datasets (user_id, name, description, data, is_default) VALUES (?, ?, ?, ?, ?)',
      [adminId, 'Default Indonesian Sentiment Dataset',
       'Base dataset with Indonesian sentiment examples', defaultDataset, true]
    );

    console.log('✅ Default admin user created (password: admin123)');
  }
};

// ---------------------------------------------------------------------------
// Standalone setup – run directly: node setup-database.js
// ---------------------------------------------------------------------------
const runSetup = async () => {
  console.log('Setting up MySQL database for Sentiment Analysis...\n');

  const baseConfig = {
    host:               process.env.DB_HOST || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER || 'root',
    password:           process.env.DB_PASSWORD || '',
    connectTimeout:     60000,
    multipleStatements: true,
  };

  const dbName = process.env.DB_NAME || 'sentiment_analysis';

  try {
    // Step 1: create DB if absent
    console.log('Connecting to MySQL server...');
    const tempConn = await mysql.createConnection(baseConfig);
    await tempConn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await tempConn.end();
    console.log(`✅ Database "${dbName}" ready`);

    // Step 2: apply schema
    console.log('Connecting to database...');
    const conn = await mysql.createConnection({ ...baseConfig, database: dbName });
    await ensureSchema(conn);

    // Step 3: report
    const [tables] = await conn.execute('SHOW TABLES');
    console.log(`\nTables (${tables.length}):`);
    tables.forEach(t => console.log(`  - ${Object.values(t)[0]}`));

    await conn.end();
    console.log('\n✅ Setup complete!');
    console.log('Login: admin / admin123');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('Check DB_USER / DB_PASSWORD in your .env file.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('MySQL is not running. Start XAMPP MySQL and retry.');
    }

    process.exit(1);
  }
};

if (require.main === module) {
  require('dotenv').config();
  runSetup();
}

module.exports = { ensureSchema, ALL_TABLES_DROP_ORDER };
