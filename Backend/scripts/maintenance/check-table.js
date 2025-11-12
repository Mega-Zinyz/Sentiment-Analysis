const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTableStructure() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sentiment_analysis'
  });

  try {
    console.log('Checking analysis_history table structure...');
    const [rows] = await connection.execute('DESCRIBE analysis_history');
    console.log('Current table structure:');
    console.table(rows);
    
    console.log('\nChecking if table has any data...');
    const [data] = await connection.execute('SELECT COUNT(*) as count FROM analysis_history');
    console.log('Rows in table:', data[0].count);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkTableStructure();