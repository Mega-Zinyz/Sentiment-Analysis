/**
 * InSet Auto-Labeling Routes
 *
 * POST /api/raw-data/auto-label/:sessionId
 *   Body: { neutralMin?: number, neutralMax?: number }
 *   → Scores every tweet in the session against the InSet lexicon,
 *     writes inset_score + sentiment_label for all rows.
 *
 * POST /api/raw-data/relabel/:sessionId
 *   Body: { neutralMin: number, neutralMax: number }
 *   → Re-applies label thresholds on STORED inset_score values (no lexicon
 *     lookup — fast).  Requires auto-label to have been run first.
 *
 * GET /api/raw-data/label-distribution/:sessionId
 *   → Returns per-class counts, score statistics, and coverage info.
 */

'use strict';

const { getDb } = require('../config/mysql-database');

const INSET_LIBRARY_NAME = 'InSet Lexicon';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tokenise clean_text for InSet lookup.
 * clean_text at this point is URL-stripped + whitespace-normalised but NOT
 * Sastrawi-stemmed (stemming happens inside Python at train time).
 * We lowercase and strip non-alpha; min token length = 2 chars.
 */
function tokenise(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

/**
 * Load the InSet system library into a Map<word, {sentiment, weight}>.
 * Throws if the library has not been seeded yet.
 */
async function loadLexicon(db) {
  const [libs] = await db.execute(
    'SELECT id, name FROM word_libraries WHERE is_system = TRUE ORDER BY id ASC LIMIT 1'
  );
  if (libs.length === 0) {
    throw new Error(
      'InSet library not found. Run: node Backend/scripts/setup/seed-inset.js'
    );
  }

  const libraryId = libs[0].id;

  const [rows] = await db.execute(
    'SELECT word, sentiment, weight FROM word_library_words WHERE library_id = ?',
    [libraryId]
  );

  const lexicon = new Map();
  for (const r of rows) {
    lexicon.set(r.word.toLowerCase(), {
      sentiment: r.sentiment,         // 'positive' | 'negative'
      weight:    parseFloat(r.weight) // always stored positive; sign from sentiment
    });
  }

  return { lexicon, wordCount: rows.length, libraryId };
}

/**
 * Score a single tweet text against the loaded lexicon.
 * Returns { score, matchedTokens }.
 * positive word → +weight, negative word → −weight.
 */
function scoreTweet(text, lexicon) {
  const tokens = tokenise(text);
  let score         = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    const entry = lexicon.get(token);
    if (!entry) continue;
    if (entry.sentiment === 'positive') {
      score += entry.weight;
    } else if (entry.sentiment === 'negative') {
      score -= entry.weight;
    }
    matchedTokens++;
  }

  return { score, matchedTokens };
}

/**
 * Convert a numeric score to a sentiment label.
 * Outside the neutral band → Positive or Negative; inside → Neutral.
 */
function scoreToLabel(score, neutralMin, neutralMax) {
  if (score > neutralMax) return 'Positive';
  if (score < neutralMin) return 'Negative';
  return 'Neutral';
}

// ── Bulk UPDATE helper ────────────────────────────────────────────────────────

async function bulkUpdateScoresAndLabels(db, userId, scored) {
  const CHUNK = 500;
  for (let i = 0; i < scored.length; i += CHUNK) {
    const chunk = scored.slice(i, i + CHUNK);

    const scoreCases = chunk.map(s => `WHEN id = ${s.id} THEN ${s.score}`).join(' ');
    const labelCases = chunk.map(s => `WHEN id = ${s.id} THEN '${s.label}'`).join(' ');
    const ids        = chunk.map(s => s.id).join(',');

    await db.execute(`
      UPDATE raw_twitter_data
      SET inset_score    = CASE ${scoreCases} END,
          sentiment_label = CASE ${labelCases} END
      WHERE id IN (${ids}) AND user_id = ?
    `, [userId]);
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * POST /api/raw-data/auto-label/:sessionId
 *
 * Scores every tweet against InSet lexicon and writes:
 *   - inset_score   (raw sum of matched word weights, signed)
 *   - sentiment_label ('Positive' | 'Negative' | 'Neutral')
 *
 * Does NOT touch is_training_sample.
 *
 * Response includes coverage info (how many tweets had ≥1 lexicon match).
 * Note on negation: words like "tidak" are NOT in the lexicon (they are
 * Indonesian stopwords removed during Python preprocessing) so negation is
 * not handled — document as a limitation.
 */
async function autoLabelHandler(req, res) {
  try {
    const userId    = req.user.userId;
    const sessionId = req.params.sessionId;
    const neutralMin = parseFloat(req.body.neutralMin ?? -0.5);
    const neutralMax = parseFloat(req.body.neutralMax ??  0.5);

    if (neutralMin >= neutralMax) {
      return res.status(400).json({
        error: 'neutralMin harus lebih kecil dari neutralMax'
      });
    }

    const db = getDb();

    // Load lexicon
    const { lexicon, wordCount } = await loadLexicon(db);

    // Fetch tweets
    const [tweets] = await db.execute(
      'SELECT id, clean_text FROM raw_twitter_data WHERE user_id = ? AND session_id = ? ORDER BY id',
      [userId, sessionId]
    );

    if (tweets.length === 0) {
      return res.status(404).json({ error: 'Tidak ada tweet untuk sesi ini' });
    }

    // Score all tweets
    const scored = tweets.map(tweet => {
      const { score, matchedTokens } = scoreTweet(tweet.clean_text, lexicon);
      return {
        id:           tweet.id,
        score:        parseFloat(score.toFixed(4)),
        label:        scoreToLabel(score, neutralMin, neutralMax),
        matchedTokens
      };
    });

    // Bulk update
    await bulkUpdateScoresAndLabels(db, userId, scored);

    // Calculate distribution and coverage
    const distribution = { Positive: 0, Negative: 0, Neutral: 0 };
    let withMatches = 0;

    for (const s of scored) {
      distribution[s.label]++;
      if (s.matchedTokens > 0) withMatches++;
    }

    return res.json({
      success: true,
      total:   tweets.length,
      distribution,
      coverage: {
        withMatches,
        noMatches: tweets.length - withMatches,
        matchRate: ((withMatches / tweets.length) * 100).toFixed(1) + '%'
      },
      lexiconSize: wordCount,
      thresholds: { neutralMin, neutralMax }
    });

  } catch (error) {
    console.error('autoLabelHandler error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/raw-data/relabel/:sessionId
 *
 * Re-classifies tweets using STORED inset_score values and new thresholds.
 * Lexicon is NOT re-loaded — this is purely a threshold adjustment.
 * Requires auto-label to have been run first (inset_score IS NOT NULL).
 */
async function relabelHandler(req, res) {
  try {
    const userId    = req.user.userId;
    const sessionId = req.params.sessionId;
    const neutralMin = parseFloat(req.body.neutralMin ?? -0.5);
    const neutralMax = parseFloat(req.body.neutralMax ??  0.5);

    if (neutralMin >= neutralMax) {
      return res.status(400).json({
        error: 'neutralMin harus lebih kecil dari neutralMax'
      });
    }

    const db = getDb();

    // Guard: scores must exist
    const [[{ cnt }]] = await db.execute(
      'SELECT COUNT(*) AS cnt FROM raw_twitter_data WHERE user_id = ? AND session_id = ? AND inset_score IS NOT NULL',
      [userId, sessionId]
    );

    if (cnt === 0) {
      return res.status(400).json({
        error: 'Skor InSet belum ada. Jalankan auto-label terlebih dahulu.'
      });
    }

    // Re-apply threshold — pure SQL, no lexicon load
    await db.execute(`
      UPDATE raw_twitter_data
      SET sentiment_label = CASE
            WHEN inset_score > ?  THEN 'Positive'
            WHEN inset_score < ?  THEN 'Negative'
            ELSE 'Neutral'
          END
      WHERE user_id = ? AND session_id = ? AND inset_score IS NOT NULL
    `, [neutralMax, neutralMin, userId, sessionId]);

    // Fetch updated distribution
    const [distRows] = await db.execute(`
      SELECT sentiment_label, COUNT(*) AS count
      FROM raw_twitter_data
      WHERE user_id = ? AND session_id = ? AND inset_score IS NOT NULL
      GROUP BY sentiment_label
    `, [userId, sessionId]);

    const distribution = { Positive: 0, Negative: 0, Neutral: 0 };
    for (const r of distRows) distribution[r.sentiment_label] = r.count;

    return res.json({
      success: true,
      distribution,
      thresholds: { neutralMin, neutralMax }
    });

  } catch (error) {
    console.error('relabelHandler error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/raw-data/label-distribution/:sessionId
 *
 * Returns distribution of sentiment labels (from InSet scoring) and
 * score statistics per class.
 */
async function getLabelDistributionHandler(req, res) {
  try {
    const userId    = req.user.userId;
    const sessionId = req.params.sessionId;
    const db        = getDb();

    const [[{ total }]] = await db.execute(
      'SELECT COUNT(*) AS total FROM raw_twitter_data WHERE user_id = ? AND session_id = ?',
      [userId, sessionId]
    );

    const [distRows] = await db.execute(`
      SELECT
        sentiment_label,
        COUNT(*)          AS count,
        AVG(inset_score)  AS avg_score,
        MIN(inset_score)  AS min_score,
        MAX(inset_score)  AS max_score
      FROM raw_twitter_data
      WHERE user_id = ? AND session_id = ? AND inset_score IS NOT NULL
      GROUP BY sentiment_label
    `, [userId, sessionId]);

    const distribution = {};
    let labeled = 0;
    for (const r of distRows) {
      distribution[r.sentiment_label] = {
        count:    r.count,
        avgScore: parseFloat(r.avg_score).toFixed(3),
        minScore: parseFloat(r.min_score).toFixed(3),
        maxScore: parseFloat(r.max_score).toFixed(3)
      };
      labeled += r.count;
    }

    return res.json({
      success:    true,
      total,
      labeled,
      unlabeled:  total - labeled,
      distribution
    });

  } catch (error) {
    console.error('getLabelDistributionHandler error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  autoLabelHandler,
  relabelHandler,
  getLabelDistributionHandler
};
