const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sentiment_analysis',
  charset: 'utf8mb4',
  timezone: '+00:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  multipleStatements: true,
};

let pool = null;

const initDatabase = async () => {
  try {
    pool = mysql.createPool(dbConfig);

    // Verify the pool can connect
    const conn = await pool.getConnection();
    await conn.execute('SELECT 1');
    conn.release();
    console.log('✅ MySQL connection pool established');

    // Delegate all schema creation to the single source of truth
    const { ensureSchema } = require('../scripts/setup/setup-database');
    await ensureSchema(pool);

    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);

    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('Database does not exist, creating it...');
      await createDatabase();
      return initDatabase();
    }

    throw error;
  }
};

const createDatabase = async () => {
  const tempConn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });
  await tempConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await tempConn.end();
  console.log('✅ Database created');
};

const getDb = () => {
  if (!pool) throw new Error('Database not initialized. Call initDatabase() first.');
  return pool;
};

const closeDb = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database pool closed');
  }
};

const executeQuery = async (query, params = []) => {
  const [results] = await getDb().execute(query, params);
  return results;
};

module.exports = { initDatabase, getDb, closeDb, executeQuery, dbConfig };
