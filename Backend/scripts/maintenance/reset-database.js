const { initDatabase, getDb, closeDb } = require('../config/mysql-database');

async function resetDatabase() {
  try {
    // Connect without initializing tables
    const mysql = require('mysql2/promise');
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'sentiment_analysis',
      multipleStatements: true
    };

    console.log('Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    console.log('\n⚠️  WARNING: This will drop all tables and recreate them!');
    console.log('All data will be lost except what is recreated by default.\n');

    // Drop tables in reverse order (to handle foreign key constraints)
    console.log('Dropping existing tables...');
    
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    const tablesToDrop = [
      'word_library_samples',
      'word_library_words',
      'word_libraries',
      'analysis_history',
      'user_sessions',
      'user_api_credentials',
      'users'
    ];

    for (const table of tablesToDrop) {
      try {
        await connection.execute(`DROP TABLE IF EXISTS ${table}`);
        console.log(`  ✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`  ⚠️  Could not drop ${table}: ${error.message}`);
      }
    }

    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    await connection.end();

    console.log('\n✅ All tables dropped successfully');
    console.log('\nNow initializing fresh database...\n');

    // Now reinitialize with new structure
    await initDatabase();
    
    console.log('\n✅ Database reset complete!');
    console.log('Default admin user created:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    
    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();
