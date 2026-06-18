#!/usr/bin/env node
/**
 * Migration: add InSet-related columns
 *
 *   raw_twitter_data.inset_score  DECIMAL(8,4) — raw lexicon score per tweet
 *   word_libraries.is_system      BOOLEAN      — marks system-wide libraries (e.g. InSet)
 *
 * Idempotent: skips ALTER if column already exists.
 * Run once: node Backend/scripts/migration/add-inset-columns.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'sentiment_analysis'
  });

  try {
    console.log('Running InSet column migration...\n');

    // ── 1. raw_twitter_data.inset_score ──────────────────────────────────
    const [[rtdCols]] = await db.execute(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'raw_twitter_data'
        AND COLUMN_NAME  = 'inset_score'
    `);

    if (rtdCols.cnt === 0) {
      await db.execute(`
        ALTER TABLE raw_twitter_data
        ADD COLUMN inset_score DECIMAL(8,4) DEFAULT NULL
        AFTER prediction_confidence
      `);
      console.log('  ✅ raw_twitter_data.inset_score added');
    } else {
      console.log('  ℹ️  raw_twitter_data.inset_score already exists, skipping');
    }

    // ── 2. word_libraries.is_system ──────────────────────────────────────
    const [[wlCols]] = await db.execute(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'word_libraries'
        AND COLUMN_NAME  = 'is_system'
    `);

    if (wlCols.cnt === 0) {
      await db.execute(`
        ALTER TABLE word_libraries
        ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE
        AFTER is_default
      `);
      console.log('  ✅ word_libraries.is_system added');
    } else {
      console.log('  ℹ️  word_libraries.is_system already exists, skipping');
    }

    console.log('\nMigration complete.');
  } finally {
    await db.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
