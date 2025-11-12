const { initDatabase, getDb } = require('../config/mysql-database');

async function fixWordLibraryUser() {
  try {
    await initDatabase();
    const db = getDb();
    
    console.log('\nWhich user should own the word libraries?');
    const [users] = await db.execute('SELECT id, username FROM users');
    console.log('Available users:');
    users.forEach(u => console.log(`  ${u.id}: ${u.username}`));
    
    // Get the user ID from command line argument
    const targetUserId = process.argv[2];
    
    if (!targetUserId) {
      console.log('\nUsage: node fix-word-library-user.js <user_id>');
      console.log('Example: node fix-word-library-user.js 13');
      process.exit(1);
    }
    
    // Update all word libraries to this user
    const [result] = await db.execute(
      'UPDATE word_libraries SET user_id = ? WHERE user_id != ?',
      [targetUserId, targetUserId]
    );
    
    console.log(`\n✅ Updated ${result.affectedRows} word libraries to user_id: ${targetUserId}`);
    
    // Show updated libraries
    const [libs] = await db.execute('SELECT id, name, user_id FROM word_libraries');
    console.log('\nWord Libraries after update:');
    console.log(JSON.stringify(libs, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixWordLibraryUser();
