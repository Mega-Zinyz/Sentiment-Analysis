require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

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

// Get all tweet datasets for a user
router.get('/', async (req, res) => {
  try {
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
      // Insert tweets
      for (const tweet of tweets) {
        // Check if tweet already exists to avoid duplicates
        const [existing] = await connection.execute(`
          SELECT id FROM tweet_tweets WHERE tweet_id = ? AND dataset_id = ?
        `, [tweet.id, datasetId]);
        
        if (existing.length === 0) {
          await connection.execute(`
            INSERT INTO tweet_tweets (
              dataset_id, tweet_id, text, created_at, author_id, username, keywords
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            datasetId,
            tweet.id,
            tweet.text,
            tweet.created_at,
            tweet.author_id,
            tweet.username || null,
            keywords || null
          ]);
        }
      }
      
      // Update dataset's last_updated timestamp
      await connection.execute(`
        UPDATE tweet_datasets SET last_updated = NOW() WHERE id = ?
      `, [datasetId]);
      
      await connection.commit();
      
      res.json({ 
        success: true, 
        message: `Added ${tweets.length} tweets to dataset`,
        added: tweets.length
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Error adding tweets to dataset:', error);
    res.status(500).json({ error: 'Failed to add tweets to dataset' });
  }
});

// Delete tweets from a dataset
router.delete('/:id/tweets', async (req, res) => {
  try {
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

module.exports = router;