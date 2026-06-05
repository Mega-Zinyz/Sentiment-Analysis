#!/usr/bin/env node

/**
 * Drops every table and re-runs ensureSchema() from scratch.
 * ALL DATA WILL BE LOST.
 */

require('dotenv').config();

const mysql = require('mysql2/promise');
const { ensureSchema, ALL_TABLES_DROP_ORDER } = require('../setup/setup-database');

async function resetDatabase() {
  const dbConfig = {
    host:               process.env.DB_HOST || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME || 'sentiment_analysis',
    multipleStatements: true,
    connectTimeout:     60000,
  };

  console.log('\n⚠️  WARNING: This will drop ALL tables and recreate them.');
  console.log('All data will be lost.\n');

  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    console.log('Dropping tables...');
    for (const table of ALL_TABLES_DROP_ORDER) {
      await connection.execute(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`  ✅ Dropped: ${table}`);
    }

    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ All tables dropped');

    console.log('\nRecreating schema...');
    await ensureSchema(connection);

    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\nRecreated tables (${tables.length}):`);
    tables.forEach(t => console.log(`  - ${Object.values(t)[0]}`));

    console.log('\n✅ Database reset complete!');
    console.log('Login: admin / admin123');
  } finally {
    await connection.end();
  }
}

resetDatabase().catch(err => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
