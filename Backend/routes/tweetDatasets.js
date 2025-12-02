require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sentiment_analysis',
  charset: 'utf8mb4',
  timezone: '+00:00',
  connectTimeout: 60000,
  multipleStatements: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);
const SentimentWorkerPool = require('../utils/SentimentWorkerPool');

// Simple helper to ensure request is authenticated and has user info
function requireAuth(req, res) {
  if (!req.user || !req.user.userId) {
    res.status(401).json({ error: 'Access token required' });
    return false;
  }
  return true;
}

// Get all tweet datasets for a user
router.get('/', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    
    const [datasets] = await pool.execute(`
      SELECT 
        td.*,
        COUNT(tt.id) as tweet_count,
        GROUP_CONCAT(DISTINCT tt.keywords SEPARATOR ', ') as keywords
      FROM tweet_datasets td
      LEFT JOIN tweet_tweets tt ON td.id = tt.dataset_id
      WHERE td.user_id = ?
      GROUP BY td.id
      ORDER BY td.created_at DESC
    `, [userId]);
    
    res.json(datasets);
  } catch (error) {
    console.error('Error fetching tweet datasets:', error);
    res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

// Create a new tweet dataset
router.post('/', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Dataset name is required' });
    }
    
    const [result] = await pool.execute(`
      INSERT INTO tweet_datasets (user_id, name, description, created_at, last_updated)
      VALUES (?, ?, ?, NOW(), NOW())
    `, [userId, name.trim(), description?.trim() || null]);
    
    const [newDataset] = await pool.execute(`
      SELECT *, 0 as tweet_count, NULL as keywords
      FROM tweet_datasets 
      WHERE id = ?
    `, [result.insertId]);
    
    res.status(201).json(newDataset[0]);
  } catch (error) {
    console.error('Error creating tweet dataset:', error);
    res.status(500).json({ error: 'Failed to create dataset' });
  }
});

// Delete a tweet dataset and all its tweets
router.delete('/:id', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const datasetId = req.params.id;
    
    // Verify ownership
    const [dataset] = await pool.execute(`
      SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?
    `, [datasetId, userId]);
    
    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Delete tweets first (due to foreign key constraint)
    await pool.execute(`DELETE FROM tweet_tweets WHERE dataset_id = ?`, [datasetId]);
    
    // Delete dataset
    await pool.execute(`DELETE FROM tweet_datasets WHERE id = ?`, [datasetId]);
    
    res.json({ success: true, message: 'Dataset deleted successfully' });
  } catch (error) {
    console.error('Error deleting tweet dataset:', error);
    res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

// Get tweets for a specific dataset
router.get('/:id/tweets', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const datasetId = req.params.id;
    
    // Verify ownership
    const [dataset] = await pool.execute(`
      SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?
    `, [datasetId, userId]);
    
    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    const [tweets] = await pool.execute(`
      SELECT * FROM tweet_tweets 
      WHERE dataset_id = ? 
      ORDER BY created_at DESC
    `, [datasetId]);
    
    res.json(tweets);
  } catch (error) {
    console.error('Error fetching tweets:', error);
    res.status(500).json({ error: 'Failed to fetch tweets' });
  }
});

// Add tweets to a dataset
router.post('/:id/tweets', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const datasetId = req.params.id;
    const { tweets, keywords } = req.body;
    
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return res.status(400).json({ error: 'Tweets array is required' });
    }
    
    // Verify ownership
    const [dataset] = await pool.execute(`
      SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?
    `, [datasetId, userId]);
    
    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      console.log('🔁 Saving tweets to dataset', { datasetId, count: Array.isArray(tweets) ? tweets.length : 0 });
      if (Array.isArray(tweets) && tweets.length > 0) {
        console.log('🔎 Sample tweet payload:', tweets[0]);
      }

      // Insert tweets with defensive validation and per-tweet error handling.
      const failedTweets = [];
      let addedCount = 0;

      // Ensure logs directory exists for failed tweet samples
      const logsDir = path.join(__dirname, '..', 'logs');
      try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {/* ignore */}
      const failedLogPath = path.join(logsDir, 'failed_tweets.log');

      for (const tweet of tweets) {
        try {
          // Normalize tweet fields from different API formats and coerce types
          const tweetIdRaw = tweet.id || tweet.id_str || tweet.tweet_id || tweet.tweetId || null;
          let tweetId = tweetIdRaw !== null && tweetIdRaw !== undefined ? String(tweetIdRaw) : null;

          if (!tweetId) {
            console.warn('⚠️ Skipping tweet without id:', tweet);
            failedTweets.push({ reason: 'missing_id', tweet });
            try { fs.appendFileSync(failedLogPath, JSON.stringify({ when: new Date().toISOString(), reason: 'missing_id', tweet }) + '\n'); } catch (e) {}
            continue; // skip tweets with no id
          }

          // Normalize numeric-looking IDs by stripping non-digits (helps with some provider formats)
          const numericOnly = tweetId.replace(/[^0-9]/g, '');
          if (numericOnly.length >= 5 && numericOnly.length >= tweetId.replace(/\D/g,'').length) {
            tweetId = numericOnly;
          }

          // Enforce DB column length for tweet_id (VARCHAR(50))
          if (tweetId.length > 50) tweetId = tweetId.slice(0, 50);

          // Check if tweet already exists to avoid duplicates
          const [existing] = await connection.execute(`
            SELECT id FROM tweet_tweets WHERE tweet_id = ? AND dataset_id = ?
          `, [tweetId, datasetId]);

          if (existing.length > 0) {
            console.log('ℹ️ Tweet already exists, skipping:', { tweetId });
            continue;
          }

          // Text handling: fallback and truncate to a safe length (1000 chars)
          const rawText = tweet.text || tweet.full_text || tweet.tweet_text || '';
          const tweetText = String(rawText).slice(0, 1000);

          // Created at handling: ensure it's a valid SQL datetime; fallback to NOW()
          let createdAt = null;
          const createdAtRaw = tweet.created_at || tweet.createdAt || tweet.timestamp || null;
          if (createdAtRaw) {
            const dt = (createdAtRaw instanceof Date) ? createdAtRaw : new Date(createdAtRaw);
            if (!isNaN(dt.getTime())) {
              createdAt = dt.toISOString().slice(0, 19).replace('T', ' ');
            }
          }
          if (!createdAt) {
            // Use server-side NOW() by passing NULL and letting DB fill it with default, but
            // since our INSERT expects a value, use current timestamp string as fallback.
            createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
          }

          let authorId = tweet.author_id || tweet.user_id || (tweet.user && tweet.user.id_str) || null;
          authorId = authorId ? String(authorId).slice(0, 50) : null;

          const usernameRaw = tweet.username || tweet.screen_name || (tweet.user && (tweet.user.screen_name || tweet.user.name)) || null;
          const username = usernameRaw ? String(usernameRaw).slice(0, 50) : null;

          // Keywords truncation to fit VARCHAR(500)
          const keywordsSafe = keywords ? String(keywords).slice(0, 500) : null;

          // Insert tweet row
          console.log('➕ Inserting tweet:', { tweetId, datasetId, createdAt });
          await connection.execute(`
            INSERT INTO tweet_tweets (
              dataset_id, tweet_id, text, created_at, author_id, username, keywords
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            datasetId,
            tweetId,
            tweetText,
            createdAt,
            authorId,
            username,
            keywordsSafe
          ]);

          addedCount += 1;

        } catch (innerError) {
          // Log and record the failure but continue processing other tweets
          console.error('Error inserting tweet (continuing):', innerError && innerError.stack ? innerError.stack : innerError);
          const failRecord = { when: new Date().toISOString(), reason: innerError?.message || String(innerError), tweetId: tweetId || null, tweetSample: { id: tweet && (tweet.id || tweet.id_str || tweet.tweet_id) || null, text: String(tweet && (tweet.text || tweet.full_text || '')).slice(0,200) } };
          failedTweets.push(failRecord);
          try { fs.appendFileSync(failedLogPath, JSON.stringify(failRecord) + '\n'); } catch (e) {}
          continue;
        }
      }
      
      // Update dataset's last_updated timestamp
      await connection.execute(`
        UPDATE tweet_datasets SET last_updated = NOW() WHERE id = ?
      `, [datasetId]);
      
      await connection.commit();

      res.json({ 
        success: true, 
        message: `Processed ${tweets.length} tweets: added ${addedCount}, failed ${failedTweets.length}`,
        processed: tweets.length,
        added: addedCount,
        failed: failedTweets.length,
        failures: failedTweets.slice(0, 10) // include up to 10 failure samples for debugging
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    // Always log the full error stack to server logs for post-mortem analysis
    console.error('Error adding tweets to dataset:', error && error.stack ? error.stack : error);

    // Allow returning stack traces in the response when running in development
    // or if the client explicitly requests it via the `X-Debug` header.
    const xDebug = req && (req.headers['x-debug'] || req.headers['x_debug']);
    const sendStack = process.env.NODE_ENV === 'development' || xDebug === '1' || xDebug === 'true';

    res.status(500).json({ 
      error: 'Failed to add tweets to dataset',
      details: error?.message || String(error),
      stack: sendStack ? error?.stack : undefined
    });
  }
});

// Delete tweets from a dataset
router.delete('/:id/tweets', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const datasetId = req.params.id;
    const { tweetIds } = req.body;
    
    console.log('🗑️ Delete request - Dataset ID:', datasetId, 'Tweet IDs:', tweetIds);
    
    if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
      return res.status(400).json({ error: 'Tweet IDs array is required' });
    }
    
    // Verify ownership
    const [dataset] = await pool.execute(`
      SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?
    `, [datasetId, userId]);
    
    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Check if we should delete by database ID or tweet_id
    // First, let's check what type of IDs we received by looking at existing tweets
    const [existingTweets] = await pool.execute(`
      SELECT id, tweet_id FROM tweet_tweets WHERE dataset_id = ? LIMIT 5
    `, [datasetId]);
    
    console.log('🔍 Sample existing tweets:', existingTweets.map(t => ({ id: t.id, tweet_id: t.tweet_id })));
    console.log('🔍 Received IDs look like database IDs?', tweetIds.every(id => /^\d+$/.test(id)));
    
    // Determine which field to use for deletion
    // If all IDs are numeric and look like database IDs (integers), use database ID
    // If they look like Twitter IDs (strings with prefixes like 'mock_'), use tweet_id
    const allNumeric = tweetIds.every(id => /^\d+$/.test(id));
    const allTwitterIds = tweetIds.every(id => typeof id === 'string' && (id.includes('mock_') || id.length > 10));
    
    const useDbId = allNumeric && !allTwitterIds;
    
    console.log('🎯 All numeric:', allNumeric, 'All Twitter IDs:', allTwitterIds, 'Using database ID:', useDbId);
    
    const placeholders = tweetIds.map(() => '?').join(',');
    const deleteQuery = useDbId 
      ? `DELETE FROM tweet_tweets WHERE dataset_id = ? AND id IN (${placeholders})`
      : `DELETE FROM tweet_tweets WHERE dataset_id = ? AND tweet_id IN (${placeholders})`;
    
    console.log('🗑️ Delete query:', deleteQuery);
    console.log('🗑️ Delete params:', [datasetId, ...tweetIds]);
    
    const [result] = await pool.execute(deleteQuery, [datasetId, ...tweetIds]);
    
    console.log('✅ Delete result:', { affectedRows: result.affectedRows, insertId: result.insertId });
    
    // Update dataset's last_updated timestamp
    await pool.execute(`
      UPDATE tweet_datasets SET last_updated = NOW() WHERE id = ?
    `, [datasetId]);
    
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} tweets`,
      deleted: result.affectedRows,
      debug: {
        receivedIds: tweetIds,
        usedDbId: useDbId,
        affectedRows: result.affectedRows
      }
    });
    
  } catch (error) {
    console.error('Error deleting tweets:', error);
    res.status(500).json({ error: 'Failed to delete tweets' });
  }
});

// Update a tweet's text
router.put('/:datasetId/tweets/:tweetId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { datasetId, tweetId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Tweet text is required' });
    }
    
    // Verify ownership
    const [dataset] = await pool.execute(`
      SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?
    `, [datasetId, userId]);
    
    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    const [result] = await pool.execute(`
      UPDATE tweet_tweets 
      SET text = ?, edited = TRUE, last_updated = NOW()
      WHERE dataset_id = ? AND tweet_id = ?
    `, [text.trim(), datasetId, tweetId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tweet not found' });
    }
    
    res.json({ success: true, message: 'Tweet updated successfully' });
    
  } catch (error) {
    console.error('Error updating tweet:', error);
    res.status(500).json({ error: 'Failed to update tweet' });
  }
});

/**
 * Trigger sentiment analysis for a tweet dataset
 * POST /api/tweet-datasets/:id/analyze
 * Body: { libraryId?: number }
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const userId = req.user.userId;
    const datasetId = req.params.id;
    const { libraryId } = req.body || {};

    // Verify ownership
    const [datasetRows] = await pool.execute(`SELECT * FROM tweet_datasets WHERE id = ? AND user_id = ?`, [datasetId, userId]);
    if (datasetRows.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    // Get tweets for dataset
    const [tweets] = await pool.execute(`SELECT id, text FROM tweet_tweets WHERE dataset_id = ? ORDER BY id`, [datasetId]);
    if (!tweets || tweets.length === 0) {
      return res.status(400).json({ error: 'No tweets found in this dataset' });
    }

    // Prepare training data from word library
    let trainingSamples = [];
    if (libraryId) {
      const [libRows] = await pool.execute('SELECT id, name FROM word_libraries WHERE id = ? AND user_id = ?', [libraryId, userId]);
      if (libRows.length === 0) {
        return res.status(404).json({ error: 'Word library not found for this user' });
      }

      const [samples] = await pool.execute('SELECT tweet_text, sentiment FROM word_library_samples WHERE library_id = ?', [libraryId]);
      const [words] = await pool.execute('SELECT word, sentiment FROM word_library_words WHERE library_id = ? ORDER BY weight DESC', [libraryId]);

      // Use samples if available, else build synthetic samples from words
      if (samples && samples.length > 0) {
        trainingSamples = samples.map(s => ({ text: s.tweet_text, label: s.sentiment }));
      } else if (words && words.length > 0) {
        // Generate small synthetic samples (3-5 words) per sentiment
        const wordsBySentiment = { positive: [], negative: [], neutral: [] };
        for (const w of words) {
          if (w.sentiment && wordsBySentiment[w.sentiment]) wordsBySentiment[w.sentiment].push(w.word);
        }
        for (const sentiment of ['positive','negative','neutral']) {
          const list = wordsBySentiment[sentiment];
          if (!list || list.length === 0) continue;
          for (let i = 0; i < Math.min(5, Math.max(1, Math.floor(list.length/3))); i++) {
            const num = 3 + Math.floor(Math.random()*3);
            const chosen = [];
            for (let j = 0; j < num; j++) chosen.push(list[Math.floor(Math.random()*list.length)]);
            trainingSamples.push({ text: chosen.join(' '), label: sentiment });
          }
        }
      }
    } else {
      // If no library specified, try to find a default library for the user
      const [libs] = await pool.execute('SELECT id FROM word_libraries WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC LIMIT 1', [userId]);
      if (libs && libs.length > 0) {
        const libId = libs[0].id;
        const [samples] = await pool.execute('SELECT tweet_text, sentiment FROM word_library_samples WHERE library_id = ?', [libId]);
        const [words] = await pool.execute('SELECT word, sentiment FROM word_library_words WHERE library_id = ? ORDER BY weight DESC', [libId]);
        if (samples && samples.length > 0) trainingSamples = samples.map(s => ({ text: s.tweet_text, label: s.sentiment }));
        else if (words && words.length > 0) {
          const wordsBySentiment = { positive: [], negative: [], neutral: [] };
          for (const w of words) if (w.sentiment && wordsBySentiment[w.sentiment]) wordsBySentiment[w.sentiment].push(w.word);
          for (const sentiment of ['positive','negative','neutral']) {
            const list = wordsBySentiment[sentiment];
            if (!list || list.length === 0) continue;
            for (let i = 0; i < Math.min(5, Math.max(1, Math.floor(list.length/3))); i++) {
              const num = 3 + Math.floor(Math.random()*3);
              const chosen = [];
              for (let j = 0; j < num; j++) chosen.push(list[Math.floor(Math.random()*list.length)]);
              trainingSamples.push({ text: chosen.join(' '), label: sentiment });
            }
          }
        }
      }
    }

    if (!trainingSamples || trainingSamples.length < 3) {
      return res.status(400).json({ error: 'Insufficient training data. Provide a libraryId with samples or add training samples to a library.' });
    }

    // Initialize worker pool
    let workerPool = null;
    try {
      workerPool = new SentimentWorkerPool(4);
      await workerPool.initialize();
    } catch (wpErr) {
      console.error('Failed to initialize worker pool for dataset analysis:', wpErr.message);
      workerPool = null; // fallback to sequential python execution
    }

    // Progress tracking key
    const progressKey = `dataset_${datasetId}_${Date.now()}`;
    if (!global.sentimentProgress) global.sentimentProgress = new Map();
    global.sentimentProgress.set(progressKey, {
      status: 'processing',
      totalItems: tweets.length,
      processedItems: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(tweets.length / 300),
      predictions: [],
      datasetId,
      startedAt: new Date()
    });

    // Respond immediately and process in background
    res.json({ success: true, message: 'Dataset analysis started', progressKey, totalItems: tweets.length });

    // Background processing
    (async () => {
      try {
        const BATCH_SIZE = 300;
        const totalBatches = Math.ceil(tweets.length / BATCH_SIZE);
        let allPredictions = [];

        if (workerPool) {
          const concurrentBatches = Math.min(4, totalBatches);
          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += concurrentBatches) {
            const batchGroup = [];
            for (let i = 0; i < concurrentBatches && (batchIndex + i) < totalBatches; i++) {
              const currentBatchIndex = batchIndex + i;
              const startIdx = currentBatchIndex * BATCH_SIZE;
              const endIdx = Math.min(startIdx + BATCH_SIZE, tweets.length);
              const batchData = tweets.slice(startIdx, endIdx).map(t => ({ id: t.id, clean_text: t.text }));
              const predictionTexts = batchData.map(b => b.clean_text);

              const p = workerPool.predict(trainingSamples.map(s => ({ text: s.text, label: s.label.toLowerCase() })), predictionTexts)
                .then(preds => preds.map((prediction, idx) => ({ id: batchData[idx].id, prediction: (typeof prediction === 'string' ? { label: prediction, confidence: 0.33 } : prediction) })))
                .catch(err => {
                  console.error('Worker pool batch failed:', err.message);
                  // fallback neutral predictions
                  return batchData.map(b => ({ id: b.id, prediction: { label: 'neutral', confidence: 0.33 } }));
                });

              batchGroup.push(p);
            }

            const results = await Promise.all(batchGroup);
            for (const r of results) allPredictions.push(...r);

            // Update progress
            const processed = Math.min((batchIndex + concurrentBatches) * BATCH_SIZE, tweets.length);
            if (global.sentimentProgress.has(progressKey)) {
              const pg = global.sentimentProgress.get(progressKey);
              pg.processedItems = processed;
              pg.currentBatch = Math.min(batchIndex + concurrentBatches, totalBatches);
              pg.lastUpdate = new Date();
            }
          }
        } else {
          // Sequential fallback using python script per batch
          const { spawnSync } = require('child_process');
          const os = require('os');
          const pathModule = require('path');
          const pythonPath = process.env.PYTHON_PATH || (os.platform() === 'win32' ? 'python' : 'python3');
          const pythonScript = pathModule.join(__dirname, '..', 'utils', 'sentiment_worker_indonesian.py');

          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIdx = batchIndex * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, tweets.length);
            const batchData = tweets.slice(startIdx, endIdx).map(t => ({ id: t.id, clean_text: t.text }));
            const input = { type: 'predict', training_data: trainingSamples.map(s => ({ text: s.text, label: s.label.toLowerCase() })), texts: batchData.map(b => b.clean_text) };
            const result = spawnSync(pythonPath, [pythonScript], { input: JSON.stringify(input) + '\n', maxBuffer: 20 * 1024 * 1024, timeout: 240000 });
            let preds = [];
            try {
              const out = (result.stdout || '').toString('utf-8');
              const lines = out.trim().split('\n');
              for (const line of lines) {
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === 'result' && parsed.predictions) {
                    preds = parsed.predictions;
                    break;
                  }
                } catch (_) {}
              }
            } catch (e) { preds = []; }

            if (!preds || preds.length !== batchData.length) {
              preds = batchData.map(() => ({ label: 'neutral', confidence: 0.33 }));
            }

            allPredictions.push(...preds.map((p, idx) => ({ id: batchData[idx].id, prediction: (typeof p === 'string' ? { label: p, confidence: 0.33 } : p) })));

            if (global.sentimentProgress.has(progressKey)) {
              const pg = global.sentimentProgress.get(progressKey);
              pg.processedItems = endIdx;
              pg.currentBatch = batchIndex + 1;
              pg.lastUpdate = new Date();
            }
          }
        }

        // Compute statistics
        const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
        allPredictions.forEach(p => {
          const lbl = (p.prediction.label || 'neutral').toLowerCase();
          if (lbl === 'positive') sentimentCounts.positive++;
          else if (lbl === 'negative') sentimentCounts.negative++;
          else sentimentCounts.neutral++;
        });

        // Save analysis to history
        try {
          await pool.execute(`
            INSERT INTO analysis_history (user_id, keyword, tweet_count, results, dataset_used, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
          `, [userId, datasetRows[0].name || '', tweets.length, JSON.stringify({ sentimentCounts }), `dataset_${datasetId}`]);
        } catch (historyErr) {
          console.error('Failed to save dataset analysis history:', historyErr.message);
        }

        // Mark progress completed
        if (global.sentimentProgress.has(progressKey)) {
          const pg = global.sentimentProgress.get(progressKey);
          pg.status = 'completed';
          pg.predictions = allPredictions;
          pg.sentimentCounts = sentimentCounts;
          pg.completedAt = new Date();
        }

        // Shutdown worker pool
        try { if (workerPool) await workerPool.shutdown(); } catch (_) {}

      } catch (bgErr) {
        console.error('Background dataset analysis failed:', bgErr);
        if (global.sentimentProgress.has(progressKey)) {
          const pg = global.sentimentProgress.get(progressKey);
          pg.status = 'error';
          pg.error = bgErr.message;
        }
      }
    })();

  } catch (error) {
    console.error('Error starting dataset analysis:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: 'Failed to start dataset analysis', details: error?.message || String(error) });
  }
});

module.exports = router;