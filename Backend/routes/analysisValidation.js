const { getDb } = require('../config/mysql-database');

/**
 * Create validation sample for ALL classified tweets (no per-class limit)
 * POST /api/analysis-history/:analysisId/validation/sample
 */
async function createValidationSampleHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();

    // Verify analysis belongs to this user
    const [[analysis]] = await db.execute(
      `SELECT id, session_id, status FROM analysis_history WHERE id = ? AND user_id = ?`,
      [analysisId, userId]
    );
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
    if (analysis.status !== 'completed') return res.status(400).json({ error: 'Analysis not completed yet' });

    // Check if sample already exists
    const [[existing]] = await db.execute(
      `SELECT COUNT(*) as cnt FROM analysis_validation WHERE analysis_id = ? AND user_id = ?`,
      [analysisId, userId]
    );
    if (existing.cnt > 0) {
      return res.json({ success: true, message: 'Sample already exists', created: false, totalSamples: existing.cnt });
    }

    // Fetch ALL classified tweets (no per-class limit) grouped by class for ordering
    const [rows] = await db.query(
      `SELECT id, clean_text, raw_data, username_extracted, timestamp_extracted,
              predicted_sentiment, prediction_confidence
       FROM raw_twitter_data
       WHERE session_id = ? AND predicted_sentiment IS NOT NULL AND clean_text IS NOT NULL
       ORDER BY predicted_sentiment, RAND()`,
      [analysis.session_id]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No classified data found for this analysis' });
    }

    // Batch insert using a connection to avoid per-row round-trip overhead
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of rows) {
        const ts = row.timestamp_extracted instanceof Date
          ? row.timestamp_extracted.toISOString().slice(0, 19).replace('T', ' ')
          : row.timestamp_extracted;
        await conn.execute(
          `INSERT INTO analysis_validation
             (analysis_id, user_id, raw_data_id, clean_text, raw_data,
              username_extracted, timestamp_extracted, predicted_sentiment, prediction_confidence)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            parseInt(analysisId, 10), parseInt(userId, 10), row.id,
            row.clean_text, row.raw_data,
            row.username_extracted, ts,
            row.predicted_sentiment, row.prediction_confidence
          ]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const totalSamples = rows.length;

    res.json({ success: true, message: `Created ${totalSamples} validation samples`, created: true, totalSamples });
  } catch (error) {
    console.error('createValidationSampleHandler error:', error);
    res.status(500).json({ error: 'Failed to create validation sample', details: error.message });
  }
}

/**
 * Get validation progress and next unlabeled item
 * GET /api/analysis-history/:analysisId/validation
 */
async function getValidationHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();

    // Check if sample exists
    const [[countRow]] = await db.execute(
      `SELECT COUNT(*) as total,
              SUM(manual_label IS NOT NULL) as labeled
       FROM analysis_validation WHERE analysis_id = ? AND user_id = ?`,
      [analysisId, userId]
    );

    if (!countRow || countRow.total === 0) {
      return res.json({ success: true, exists: false });
    }

    const total   = parseInt(countRow.total)  || 0;
    const labeled = parseInt(countRow.labeled) || 0;

    // Get distribution of labels so far
    const [labelDist] = await db.execute(`
      SELECT predicted_sentiment, manual_label, COUNT(*) as cnt
      FROM analysis_validation
      WHERE analysis_id = ? AND user_id = ? AND manual_label IS NOT NULL
      GROUP BY predicted_sentiment, manual_label
    `, [analysisId, userId]);

    // Get next unlabeled item
    const [nextItems] = await db.execute(`
      SELECT id, clean_text, raw_data, username_extracted, timestamp_extracted,
             predicted_sentiment, prediction_confidence
      FROM analysis_validation
      WHERE analysis_id = ? AND user_id = ? AND manual_label IS NULL
      ORDER BY id LIMIT 1
    `, [analysisId, userId]);

    // Get per-class progress
    const [classCounts] = await db.execute(`
      SELECT predicted_sentiment,
             COUNT(*) as total,
             SUM(manual_label IS NOT NULL) as labeled
      FROM analysis_validation
      WHERE analysis_id = ? AND user_id = ?
      GROUP BY predicted_sentiment
    `, [analysisId, userId]);

    res.json({
      success: true,
      exists: true,
      total,
      labeled,
      remaining: total - labeled,
      isComplete: labeled >= total,
      progress: classCounts,
      labelDistribution: labelDist,
      nextItem: nextItems[0] || null
    });
  } catch (error) {
    console.error('getValidationHandler error:', error);
    res.status(500).json({ error: 'Failed to get validation data', details: error.message });
  }
}

/**
 * Submit manual label for one validation item
 * POST /api/analysis-history/:analysisId/validation/label
 */
async function submitValidationLabelHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const { itemId, label } = req.body;

    const validLabels = ['Positive', 'Negative', 'Neutral'];
    if (!itemId || !label || !validLabels.includes(label)) {
      return res.status(400).json({ error: 'itemId and label (Positive/Negative/Neutral) required' });
    }

    const db = getDb();
    const [result] = await db.execute(`
      UPDATE analysis_validation
      SET manual_label = ?, labeled_at = NOW()
      WHERE id = ? AND analysis_id = ? AND user_id = ?
    `, [label, itemId, analysisId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Validation item not found' });
    }

    // Return updated progress
    const [[countRow]] = await db.execute(
      `SELECT COUNT(*) as total, SUM(manual_label IS NOT NULL) as labeled
       FROM analysis_validation WHERE analysis_id = ? AND user_id = ?`,
      [analysisId, userId]
    );

    const total   = parseInt(countRow.total)  || 0;
    const labeled = parseInt(countRow.labeled) || 0;

    // Next unlabeled item
    const [nextItems] = await db.execute(`
      SELECT id, clean_text, raw_data, username_extracted, timestamp_extracted,
             predicted_sentiment, prediction_confidence
      FROM analysis_validation
      WHERE analysis_id = ? AND user_id = ? AND manual_label IS NULL
      ORDER BY id LIMIT 1
    `, [analysisId, userId]);

    res.json({
      success: true,
      total,
      labeled,
      remaining: total - labeled,
      isComplete: labeled >= total,
      nextItem: nextItems[0] || null
    });
  } catch (error) {
    console.error('submitValidationLabelHandler error:', error);
    res.status(500).json({ error: 'Failed to submit label', details: error.message });
  }
}

/**
 * Compute and return validation metrics (only when labeling is complete or forced)
 * GET /api/analysis-history/:analysisId/validation/metrics
 */
async function getValidationMetricsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();

    const [rows] = await db.execute(`
      SELECT predicted_sentiment, manual_label, prediction_confidence
      FROM analysis_validation
      WHERE analysis_id = ? AND user_id = ? AND manual_label IS NOT NULL
    `, [analysisId, userId]);

    if (rows.length === 0) {
      return res.json({ success: true, metrics: null, message: 'No labeled validation data yet' });
    }

    const classes = ['Positive', 'Negative', 'Neutral'];
    const metrics = computeMetrics(rows, classes);

    res.json({ success: true, metrics, labeledCount: rows.length });
  } catch (error) {
    console.error('getValidationMetricsHandler error:', error);
    res.status(500).json({ error: 'Failed to compute metrics', details: error.message });
  }
}

/**
 * Delete ALL validation data for an analysis (samples + labels)
 * DELETE /api/analysis-history/:analysisId/validation
 * After this, user can call POST /sample again to recreate with current tweet set
 */
async function resetValidationHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();

    const [result] = await db.execute(
      `DELETE FROM analysis_validation WHERE analysis_id = ? AND user_id = ?`,
      [analysisId, userId]
    );
    res.json({ success: true, message: `Validation data deleted (${result.affectedRows} rows)` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset', details: error.message });
  }
}

// ─── Metric computation ───────────────────────────────────────────────────────

function computeMetrics(rows, classes) {
  // Build confusion matrix  confusionMatrix[actual][predicted]
  const cm = {};
  classes.forEach(a => { cm[a] = {}; classes.forEach(p => { cm[a][p] = 0; }); });

  rows.forEach(r => {
    const actual    = capitalize(r.manual_label);
    const predicted = capitalize(r.predicted_sentiment);
    if (cm[actual] && cm[actual][predicted] !== undefined) cm[actual][predicted]++;
  });

  const total = rows.length;
  let correct = 0;
  classes.forEach(c => { correct += cm[c][c]; });
  const accuracy = total > 0 ? correct / total : 0;

  // Per-class precision / recall / f1
  const classMetrics = {};
  classes.forEach(cls => {
    const tp = cm[cls][cls];
    const fp = classes.reduce((s, a) => s + (a !== cls ? cm[a][cls] : 0), 0);
    const fn = classes.reduce((s, p) => s + (p !== cls ? cm[cls][p] : 0), 0);
    const support = classes.reduce((s, p) => s + cm[cls][p], 0);
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall    = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1        = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
    classMetrics[cls.toLowerCase()] = { precision, recall, 'f1-score': f1, support, tp, fp, fn };
  });

  // Macro average
  const macroP  = avg(classes.map(c => classMetrics[c.toLowerCase()].precision));
  const macroR  = avg(classes.map(c => classMetrics[c.toLowerCase()].recall));
  const macroF1 = avg(classes.map(c => classMetrics[c.toLowerCase()]['f1-score']));

  // Weighted average
  const weightedP  = classes.reduce((s, c) => s + classMetrics[c.toLowerCase()].precision * classMetrics[c.toLowerCase()].support, 0) / total;
  const weightedR  = classes.reduce((s, c) => s + classMetrics[c.toLowerCase()].recall    * classMetrics[c.toLowerCase()].support, 0) / total;
  const weightedF1 = classes.reduce((s, c) => s + classMetrics[c.toLowerCase()]['f1-score'] * classMetrics[c.toLowerCase()].support, 0) / total;

  // Confusion matrix as flat structure for frontend
  const confusionMatrix = classes.map(actual => ({
    actual,
    predictions: classes.map(predicted => ({ predicted, count: cm[actual][predicted] }))
  }));

  return {
    accuracy,
    total,
    correct,
    class_metrics: classMetrics,
    macro_avg:    { precision: macroP,    recall: macroR,    'f1-score': macroF1,  support: total },
    weighted_avg: { precision: weightedP, recall: weightedR, 'f1-score': weightedF1, support: total },
    confusion_matrix: confusionMatrix,
    classes
  };
}

function avg(arr) { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }

/**
 * Internal helper: auto-create validation sample after analysis completes.
 * Fire-and-forget — caller should .catch() errors.
 */
async function autoCreateValidationSample(analysisId, userId, sessionId) {
  const db = getDb();

  const [[existing]] = await db.execute(
    `SELECT COUNT(*) as cnt FROM analysis_validation WHERE analysis_id = ? AND user_id = ?`,
    [analysisId, userId]
  );
  if (existing.cnt > 0) return;

  const [rows] = await db.query(
    `SELECT id, clean_text, raw_data, username_extracted, timestamp_extracted,
            predicted_sentiment, prediction_confidence
     FROM raw_twitter_data
     WHERE session_id = ? AND predicted_sentiment IS NOT NULL AND clean_text IS NOT NULL
     ORDER BY predicted_sentiment, RAND()`,
    [sessionId]
  );
  if (rows.length === 0) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const ts = row.timestamp_extracted instanceof Date
        ? row.timestamp_extracted.toISOString().slice(0, 19).replace('T', ' ')
        : row.timestamp_extracted;
      await conn.execute(
        `INSERT INTO analysis_validation
           (analysis_id, user_id, raw_data_id, clean_text, raw_data,
            username_extracted, timestamp_extracted, predicted_sentiment, prediction_confidence)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          parseInt(analysisId, 10), parseInt(userId, 10), row.id,
          row.clean_text, row.raw_data, row.username_extracted, ts,
          row.predicted_sentiment, row.prediction_confidence
        ]
      );
    }
    await conn.commit();
    console.log(`✅ Auto-created ${rows.length} validation samples for analysis #${analysisId}`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createValidationSampleHandler,
  getValidationHandler,
  submitValidationLabelHandler,
  getValidationMetricsHandler,
  resetValidationHandler,
  autoCreateValidationSample
};
