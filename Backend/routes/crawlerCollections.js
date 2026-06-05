const express = require('express');
const router = express.Router();
const { getDb } = require('../config/mysql-database');
const { v4: uuidv4 } = require('uuid');
const AuditLogger = require('../utils/auditLogger');
const { cancelCrawlJob } = require('../utils/job-queue');

/**
 * Get all collections for user
 * GET /api/crawler/collections
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = getDb();

    const [collections] = await db.execute(`
      SELECT 
        id,
        collection_id,
        name,
        description,
        keywords,
        status,
        tweet_count,
        total_tweets_target,
        total_tweets_collected,
        created_at,
        updated_at
      FROM crawler_collections
      WHERE user_id = ? AND status != 'deleted'
      ORDER BY updated_at DESC
    `, [userId]);

    res.json({
      success: true,
      collections: collections.map(col => ({
        id: col.id,
        collectionId: col.collection_id,
        name: col.name,
        description: col.description,
        keywords: col.keywords ? col.keywords.split(',').map(k => k.trim()) : [],
        status: col.status,
        tweetCount: col.tweet_count,
        totalTarget: col.total_tweets_target,
        totalCollected: col.total_tweets_collected,
        createdAt: col.created_at,
        updatedAt: col.updated_at
      }))
    });
  } catch (error) {
    console.error('Error getting collections:', error);
    res.status(500).json({ error: 'Failed to get collections' });
  }
});

/**
 * Create new collection
 * POST /api/crawler/collections
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description, keywords } = req.body;
    const db = getDb();

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    if (name.length > 255) {
      return res.status(400).json({ error: 'Collection name must be less than 255 characters' });
    }

    const collectionId = uuidv4();
    const keywordsStr = Array.isArray(keywords) ? keywords.join(', ') : keywords || '';

    await db.execute(`
      INSERT INTO crawler_collections (user_id, collection_id, name, description, keywords, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [userId, collectionId, name.trim(), description || '', keywordsStr]);

    await AuditLogger.logCredentialAccess(
      userId,
      'COLLECTION_CREATED',
      req.ip,
      req.get('User-Agent'),
      { collectionName: name }
    );

    res.json({
      success: true,
      message: 'Collection created successfully',
      collection: {
        collectionId,
        name: name.trim(),
        description: description || '',
        keywords: keywordsStr ? keywordsStr.split(',').map(k => k.trim()) : [],
        status: 'active',
        tweetCount: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

/**
 * Get collection details with tweets
 * GET /api/crawler/collections/:collectionId
 */
router.get('/:collectionId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const { page = 1, limit = 50, labeled = 'all' } = req.query;
    const db = getDb();

    // Get collection info
    const [collections] = await db.execute(`
      SELECT * FROM crawler_collections
      WHERE user_id = ? AND collection_id = ?
    `, [userId, collectionId]);

    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const collection = collections[0];
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit) || 50));
    const safePage  = Math.max(1, parseInt(page) || 1);
    const offset    = (safePage - 1) * safeLimit;

    // Get tweets with optional filtering
    // LIMIT/OFFSET inlined — mysql2 prepared statements reject JS numbers
    // for LIMIT/OFFSET (HY000 "Incorrect arguments to mysqld_stmt_execute").
    let tweetsQuery = `
      SELECT
        id, tweet_id, text, username, author_id,
        created_at_tweet, url, likes, retweets, replies,
        is_labeled, sentiment_label, manual_label,
        notes, source, imported_at
      FROM crawler_tweets
      WHERE user_id = ? AND collection_id = ?
    `;

    let params = [userId, collection.id];

    if (labeled === 'labeled') {
      tweetsQuery += ` AND is_labeled = TRUE`;
    } else if (labeled === 'unlabeled') {
      tweetsQuery += ` AND is_labeled = FALSE`;
    }

    tweetsQuery += ` ORDER BY imported_at DESC LIMIT ${safeLimit} OFFSET ${offset}`;

    const [tweets] = await db.execute(tweetsQuery, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM crawler_tweets WHERE user_id = ? AND collection_id = ?`;
    let countParams = [userId, collection.id];

    if (labeled === 'labeled') {
      countQuery += ` AND is_labeled = TRUE`;
    } else if (labeled === 'unlabeled') {
      countQuery += ` AND is_labeled = FALSE`;
    }

    const [countResult] = await db.execute(countQuery, countParams);
    const total = countResult[0].total;

    // Actual tweet date range (min/max of tweet posting dates)
    const [dateRange] = await db.execute(
      `SELECT MIN(created_at_tweet) as tweet_date_min, MAX(created_at_tweet) as tweet_date_max
       FROM crawler_tweets WHERE user_id = ? AND collection_id = ? AND created_at_tweet IS NOT NULL`,
      [userId, collection.id]
    );

    res.json({
      success: true,
      collection: {
        id: collection.id,
        collectionId: collection.collection_id,
        name: collection.name,
        description: collection.description,
        keywords: collection.keywords ? collection.keywords.split(',').map(k => k.trim()) : [],
        status: collection.status,
        tweetCount: collection.tweet_count,
        totalTarget: collection.total_tweets_target,
        totalCollected: collection.total_tweets_collected,
        tweetDateMin: dateRange[0]?.tweet_date_min || null,
        tweetDateMax: dateRange[0]?.tweet_date_max || null,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at
      },
      tweets: tweets.map(tweet => ({
        id: tweet.id,
        tweetId: tweet.tweet_id,
        text: tweet.text,
        username: tweet.username,
        authorId: tweet.author_id,
        createdAt: tweet.created_at_tweet,
        url: tweet.url,
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        isLabeled: tweet.is_labeled,
        sentimentLabel: tweet.sentiment_label,
        manualLabel: tweet.manual_label,
        notes: tweet.notes,
        source: tweet.source,
        importedAt: tweet.imported_at
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1
      }
    });
  } catch (error) {
    console.error('Error getting collection details:', error);
    res.status(500).json({ error: 'Failed to get collection details' });
  }
});

/**
 * Update collection
 * PUT /api/crawler/collections/:collectionId
 */
router.put('/:collectionId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const { name, description, keywords, status } = req.body;
    const db = getDb();

    // Verify ownership
    const [collections] = await db.execute(`
      SELECT id FROM crawler_collections WHERE user_id = ? AND collection_id = ?
    `, [userId, collectionId]);

    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (keywords !== undefined) {
      updates.push('keywords = ?');
      values.push(Array.isArray(keywords) ? keywords.join(', ') : keywords);
    }
    if (status !== undefined && ['active', 'archived'].includes(status)) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(userId, collectionId);

    await db.execute(`
      UPDATE crawler_collections
      SET ${updates.join(', ')}
      WHERE user_id = ? AND collection_id = ?
    `, values);

    res.json({
      success: true,
      message: 'Collection updated successfully'
    });
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

/**
 * Delete collection — hard delete with full cascade:
 * tweets → job_progress → jobs → collection
 * DELETE /api/crawler/collections/:collectionId
 */
router.delete('/:collectionId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const db = getDb();

    // Verify ownership and get numeric PK
    const [collections] = await db.execute(
      'SELECT id FROM crawler_collections WHERE user_id = ? AND collection_id = ?',
      [userId, collectionId]
    );
    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const collectionPk = collections[0].id;

    // 1. Delete all tweets in this collection
    await db.execute('DELETE FROM crawler_tweets WHERE collection_id = ?', [collectionPk]);

    // 2. Find all jobs associated with this collection (collectionId stored in config JSON)
    const [jobs] = await db.execute(
      `SELECT job_id, status FROM crawler_jobs
       WHERE user_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(config, '$.collectionId')) = ?`,
      [userId, collectionId]
    );

    if (jobs.length > 0) {
      // Cancel any running/queued jobs so the worker stops
      for (const job of jobs) {
        if (['queued', 'processing'].includes(job.status)) {
          cancelCrawlJob(job.job_id);
        }
      }

      // Delete job progress records
      const jobIds = jobs.map(j => j.job_id);
      const placeholders = jobIds.map(() => '?').join(', ');
      await db.execute(
        `DELETE FROM crawler_job_progress WHERE job_id IN (${placeholders})`,
        jobIds
      );

      // Delete the jobs themselves
      await db.execute(
        `DELETE FROM crawler_jobs WHERE user_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(config, '$.collectionId')) = ?`,
        [userId, collectionId]
      );
    }

    // 3. Hard delete the collection record
    await db.execute(
      'DELETE FROM crawler_collections WHERE user_id = ? AND collection_id = ?',
      [userId, collectionId]
    );

    res.json({
      success: true,
      message: 'Collection and all associated data deleted',
      deleted: { tweets: true, jobs: jobs.length }
    });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

/**
 * Get collection stats
 * GET /api/crawler/collections/:collectionId/stats
 */
router.get('/:collectionId/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const db = getDb();

    const [collections] = await db.execute(`
      SELECT id FROM crawler_collections WHERE user_id = ? AND collection_id = ?
    `, [userId, collectionId]);

    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const [stats] = await db.execute(`
      SELECT
        COUNT(*) as total_tweets,
        SUM(CASE WHEN is_labeled = TRUE THEN 1 ELSE 0 END) as labeled_tweets,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        AVG(CAST(likes AS DECIMAL(10,2))) as avg_likes,
        AVG(CAST(retweets AS DECIMAL(10,2))) as avg_retweets
      FROM crawler_tweets
      WHERE collection_id = ?
    `, [collections[0].id]);

    res.json({
      success: true,
      stats: {
        totalTweets: stats[0].total_tweets || 0,
        labeledTweets: stats[0].labeled_tweets || 0,
        unlabeledTweets: (stats[0].total_tweets || 0) - (stats[0].labeled_tweets || 0),
        sentiment: {
          positive: stats[0].positive_count || 0,
          negative: stats[0].negative_count || 0,
          neutral: stats[0].neutral_count || 0
        },
        avgLikes: parseFloat(stats[0].avg_likes) || 0,
        avgRetweets: parseFloat(stats[0].avg_retweets) || 0
      }
    });
  } catch (error) {
    console.error('Error getting collection stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Bulk delete tweets from a collection
 * DELETE /api/crawler/collections/:collectionId/tweets/bulk
 * Body: { tweetIds: [1, 2, 3, ...] }
 */
router.delete('/:collectionId/tweets/bulk', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const { tweetIds } = req.body;
    const db = getDb();

    if (!Array.isArray(tweetIds) || tweetIds.length === 0) {
      return res.status(400).json({ error: 'tweetIds array is required' });
    }

    const [collections] = await db.execute(
      'SELECT id FROM crawler_collections WHERE user_id = ? AND collection_id = ?',
      [userId, collectionId]
    );
    if (collections.length === 0) return res.status(404).json({ error: 'Collection not found' });

    const collectionPk = collections[0].id;

    const safeTweetIds = tweetIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
    if (safeTweetIds.length === 0) {
      return res.status(400).json({ error: 'No valid tweet IDs provided' });
    }

    const placeholders = safeTweetIds.map(() => '?').join(', ');
    const [result] = await db.execute(
      `DELETE FROM crawler_tweets WHERE id IN (${placeholders}) AND collection_id = ? AND user_id = ?`,
      [...safeTweetIds, collectionPk, userId]
    );

    await db.execute(
      'UPDATE crawler_collections SET tweet_count = (SELECT COUNT(*) FROM crawler_tweets WHERE collection_id = ?), updated_at = NOW() WHERE id = ?',
      [collectionPk, collectionPk]
    );

    res.json({ success: true, deleted: result.affectedRows, message: `${result.affectedRows} tweet(s) deleted` });
  } catch (error) {
    console.error('Error bulk deleting tweets:', error);
    res.status(500).json({ error: 'Failed to bulk delete tweets' });
  }
});

/**
 * Delete a single tweet from a collection
 * DELETE /api/crawler/collections/:collectionId/tweets/:tweetId
 */
router.delete('/:collectionId/tweets/:tweetId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId, tweetId } = req.params;
    const db = getDb();

    const [collections] = await db.execute(
      'SELECT id FROM crawler_collections WHERE user_id = ? AND collection_id = ?',
      [userId, collectionId]
    );
    if (collections.length === 0) return res.status(404).json({ error: 'Collection not found' });

    const collectionPk = collections[0].id;
    const [result] = await db.execute(
      'DELETE FROM crawler_tweets WHERE id = ? AND collection_id = ? AND user_id = ?',
      [tweetId, collectionPk, userId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tweet not found' });

    // Update tweet_count
    await db.execute(
      'UPDATE crawler_collections SET tweet_count = (SELECT COUNT(*) FROM crawler_tweets WHERE collection_id = ?), updated_at = NOW() WHERE id = ?',
      [collectionPk, collectionPk]
    );

    res.json({ success: true, message: 'Tweet deleted' });
  } catch (error) {
    console.error('Error deleting tweet:', error);
    res.status(500).json({ error: 'Failed to delete tweet' });
  }
});

/**
 * Transfer collection tweets to a new analysis session
 * POST /api/crawler/collections/:collectionId/send-to-analysis
 */
router.post('/:collectionId/send-to-analysis', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { collectionId } = req.params;
    const db = getDb();

    // Verify collection ownership
    const [collections] = await db.execute(
      `SELECT id, name, tweet_count FROM crawler_collections
       WHERE user_id = ? AND collection_id = ? AND status != 'deleted'`,
      [userId, collectionId]
    );
    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const collection = collections[0];
    if (!collection.tweet_count || collection.tweet_count === 0) {
      return res.status(400).json({ error: 'Collection belum memiliki tweet' });
    }

    // Fetch all tweets from the collection
    const [tweets] = await db.execute(
      `SELECT text, username, created_at_tweet
       FROM crawler_tweets
       WHERE user_id = ? AND collection_id = ?
       ORDER BY imported_at ASC`,
      [userId, collection.id]
    );
    if (tweets.length === 0) {
      return res.status(400).json({ error: 'Tidak ada tweet di collection ini' });
    }

    // Create a new data session
    const sessionId = `crawler_${collectionId.substring(0, 8)}_${Date.now()}`;
    const sessionName = `Crawler: ${collection.name}`;

    await db.execute(
      `INSERT INTO data_sessions (user_id, session_id, session_name, status, total_items, started_at)
       VALUES (?, ?, ?, 'uploaded', ?, NOW())`,
      [userId, sessionId, sessionName, tweets.length]
    );

    // Insert tweets into raw_twitter_data with basic cleaning
    const CHUNK_SIZE = 2000;
    const items = tweets.map(t => {
      const rawText = t.text || '';
      const cleanText = rawText
        .toLowerCase()
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#(\w+)/g, '$1')
        .replace(/\brt\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return [userId, sessionId, rawText, t.created_at_tweet || null, t.username || 'unknown', cleanText];
    });

    let totalInserted = 0;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const [result] = await db.execute(
        `INSERT INTO raw_twitter_data (user_id, session_id, raw_data, timestamp_extracted, username_extracted, clean_text)
         VALUES ${placeholders}`,
        chunk.flat()
      );
      totalInserted += result.affectedRows;
    }

    res.json({
      success: true,
      sessionId,
      totalItems: totalInserted,
      message: `${totalInserted} tweet berhasil dipindahkan ke sesi analisis`
    });

  } catch (error) {
    console.error('Error sending collection to analysis:', error);
    res.status(500).json({ error: 'Gagal membuat sesi analisis', details: error.message });
  }
});

module.exports = router;
