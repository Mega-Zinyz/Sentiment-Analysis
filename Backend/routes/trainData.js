const { getDb } = require('../config/mysql-database');

// Get processed training data from database
async function getTrainDataHandler(req, res) {
  try {
    const db = getDb();
    const userId = req.user.userId;
    
    // Get processed training data for the current user
    const query = `
      SELECT id, dataset_name, original_text as Tweet, 
             processed_text as Processed_Tweet, sentiment_label as Label, 
             processed_at
      FROM training_data_processed 
      WHERE user_id = ? 
      ORDER BY processed_at DESC
    `;
    
    const [rows] = await db.execute(query, [userId]);
    
    // Format for frontend compatibility
    const headers = ['Tweet', 'Label', 'Processed_Tweet'];
    
    res.json({ 
      headers: headers,
      rows: rows 
    });
  } catch (error) {
    console.error('Error fetching training data:', error);
    res.status(500).json({ error: 'Failed to fetch training data.' });
  }
}

// Save training data to database
async function saveTrainDataHandler(req, res) {
  try {
    const { headers, rows } = req.body;
    const userId = req.user.userId;
    
    if (!headers || !rows) {
      return res.status(400).json({ error: 'Invalid data format.' });
    }

    const db = getDb();
    
    // Clear existing processed data for this user
    await db.execute('DELETE FROM training_data_processed WHERE user_id = ?', [userId]);
    
    // Insert new processed data
    const insertQuery = `
      INSERT INTO training_data_processed 
      (user_id, original_id, dataset_name, original_text, processed_text, sentiment_label) 
      VALUES (?, 1, 'Default Dataset', ?, ?, ?)
    `;
    
    let savedCount = 0;
    for (const row of rows) {
      const tweet = row.Tweet || row.original_text || '';
      const processedTweet = row.Processed_Tweet || row.processed_text || tweet;
      const label = row.Label || row.sentiment_label || 'Neutral';
      
      if (tweet.trim()) {
        await db.execute(insertQuery, [userId, tweet, processedTweet, label]);
        savedCount++;
      }
    }
    
    res.json({ success: true, saved: savedCount });
  } catch (error) {
    console.error('Error saving training data:', error);
    res.status(500).json({ error: 'Failed to save training data.' });
  }
}

module.exports = { getTrainDataHandler, saveTrainDataHandler };
