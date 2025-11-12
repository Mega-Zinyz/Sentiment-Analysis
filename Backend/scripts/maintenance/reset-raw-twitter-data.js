const { initDatabase, getDb, closeDb } = require('../config/mysql-database');

async function resetRawTwitterData() {
  try {
    await initDatabase();
    const db = getDb();

    console.log('\n⚠️  WARNING: This will delete all raw Twitter data and analysis history!');
    
    // Delete all raw Twitter data
    const [rawResult] = await db.execute('DELETE FROM raw_twitter_data');
    console.log(`\n✅ Deleted ${rawResult.affectedRows} rows from raw_twitter_data table`);
    
    // Reset auto-increment for raw_twitter_data
    await db.execute('ALTER TABLE raw_twitter_data AUTO_INCREMENT = 1');
    console.log('✅ Reset raw_twitter_data auto-increment to 1');
    
    // Delete all analysis history
    const [historyResult] = await db.execute('DELETE FROM analysis_history');
    console.log(`✅ Deleted ${historyResult.affectedRows} rows from analysis_history table`);
    
    // Reset auto-increment for analysis_history
    await db.execute('ALTER TABLE analysis_history AUTO_INCREMENT = 1');
    console.log('✅ Reset analysis_history auto-increment to 1');
    
    console.log('\n✅ Raw Twitter data and analysis history reset complete!');
    
    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting data:', error);
    process.exit(1);
  }
}

resetRawTwitterData();
