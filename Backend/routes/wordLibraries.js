const express = require('express');
const router = express.Router();
const { getDb } = require('../config/mysql-database');

// Get all word libraries for current user
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    
    const [libraries] = await db.execute(`
      SELECT 
        wl.*,
        COUNT(DISTINCT wlw.id) as word_count,
        COUNT(DISTINCT wls.id) as sample_count
      FROM word_libraries wl
      LEFT JOIN word_library_words wlw ON wl.id = wlw.library_id
      LEFT JOIN word_library_samples wls ON wl.id = wls.library_id
      WHERE wl.user_id = ?
      GROUP BY wl.id
      ORDER BY wl.is_default DESC, wl.created_at DESC
    `, [userId]);
    
    res.json({ success: true, libraries });
  } catch (error) {
    console.error('Error fetching word libraries:', error);
    res.status(500).json({ error: 'Failed to fetch word libraries' });
  }
});

// Get specific library with words and samples
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    
    // Get library details
    const [libraries] = await db.execute(`
      SELECT * FROM word_libraries 
      WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // Get words grouped by sentiment
    const [words] = await db.execute(`
      SELECT word, sentiment, weight
      FROM word_library_words
      WHERE library_id = ?
      ORDER BY sentiment, word
    `, [libraryId]);
    
    // Get sample tweets grouped by sentiment
    const [samples] = await db.execute(`
      SELECT id, tweet_text, sentiment, created_at
      FROM word_library_samples
      WHERE library_id = ?
      ORDER BY sentiment, created_at DESC
    `, [libraryId]);
    
    // Group words by sentiment
    const wordsBySentiment = {
      positive: words.filter(w => w.sentiment === 'positive'),
      negative: words.filter(w => w.sentiment === 'negative'),
      neutral: words.filter(w => w.sentiment === 'neutral')
    };
    
    // Group samples by sentiment
    const samplesBySentiment = {
      positive: samples.filter(s => s.sentiment === 'positive'),
      negative: samples.filter(s => s.sentiment === 'negative'),
      neutral: samples.filter(s => s.sentiment === 'neutral')
    };
    
    res.json({
      success: true,
      library: libraries[0],
      words: wordsBySentiment,
      samples: samplesBySentiment
    });
  } catch (error) {
    console.error('Error fetching library details:', error);
    res.status(500).json({ error: 'Failed to fetch library details' });
  }
});

// Create new word library
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Library name is required' });
    }
    
    const [result] = await db.execute(`
      INSERT INTO word_libraries (user_id, name, description)
      VALUES (?, ?, ?)
    `, [userId, name, description || '']);
    
    res.json({ success: true, libraryId: result.insertId });
  } catch (error) {
    console.error('Error creating library:', error);
    res.status(500).json({ error: 'Failed to create library' });
  }
});

// Add words to library
router.post('/:id/words', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const { words, sentiment } = req.body;
    
    if (!words || !Array.isArray(words) || !sentiment) {
      return res.status(400).json({ error: 'Words array and sentiment are required' });
    }
    
    // Verify ownership
    const [libraries] = await db.execute(`
      SELECT id FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    let addedCount = 0;
    for (const word of words) {
      if (word.trim()) {
        try {
          await db.execute(`
            INSERT INTO word_library_words (library_id, word, sentiment)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE sentiment = VALUES(sentiment)
          `, [libraryId, word.trim().toLowerCase(), sentiment]);
          addedCount++;
        } catch (err) {
          // Skip duplicates
        }
      }
    }
    
    res.json({ success: true, added: addedCount });
  } catch (error) {
    console.error('Error adding words:', error);
    res.status(500).json({ error: 'Failed to add words' });
  }
});

// Add sample tweet to library
router.post('/:id/samples', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const { tweetText, sentiment } = req.body;
    
    if (!tweetText || !sentiment) {
      return res.status(400).json({ error: 'Tweet text and sentiment are required' });
    }
    
    // Verify ownership
    const [libraries] = await db.execute(`
      SELECT id FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const [result] = await db.execute(`
      INSERT INTO word_library_samples (library_id, tweet_text, sentiment)
      VALUES (?, ?, ?)
    `, [libraryId, tweetText, sentiment]);
    
    res.json({ success: true, sampleId: result.insertId });
  } catch (error) {
    console.error('Error adding sample:', error);
    res.status(500).json({ error: 'Failed to add sample tweet' });
  }
});

// Delete word from library
router.delete('/:id/words/:word', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const word = req.params.word;
    
    // Verify ownership
    const [libraries] = await db.execute(`
      SELECT id FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    await db.execute(`
      DELETE FROM word_library_words
      WHERE library_id = ? AND word = ?
    `, [libraryId, word]);
    
    res.json({ success: true, message: 'Word deleted successfully' });
  } catch (error) {
    console.error('Error deleting word:', error);
    res.status(500).json({ error: 'Failed to delete word' });
  }
});

// Delete sample from library
router.delete('/:id/samples/:sampleId', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const sampleId = req.params.sampleId;
    
    // Verify ownership
    const [libraries] = await db.execute(`
      SELECT id FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    await db.execute(`
      DELETE FROM word_library_samples
      WHERE id = ? AND library_id = ?
    `, [sampleId, libraryId]);
    
    res.json({ success: true, message: 'Sample deleted successfully' });
  } catch (error) {
    console.error('Error deleting sample:', error);
    res.status(500).json({ error: 'Failed to delete sample' });
  }
});

// Delete entire library
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    
    // Check if default library
    const [libraries] = await db.execute(`
      SELECT is_default FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    if (libraries[0].is_default) {
      return res.status(400).json({ error: 'Cannot delete default library' });
    }
    
    await db.execute(`DELETE FROM word_libraries WHERE id = ? AND user_id = ?`, [libraryId, userId]);
    
    res.json({ success: true, message: 'Library deleted successfully' });
  } catch (error) {
    console.error('Error deleting library:', error);
    res.status(500).json({ error: 'Failed to delete library' });
  }
});

// Import labeled tweets from raw_twitter_data as samples
router.post('/:id/import-labeled-tweets', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Verify library exists and belongs to user
    const [libraries] = await db.execute(`
      SELECT id FROM word_libraries WHERE id = ? AND user_id = ?
    `, [libraryId, userId]);
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // Get all labeled tweets from raw_twitter_data for this session
    const [labeledTweets] = await db.execute(`
      SELECT id, clean_text, sentiment_label 
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NOT NULL
    `, [userId, sessionId]);
    
    if (labeledTweets.length === 0) {
      return res.status(400).json({ error: 'No labeled tweets found in this session' });
    }
    
    let samplesAdded = 0;
    let wordsAdded = 0;
    const wordSet = new Set();
    
    // Import each labeled tweet as a sample
    for (const tweet of labeledTweets) {
      // Convert sentiment label to lowercase
      const sentiment = tweet.sentiment_label.toLowerCase();
      
      // Insert sample
      await db.execute(`
        INSERT INTO word_library_samples (library_id, user_id, tweet_text, sentiment)
        VALUES (?, ?, ?, ?)
      `, [libraryId, userId, tweet.clean_text, sentiment]);
      
      samplesAdded++;
      
      // Extract words from tweet
      const words = tweet.clean_text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);
      
      // Add unique words to set with their sentiment
      words.forEach(word => {
        wordSet.add(JSON.stringify({ word, sentiment }));
      });
    }
    
    // Insert unique words into word_library_words
    for (const wordData of wordSet) {
      const { word, sentiment } = JSON.parse(wordData);
      
      try {
        await db.execute(`
          INSERT IGNORE INTO word_library_words (library_id, word, sentiment, weight)
          VALUES (?, ?, ?, 1.00)
        `, [libraryId, word, sentiment]);
        wordsAdded++;
      } catch (err) {
        // Ignore duplicate key errors
        if (err.code !== 'ER_DUP_ENTRY') {
          console.error('Error inserting word:', err);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Labeled tweets imported successfully',
      samplesAdded,
      wordsAdded,
      totalWords: wordSet.size
    });
  } catch (error) {
    console.error('Error importing labeled tweets:', error);
    res.status(500).json({ error: 'Failed to import labeled tweets' });
  }
});

// Import ALL tweets from a session (not just labeled) - for direct import
router.post('/:id/import-all-tweets', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const libraryId = req.params.id;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Verify library ownership
    const [libraries] = await db.execute(
      'SELECT id FROM word_libraries WHERE id = ? AND user_id = ?',
      [libraryId, userId]
    );
    
    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // Get ALL tweets from the session (labeled or not)
    const [tweets] = await db.execute(`
      SELECT id, clean_text, sentiment_label
      FROM raw_twitter_data 
      WHERE session_id = ?
      ORDER BY id
    `, [sessionId]);
    
    if (tweets.length === 0) {
      return res.status(404).json({ error: 'No tweets found in this session' });
    }
    
    let samplesAdded = 0;
    const wordSet = new Set();
    
    // Import all tweets as samples
    // If a tweet has a label, use it; otherwise, default to 'neutral'
    for (const tweet of tweets) {
      const sentiment = tweet.sentiment_label || 'neutral';
      
      try {
        await db.execute(`
          INSERT INTO word_library_samples (library_id, tweet_text, sentiment)
          VALUES (?, ?, ?)
        `, [libraryId, tweet.clean_text, sentiment]);
        samplesAdded++;
        
        // Extract words from the tweet
        const words = tweet.clean_text
          .toLowerCase()
          .replace(/[^\w\s]/g, '') // Remove special characters
          .split(/\s+/) // Split by whitespace
          .filter(word => word.length > 2); // Only words longer than 2 characters
        
        // Add unique word-sentiment pairs to the set
        words.forEach(word => {
          wordSet.add(JSON.stringify({ word, sentiment }));
        });
      } catch (err) {
        console.error('Error inserting sample:', err);
      }
    }
    
    // Insert unique words
    let wordsAdded = 0;
    for (const wordData of wordSet) {
      const { word, sentiment } = JSON.parse(wordData);
      
      try {
        await db.execute(`
          INSERT IGNORE INTO word_library_words (library_id, word, sentiment, weight)
          VALUES (?, ?, ?, 1.00)
        `, [libraryId, word, sentiment]);
        wordsAdded++;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') {
          console.error('Error inserting word:', err);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'All tweets imported successfully',
      samplesAdded,
      wordsAdded,
      totalWords: wordSet.size
    });
  } catch (error) {
    console.error('Error importing all tweets:', error);
    res.status(500).json({ error: 'Failed to import tweets' });
  }
});

module.exports = router;
