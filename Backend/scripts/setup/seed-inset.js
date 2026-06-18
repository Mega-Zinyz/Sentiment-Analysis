#!/usr/bin/env node
/**
 * Seed InSet Lexicon (Indonesia Sentiment Lexicon) into word_library_words.
 *
 * Prerequisites:
 *   1. Run migration first:
 *        node Backend/scripts/migration/add-inset-columns.js
 *   2. Download InSet TSV files from https://github.com/fajri91/InSet
 *      and place them at:
 *        Backend/data/inset_positive.tsv
 *        Backend/data/inset_negative.tsv
 *      Format per file: Word<TAB>Weight  (header row: "Word\tWeight")
 *
 * Safe to re-run: uses INSERT IGNORE to skip duplicates.
 *
 * Usage:
 *   node Backend/scripts/setup/seed-inset.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql  = require('mysql2/promise');
const fs     = require('fs');
const path   = require('path');

const DATA_DIR       = path.join(__dirname, '../../data');
const POSITIVE_FILE  = path.join(DATA_DIR, 'inset_positive.tsv');
const NEGATIVE_FILE  = path.join(DATA_DIR, 'inset_negative.tsv');
const LIBRARY_NAME   = 'InSet Lexicon';
const CHUNK_SIZE     = 500; // rows per INSERT batch

// ── Parse a TSV file ────────────────────────────────────────────────────────
function parseTsv(filePath, sentimentLabel) {
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const entries = [];
  for (const line of lines) {
    // Skip header row
    if (line.toLowerCase().startsWith('word')) continue;

    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const word   = parts[0].trim().toLowerCase();
    const rawW   = parseFloat(parts[1].replace(',', '.'));
    const weight = Math.abs(rawW);  // always store as positive; sentiment column indicates sign

    if (!word || isNaN(weight)) continue;

    // DECIMAL(3,2) max = 9.99; clamp just in case
    const clampedWeight = Math.min(weight, 9.99).toFixed(2);
    entries.push([word, sentimentLabel, clampedWeight]);
  }

  return entries;
}

/**
 * Seed InSet lexicon into the database using an existing connection/pool.
 * Safe to call on startup — idempotent (INSERT IGNORE) and skips gracefully
 * if TSV files are missing.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} db
 */
async function seedInset(db) {
  // ── Verify TSV files exist ─────────────────────────────────────────────
  const missing = [];
  if (!fs.existsSync(POSITIVE_FILE)) missing.push(POSITIVE_FILE);
  if (!fs.existsSync(NEGATIVE_FILE)) missing.push(NEGATIVE_FILE);

  if (missing.length > 0) {
    console.warn('⚠️  InSet TSV file(s) missing — skipping InSet seeding:');
    missing.forEach(f => console.warn('   ' + f));
    return { skipped: true };
  }

  // ── Get admin user ─────────────────────────────────────────────────────
  const [admins] = await db.execute(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
  );
  if (admins.length === 0) {
    console.warn('⚠️  No admin user found — skipping InSet seeding.');
    return { skipped: true };
  }
  const adminId = admins[0].id;

  // ── Get or create InSet system library ────────────────────────────────
  const [existing] = await db.execute(
    'SELECT id FROM word_libraries WHERE name = ? AND is_system = TRUE LIMIT 1',
    [LIBRARY_NAME]
  );

  let libraryId;
  if (existing.length > 0) {
    libraryId = existing[0].id;
    console.log(`ℹ️  Library "${LIBRARY_NAME}" already exists (id=${libraryId}), re-seeding words...`);
  } else {
    const [result] = await db.execute(
      `INSERT INTO word_libraries (user_id, name, description, is_default, is_system)
       VALUES (?, ?, ?, FALSE, TRUE)`,
      [adminId, LIBRARY_NAME,
        'Indonesia Sentiment Lexicon (InSet) — fajri91/InSet. System library used for auto-labeling.']
    );
    libraryId = result.insertId;
    console.log(`✅ Created library "${LIBRARY_NAME}" (id=${libraryId})`);
  }

  // ── Parse TSV files ──────────────────────────────────────────────────
  console.log('Parsing InSet TSV files...');
  const positive = parseTsv(POSITIVE_FILE, 'positive');
  const negative = parseTsv(NEGATIVE_FILE, 'negative');
  const allWords = [...positive, ...negative];

  console.log(`  Positive words: ${positive.length}`);
  console.log(`  Negative words: ${negative.length}`);
  console.log(`  Total        : ${allWords.length}`);

  // ── Bulk insert in chunks ────────────────────────────────────────────
  console.log('Inserting into word_library_words...');
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < allWords.length; i += CHUNK_SIZE) {
    const chunk        = allWords.slice(i, i + CHUNK_SIZE);
    const rows         = chunk.map(([word, sentiment, weight]) => [libraryId, word, sentiment, weight]);
    const placeholders = rows.map(() => '(?,?,?,?)').join(',');
    const values       = rows.flat();

    const [result] = await db.execute(
      `INSERT IGNORE INTO word_library_words (library_id, word, sentiment, weight)
       VALUES ${placeholders}`,
      values
    );
    inserted += result.affectedRows;
    skipped  += chunk.length - result.affectedRows;

    const pct = Math.round(((i + chunk.length) / allWords.length) * 100);
    process.stdout.write(`\r  Progress: ${pct}%  (${inserted} inserted, ${skipped} skipped)`);
  }

  console.log(`\n✅ InSet seeding complete — inserted: ${inserted}, skipped: ${skipped}`);
  return { inserted, skipped, libraryId };
}

// ── Standalone runner ────────────────────────────────────────────────────────
async function seed() {
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'sentiment_analysis'
  });

  try {
    await seedInset(db);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  seed().catch(err => {
    console.error('\nSeeding failed:', err.message);
    process.exit(1);
  });
}

module.exports = { seedInset };
