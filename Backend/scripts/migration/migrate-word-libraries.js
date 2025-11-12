const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateWordLibraries() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'sentiment_analysis',
      port: process.env.DB_PORT || 3306
    });
    
    console.log('✅ Connected to database');
    
    // Read and execute schema
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, '..', 'docs', 'word_libraries_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Clean up the schema and split statements properly
    const cleanSchema = schema.replace(/--[^\n]*/g, '').trim();
    const statements = cleanSchema.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      await connection.execute(statement);
    }
    
    console.log('✅ Word libraries tables created successfully');
    
    // Check if tables exist
    const [tables] = await connection.query(`
      SHOW TABLES LIKE 'word_%'
    `);
    
    console.log(`✅ Found ${tables.length} word library tables:`, 
      tables.map(t => Object.values(t)[0]));
    
    // Show table structures
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      const [columns] = await connection.query(`DESCRIBE ${tableName}`);
      console.log(`\n📋 ${tableName}:`, columns.map(c => c.Field).join(', '));
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration
migrateWordLibraries();
