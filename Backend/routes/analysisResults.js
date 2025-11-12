const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/mysql-database');

const resultsPath = path.join(__dirname, '../analysis_results.json');

async function saveAnalysisResultsHandler(req, res) {
  const { keyword, results, timestamp } = req.body;
  const userId = req.user.userId;
  
  if (!keyword || !results || !Array.isArray(results) || !userId) {
    return res.status(400).json({ error: 'Invalid data format.' });
  }

  const db = getDb();
  
  try {
    const sessionTimestamp = timestamp || new Date().toISOString();
    const sessionId = `API_${keyword.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    
    // Calculate sentiment distribution
    const sentimentCounts = {
      positive: results.filter(r => r.sentiment === 'positive').length,
      negative: results.filter(r => r.sentiment === 'negative').length,
      neutral: results.filter(r => r.sentiment === 'neutral').length
    };

    // Start transaction
    await db.execute('START TRANSACTION');

    try {
      // Insert into analysis_history table
      await db.execute(`
        INSERT INTO analysis_history 
        (user_id, session_id, session_name, analysis_type, source_description, 
         total_items, processed_items, training_samples, results, status, 
         processing_time_ms, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        sessionId,
        keyword,
        'api',
        `Twitter API analysis for "${keyword}"`,
        results.length,
        results.length,
        0,
        JSON.stringify({
          sentimentDistribution: sentimentCounts,
          totalAnalyzed: results.length,
          source: 'twitter_api'
        }),
        'completed',
        0,
        sessionTimestamp,
        sessionTimestamp
      ]);

      // Insert individual results into raw_twitter_data table
      const CHUNK_SIZE = 1000;
      let totalInserted = 0;

      for (let i = 0; i < results.length; i += CHUNK_SIZE) {
        const chunk = results.slice(i, i + CHUNK_SIZE);
        
        // Prepare batch insert data
        const insertData = chunk.map(result => [
          userId,
          sessionId,
          result.text || result.clean_text || 'No text available',
          result.timestamp || sessionTimestamp,
          result.username || null,
          result.clean_text || result.text || 'No text available',
          result.sentiment ? result.sentiment.charAt(0).toUpperCase() + result.sentiment.slice(1) : 'Neutral',
          result.confidence || 0.8
        ]);

        // Create bulk insert query
        const placeholders = insertData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const insertQuery = `
          INSERT INTO raw_twitter_data 
          (user_id, session_id, raw_data, timestamp_extracted, username_extracted, 
           clean_text, predicted_sentiment, prediction_confidence) 
          VALUES ${placeholders}
        `;

        const queryParams = insertData.flat();
        const [result] = await db.execute(insertQuery, queryParams);
        totalInserted += result.affectedRows;
      }

      // Commit transaction
      await db.execute('COMMIT');

      // Also save to file for backward compatibility
      let allResults = [];
      if (fs.existsSync(resultsPath)) {
        const data = fs.readFileSync(resultsPath, 'utf8');
        allResults = JSON.parse(data);
      }

      const newSession = {
        id: Date.now(),
        keyword,
        timestamp: sessionTimestamp,
        totalTweets: results.length,
        results: results.map(r => ({
          text: r.text || r.clean_text,
          sentiment: r.sentiment,
          id: r.id
        })),
        sentimentCounts
      };

      allResults.push(newSession);
      fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));

      console.log(`✅ API Analysis saved: ${totalInserted} records inserted for session ${sessionId}`);

      res.json({ 
        success: true, 
        saved: results.length,
        sessionId: sessionId,
        message: `Analysis saved successfully with ${totalInserted} detailed results`
      });

    } catch (error) {
      // Rollback transaction on error
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error saving API analysis results:', error);
    res.status(500).json({ 
      error: 'Failed to save results.',
      details: error.message 
    });
  }
}

function getAnalysisResultsHandler(req, res) {
  try {
    if (!fs.existsSync(resultsPath)) {
      return res.json({ sessions: [] });
    }

    const data = fs.readFileSync(resultsPath, 'utf8');
    const allResults = JSON.parse(data);
    
    // Return summary without full tweet text to keep response light
    const sessions = allResults.map(session => ({
      id: session.id,
      keyword: session.keyword,
      timestamp: session.timestamp,
      totalTweets: session.totalTweets,
      sentimentCounts: session.sentimentCounts
    }));

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load results.' });
  }
}

module.exports = { saveAnalysisResultsHandler, getAnalysisResultsHandler };