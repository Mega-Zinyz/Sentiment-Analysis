const { initDatabase, getDb } = require('../config/mysql-database');

async function checkWordLibraries() {
  try {
    await initDatabase();
    const db = getDb();
    
    // Check word libraries
    const [libs] = await db.execute('SELECT id, name, user_id FROM word_libraries');
    console.log('\nWord Libraries:');
    console.log(JSON.stringify(libs, null, 2));
    
    // Check if any have null user_id
    const nullUserIds = libs.filter(lib => lib.user_id === null);
    if (nullUserIds.length > 0) {
      console.log('\n⚠️  Found', nullUserIds.length, 'word libraries with NULL user_id');
      console.log('These need to be assigned to a user.');
    }
    
    // Show users
    const [users] = await db.execute('SELECT id, username FROM users');
    console.log('\nAvailable Users:');
    console.log(JSON.stringify(users, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkWordLibraries();
