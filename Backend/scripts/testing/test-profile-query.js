const { initDatabase, getDb } = require('../config/mysql-database');

async function testProfileQuery() {
  try {
    await initDatabase();
    const db = getDb();
    
    // Test the query for user 13 (mone)
    const userId = 13;
    
    const [wordLibraryCount] = await db.execute(
      'SELECT COUNT(*) as count FROM word_libraries WHERE user_id = ?',
      [userId]
    );
    
    console.log('\nQuery result for user_id:', userId);
    console.log('Count:', wordLibraryCount[0].count);
    console.log('Full result:', JSON.stringify(wordLibraryCount, null, 2));
    
    // Also check what's in the table
    const [allLibs] = await db.execute('SELECT id, name, user_id FROM word_libraries');
    console.log('\nAll word libraries:');
    console.log(JSON.stringify(allLibs, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testProfileQuery();
