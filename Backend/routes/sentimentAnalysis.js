const { getDb } = require('../config/mysql-database');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const SentimentWorkerPool = require('../utils/SentimentWorkerPool');

// Use python3 for Docker/Linux, or python/python3 for local development
// Set PYTHON_PATH environment variable to override (e.g., for custom Windows Python path)
const pythonPath = process.env.PYTHON_PATH || (os.platform() === 'win32' ? 'python' : 'python3');

// Global worker pool instance
let workerPool = null;

/**
 * Train model and predict sentiment for remaining data
 * POST /api/raw-data/analyze/:sessionId
 */
async function analyzeSentimentHandler(req, res) {
  let trainingFile = null;
  let sessionId = null;
  let userId = null;
  
  try {
    userId = req.user.userId;
    sessionId = req.params.sessionId;
    const db = getDb();
    
    console.log('Starting sentiment analysis for session ' + sessionId + ', user ' + userId);
    
    // Get training data
    const [trainingData] = await db.execute(`
      SELECT id, clean_text, sentiment_label
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND is_training_sample = TRUE
      ORDER BY id
    `, [userId, sessionId]);
    
    if (trainingData.length < 15) {
      return res.status(400).json({ 
        error: `Insufficient training data. Found ${trainingData.length}, need at least 15 labeled samples` 
      });
    }
    
    // Validate training data distribution
    const labelCounts = trainingData.reduce((counts, item) => {
      counts[item.sentiment_label] = (counts[item.sentiment_label] || 0) + 1;
      return counts;
    }, {});
    
    if (labelCounts.Positive < 5 || labelCounts.Negative < 5 || labelCounts.Neutral < 5) {
      return res.status(400).json({ 
        error: 'Need at least 5 samples each of Positive, Negative, and Neutral sentiment',
        currentDistribution: labelCounts
      });
    }
    
    // Get unlabeled data for prediction
    const [unlabeledData] = await db.execute(`
      SELECT id, clean_text
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND is_training_sample = FALSE
      ORDER BY id
    `, [userId, sessionId]);
    
    if (unlabeledData.length === 0) {
      return res.status(400).json({ 
        error: 'No unlabeled data found for prediction' 
      });
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 [${sessionId}] STARTING SENTIMENT ANALYSIS`);
    console.log(`   Training samples: ${trainingData.length}`);
    console.log(`   Items to predict: ${unlabeledData.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // For large datasets, process in batches to prevent timeout
    const BATCH_SIZE = 1000; // Increased batch size for worker pool efficiency
    const totalBatches = Math.ceil(unlabeledData.length / BATCH_SIZE);
    
    console.log(`📊 [${sessionId}] Processing ${unlabeledData.length} items in ${totalBatches} batches of ${BATCH_SIZE} each`);
    
    // Prepare training data for Python script (this stays constant)
    const trainingDataFormatted = trainingData.map(item => ({
      text: item.clean_text,
      label: item.sentiment_label.toLowerCase()
    }));
    
    // Initialize worker pool if not already done
    if (!workerPool) {
      console.log('🔄 Initializing sentiment worker pool...');
      workerPool = new SentimentWorkerPool(2); // 2 workers for parallel processing
      try {
        await workerPool.initialize();
        console.log('✅ Worker pool initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize worker pool, falling back to original method:', error.message);
        workerPool = null;
      }
    }
    
    // Update data_sessions to 'processing' status
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'processing', analysis_type = 'manual', training_samples = ?
      WHERE session_id = ? AND user_id = ?
    `, [trainingData.length, sessionId, userId]);
    
    // Initialize progress tracking
    if (!global.sentimentProgress) {
      global.sentimentProgress = new Map();
    }
    
    global.sentimentProgress.set(sessionId, {
      status: 'processing',
      totalItems: unlabeledData.length,
      processedItems: 0,
      currentBatch: 0,
      totalBatches: totalBatches,
      predictions: [],
      startTime: new Date(),
      lastUpdate: new Date()
    });
    
    let allPredictions = [];
    
    // Choose processing method based on worker pool availability
    if (workerPool) {
      console.log('🚀 Using high-performance worker pool for sentiment analysis...');
      
      // Process data in batches using worker pool
      const batchPromises = [];
      const concurrentBatches = Math.min(2, totalBatches); // Limit concurrent batches
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += concurrentBatches) {
        const batchGroup = [];
        
        for (let i = 0; i < concurrentBatches && (batchIndex + i) < totalBatches; i++) {
          const currentBatchIndex = batchIndex + i;
          const startIdx = currentBatchIndex * BATCH_SIZE;
          const endIdx = Math.min(startIdx + BATCH_SIZE, unlabeledData.length);
          const batchData = unlabeledData.slice(startIdx, endIdx);
          const predictionTexts = batchData.map(item => item.clean_text);
          
          console.log(`📊 Processing batch ${currentBatchIndex + 1}/${totalBatches}: items ${startIdx + 1}-${endIdx} (worker pool)`);
          
          const batchPromise = workerPool.predict(trainingDataFormatted, predictionTexts)
            .then(predictions => {
              const batchPredictions = predictions.map((prediction, idx) => ({
                id: batchData[idx].id,
                prediction: prediction
              }));
              
              console.log(`✅ Completed batch ${currentBatchIndex + 1}/${totalBatches} - ${predictions.length} predictions (worker pool)`);
              return { batchIndex: currentBatchIndex, predictions: batchPredictions, endIdx };
            })
            .catch(error => {
              console.error(`❌ Worker pool batch ${currentBatchIndex + 1} failed:`, error.message);
              throw error;
            });
          
          batchGroup.push(batchPromise);
        }
        
        // Wait for current batch group to complete
        const batchResults = await Promise.all(batchGroup);
        
        // Add results to main array and update progress
        for (const result of batchResults) {
          allPredictions.push(...result.predictions);
          
          // Update progress
          const progressData = global.sentimentProgress.get(sessionId);
          progressData.processedItems = result.endIdx;
          progressData.currentBatch = result.batchIndex + 1;
          progressData.lastUpdate = new Date();
        }
      }
      
    } else {
      console.log('📁 Using file-based processing (fallback method)...');
      
      // Create temporary files
      const tempDir = os.tmpdir();
      const baseTimestamp = Date.now();
      trainingFile = path.join(tempDir, `training_${sessionId}_${baseTimestamp}.json`);
      
      // Write training data (this stays constant for all batches)
      fs.writeFileSync(trainingFile, JSON.stringify(trainingDataFormatted, null, 2));
      
      console.log('Created training file, starting batch processing...');
      
      // Python script path
      const pythonScript = path.join(__dirname, '..', 'python', 'sentiment_analysis_batch.py');
      
      // Process data in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, unlabeledData.length);
        const batchData = unlabeledData.slice(startIdx, endIdx);
        const predictionTexts = batchData.map(item => item.clean_text);
        
        console.log(`📊 Processing batch ${batchIndex + 1}/${totalBatches}: items ${startIdx + 1}-${endIdx} (file-based)`);
        
        // Create batch-specific temporary files
        const predictionFile = path.join(tempDir, `prediction_${sessionId}_${baseTimestamp}_batch${batchIndex}.json`);
        const resultsFile = path.join(tempDir, `results_${sessionId}_${baseTimestamp}_batch${batchIndex}.json`);
        
        try {
          // Write batch prediction texts
          fs.writeFileSync(predictionFile, JSON.stringify(predictionTexts, null, 2));
          
          // Clean environment variables from Unicode characters
          const cleanEnv = {};
          for (const [key, value] of Object.entries(process.env)) {
            if (typeof value === 'string') {
              cleanEnv[key] = value.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[^\x00-\x7F]/g, '');
            } else {
              cleanEnv[key] = value;
            }
          }
          
          const result = spawnSync(pythonPath, [
            pythonScript,
            '--train-file', trainingFile,
            '--predict-file', predictionFile,
            '--output-file', resultsFile
          ], {
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            timeout: 120000, // 2 minutes timeout per batch
            env: {
              ...cleanEnv,
              PYTHONIOENCODING: 'utf-8',
              PYTHONUNBUFFERED: '1',
              LC_ALL: 'en_US.UTF-8',
              LANG: 'en_US.UTF-8'
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'buffer'
          });
          
          if (result.error) {
            console.error(`Python execution failed for batch ${batchIndex + 1}:`, result.error.message);
            throw new Error(`Python execution error: ${result.error.message}`);
          }
          
          const stdout = result.stdout ? result.stdout.toString('utf-8') : '';
          const stderr = result.stderr ? result.stderr.toString('utf-8') : '';
          
          if (result.status !== 0) {
            console.error(`Python stderr for batch ${batchIndex + 1}:`, stderr);
            console.error(`Python stdout for batch ${batchIndex + 1}:`, stdout);
            throw new Error(`Python script failed with code ${result.status}: ${stderr || 'Unknown error'}`);
          }
          
          // Read batch results
          if (!fs.existsSync(resultsFile)) {
            throw new Error(`Results file not created for batch ${batchIndex + 1}`);
          }
          
          const batchResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
          
          if (!batchResults.predictions || batchResults.predictions.length !== predictionTexts.length) {
            throw new Error(`Batch ${batchIndex + 1} prediction count mismatch. Expected ${predictionTexts.length}, got ${batchResults.predictions?.length || 0}`);
          }
          
          // Store predictions with original data IDs
          const batchPredictions = batchResults.predictions.map((prediction, idx) => ({
            id: batchData[idx].id,
            prediction: prediction
          }));
          
          allPredictions.push(...batchPredictions);
          
          // Update progress
          const progressData = global.sentimentProgress.get(sessionId);
          progressData.processedItems = endIdx;
          progressData.currentBatch = batchIndex + 1;
          progressData.lastUpdate = new Date();
          
          const batchProgress = ((batchIndex + 1) / totalBatches * 100).toFixed(1);
          console.log(`✅ [${sessionId}] Completed batch ${batchIndex + 1}/${totalBatches} (${batchProgress}%) - ${batchResults.predictions.length} predictions`);
          
        } finally {
          // Clean up batch files
          try {
            if (fs.existsSync(predictionFile)) fs.unlinkSync(predictionFile);
            if (fs.existsSync(resultsFile)) fs.unlinkSync(resultsFile);
          } catch (cleanupError) {
            console.warn(`Warning: Could not delete batch files for batch ${batchIndex + 1}:`, cleanupError.message);
          }
        }
        
        // Small delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`\n🎉 [${sessionId}] All batches completed! Total predictions: ${allPredictions.length}`);
    
    // Update database with all predictions in chunks
    console.log(`\n� [${sessionId}] Updating database with predictions...`);
    const UPDATE_BATCH_SIZE = 500;
    let updatedCount = 0;
    
    for (let i = 0; i < allPredictions.length; i += UPDATE_BATCH_SIZE) {
      const updateChunk = allPredictions.slice(i, i + UPDATE_BATCH_SIZE);
      
      // Build bulk update query (safely stringify predictions)
      const sentimentCases = updateChunk.map(item => {
        const predRaw = item.prediction;
        let predStr = '';
        if (predRaw === null || predRaw === undefined) {
          predStr = '';
        } else if (typeof predRaw === 'string') {
          predStr = predRaw;
        } else if (typeof predRaw === 'object') {
          // if python returns an object like { label: 'Positive', confidence: 0.9 }
          predStr = predRaw.label ? String(predRaw.label) : JSON.stringify(predRaw);
        } else {
          predStr = String(predRaw);
        }

        const escapedPred = predStr.replace(/'/g, "''");
        return `WHEN id = ${item.id} THEN '${escapedPred}'`;
      }).join(' ');
      
      // Build confidence cases
      const confidenceCases = updateChunk.map(item => {
        const predRaw = item.prediction;
        let confidence = 0;
        if (typeof predRaw === 'object' && predRaw.confidence) {
          confidence = predRaw.confidence;
        }
        return `WHEN id = ${item.id} THEN ${confidence}`;
      }).join(' ');
      
      const ids = updateChunk.map(item => item.id).join(',');
      
      const updateQuery = `
        UPDATE raw_twitter_data 
        SET predicted_sentiment = CASE ${sentimentCases} END,
            prediction_confidence = CASE ${confidenceCases} END
        WHERE id IN (${ids}) AND user_id = ? AND session_id = ?
      `;
      
      const [updateResult] = await db.execute(updateQuery, [userId, sessionId]);
      updatedCount += updateResult.affectedRows;
      
      const updateProgress = Math.min(i + UPDATE_BATCH_SIZE, allPredictions.length);
      const updatePercent = (updateProgress / allPredictions.length * 100).toFixed(1);
      console.log(`   [${sessionId}] Saved: ${updateProgress}/${allPredictions.length} (${updatePercent}%)`);
    }
    
    // Calculate final statistics
    const predictions = allPredictions.map(p => p.prediction);
    const sentimentCounts = predictions.reduce((counts, sentiment) => {
      const normalizedSentiment = sentiment.toLowerCase();
      counts[normalizedSentiment] = (counts[normalizedSentiment] || 0) + 1;
      return counts;
    }, { positive: 0, negative: 0, neutral: 0 });
    
    // Update progress to completed
    const progressData = global.sentimentProgress.get(sessionId);
    progressData.status = 'completed';
    progressData.processedItems = unlabeledData.length;
    progressData.predictions = predictions;
    progressData.sentimentCounts = sentimentCounts;
    progressData.lastUpdate = new Date();
    
    const processingTimeMs = new Date() - progressData.startTime;
    
    // Save analysis to history
    try {
      // Determine session name from sessionId
      const sessionParts = sessionId.split('_');
      const sessionName = sessionParts[0] || 'Unknown Session';
      
      // Insert analysis history record
      await db.execute(`
        INSERT INTO analysis_history 
        (user_id, session_id, session_name, analysis_type, source_description, 
         total_items, processed_items, training_samples, results, status, 
         processing_time_ms, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        userId,
        sessionId,
        sessionName,
        'manual', // Default to manual, can be enhanced later
        `Sentiment analysis of ${predictions.length} items from ${sessionName} dataset`,
        unlabeledData.length,
        predictions.length,
        trainingData.length,
        JSON.stringify(sentimentCounts),
        'completed',
        processingTimeMs
      ]);
      
      console.log(`📝 [${sessionId}] Analysis saved to history table`);
    } catch (historyError) {
      console.error(`❌ [${sessionId}] Failed to save analysis history:`, historyError.message);
      // Don't fail the main request if history save fails
    }
    
    // Update data_sessions to 'completed' status
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'completed', processed_items = ?, completed_at = NOW()
      WHERE session_id = ? AND user_id = ?
    `, [predictions.length, sessionId, userId]);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [${sessionId}] SENTIMENT ANALYSIS COMPLETED SUCCESSFULLY`);
    console.log(`   Total processed: ${predictions.length}`);
    console.log(`   Positive: ${sentimentCounts.positive || 0}`);
    console.log(`   Negative: ${sentimentCounts.negative || 0}`);
    console.log(`   Neutral: ${sentimentCounts.neutral || 0}`);
    console.log(`   Processing time: ${processingTimeMs}ms (${(processingTimeMs / 1000).toFixed(2)}s)`);
    console.log(`${'='.repeat(60)}\n`);
    
    res.json({
      success: true,
      message: 'Sentiment analysis completed successfully',
      results: {
        totalProcessed: predictions.length,
        sentimentDistribution: sentimentCounts,
        processingTime: processingTimeMs
      }
    });
    
  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [${sessionId}] SENTIMENT ANALYSIS FAILED`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack trace:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    
    // Update progress to failed
    if (global.sentimentProgress && global.sentimentProgress.has(sessionId)) {
      const progressData = global.sentimentProgress.get(sessionId);
      progressData.status = 'failed';
      progressData.error = process.env.NODE_ENV === 'production' ? 'Analysis failed' : error.message;
      progressData.lastUpdate = new Date();
    }
    
    res.status(500).json({
      error: 'Sentiment analysis failed',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred during analysis' : error.message
    });
  } finally {
    // Clean up training file
    if (trainingFile) {
      try {
        if (fs.existsSync(trainingFile)) {
          fs.unlinkSync(trainingFile);
        }
      } catch (cleanupError) {
        console.warn('Warning: Could not delete training file:', cleanupError.message);
      }
    }
  }
}

/**
 * Get sentiment analysis results
 * GET /api/raw-data/analyze/:sessionId/results
 */
async function getAnalysisResultsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    const [results] = await db.execute(`
      SELECT id, clean_text, predicted_sentiment
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND predicted_sentiment IS NOT NULL
      ORDER BY id
    `, [userId, sessionId]);
    
    // Calculate statistics
    const sentimentCounts = results.reduce((counts, item) => {
      counts[item.predicted_sentiment] = (counts[item.predicted_sentiment] || 0) + 1;
      return counts;
    }, {});
    
    res.json({
      success: true,
      results: results,
      statistics: {
        total: results.length,
        sentimentDistribution: sentimentCounts
      }
    });
    
  } catch (error) {
    console.error('Error in getAnalysisResultsHandler:', error);
    res.status(500).json({
      error: 'Failed to get analysis results',
      details: error.message
    });
  }
}

/**
 * Get sentiment analysis progress
 * GET /api/raw-data/analyze/:sessionId/progress
 */
async function getSentimentProgressHandler(req, res) {
  try {
    const { sessionId } = req.params;
    
    if (!global.sentimentProgress || !global.sentimentProgress.has(sessionId)) {
      return res.json({
        status: 'not_started',
        message: 'No analysis in progress for this session'
      });
    }
    
    const progress = global.sentimentProgress.get(sessionId);
    res.json(progress);
    
  } catch (error) {
    console.error('Error in getSentimentProgressHandler:', error);
    res.status(500).json({
      error: 'Failed to get progress',
      details: error.message
    });
  }
}

/**
 * Export sentiment analysis results as CSV
 * GET /api/raw-data/export/:sessionId
 */
async function exportResultsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    const [results] = await db.execute(`
      SELECT id, clean_text, predicted_sentiment, timestamp_extracted, username_extracted
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND predicted_sentiment IS NOT NULL
      ORDER BY id
    `, [userId, sessionId]);
    
    if (results.length === 0) {
      return res.status(404).json({
        error: 'No analysis results found for this session'
      });
    }
    
    // Create CSV content
    const csvHeader = 'ID,Text,Sentiment,Timestamp,Username\n';
    const csvContent = results.map(row => {
      const text = (row.clean_text || '').replace(/"/g, '""');
      const timestamp = row.timestamp_extracted || '';
      const username = row.username_extracted || '';
      return `${row.id},"${text}",${row.predicted_sentiment},"${timestamp}","${username}"`;
    }).join('\n');
    
    const csv = csvHeader + csvContent;
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sentiment_analysis_${sessionId}.csv`);
    
    res.send(csv);
    
  } catch (error) {
    console.error('Error in exportResultsHandler:', error);
    res.status(500).json({
      error: 'Failed to export results',
      details: error.message
    });
  }
}

/**
 * Shutdown the worker pool gracefully
 */
async function shutdownWorkerPool() {
  if (workerPool) {
    await workerPool.shutdown();
    workerPool = null;
  }
}

/**
 * Analyze sentiment using Naive Bayes with selected word library
 * POST /api/raw-data/analyze-with-library
 */
async function analyzeWithLibraryHandler(req, res) {
  let sessionId = null;
  let userId = null;
  
  try {
    userId = req.user.userId;
    const { sessionId: reqSessionId, libraryId } = req.body;
    sessionId = reqSessionId;

    if (!sessionId || !libraryId) {
      return res.status(400).json({ error: 'Session ID and Library ID are required' });
    }

    const db = getDb();

    console.log(`Starting library-based sentiment analysis for session ${sessionId}, user ${userId}, library ${libraryId}`);

    // Verify library ownership
    const [libraries] = await db.execute(
      'SELECT id, name FROM word_libraries WHERE id = ? AND user_id = ?',
      [libraryId, userId]
    );

    if (libraries.length === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // Get sample texts from library to use as training data
    const [librarySamples] = await db.execute(
      'SELECT tweet_text, sentiment FROM word_library_samples WHERE library_id = ?',
      [libraryId]
    );

    // Check if library has enough data - either samples OR words
    const [words] = await db.execute(
      'SELECT word, sentiment FROM word_library_words WHERE library_id = ? ORDER BY weight DESC',
      [libraryId]
    );
    
    if (librarySamples.length === 0 && words.length === 0) {
      return res.status(400).json({ 
        error: 'Library is empty. Please add training data first.',
        hint: 'Import labeled tweets to populate the library with words and samples.'
      });
    }
    
    // Count words by sentiment
    const wordsBySentiment = {
      positive: words.filter(w => w.sentiment === 'positive'),
      negative: words.filter(w => w.sentiment === 'negative'),
      neutral: words.filter(w => w.sentiment === 'neutral')
    };
    
    // Check if we have words for all sentiments (minimum requirement)
    if (wordsBySentiment.positive.length === 0 || wordsBySentiment.negative.length === 0 || wordsBySentiment.neutral.length === 0) {
      return res.status(400).json({ 
        error: 'Library needs words for all sentiment types',
        hint: 'Please ensure your library has positive, negative, and neutral words.',
        currentDistribution: {
          positive: wordsBySentiment.positive.length,
          negative: wordsBySentiment.negative.length,
          neutral: wordsBySentiment.neutral.length
        }
      });
    }
    
    console.log(`Library has ${words.length} words (${wordsBySentiment.positive.length} positive, ${wordsBySentiment.negative.length} negative, ${wordsBySentiment.neutral.length} neutral)`);
    
    // If we have enough samples (15+), use them for training
    if (librarySamples.length >= 15) {
      console.log(`Using ${librarySamples.length} existing samples for training`);
    } else {
      // Generate synthetic training samples from words
      console.log(`Generating synthetic training samples from ${words.length} words...`);
      
      const syntheticSamples = [];
      
      // Generate at least 5 samples per sentiment
      for (const sentiment of ['positive', 'negative', 'neutral']) {
        const sentimentWords = wordsBySentiment[sentiment].map(w => w.word);
        const numSamples = Math.max(5, Math.min(10, Math.floor(sentimentWords.length / 2)));
        
        for (let i = 0; i < numSamples; i++) {
          // Take 3-5 random words and combine them
          const numWords = 3 + Math.floor(Math.random() * 3);
          const selectedWords = [];
          for (let j = 0; j < numWords; j++) {
            const randomWord = sentimentWords[Math.floor(Math.random() * sentimentWords.length)];
            selectedWords.push(randomWord);
          }
          syntheticSamples.push({
            tweet_text: selectedWords.join(' '),
            sentiment: sentiment
          });
        }
      }
      
      console.log(`Generated ${syntheticSamples.length} synthetic samples`);
      librarySamples.push(...syntheticSamples);
      console.log(`Total training samples: ${librarySamples.length}`);
    }

    // Get all tweets from the session to analyze
    console.log(`🔍 Querying raw_twitter_data for userId=${userId}, sessionId=${sessionId}`);
    const [tweets] = await db.execute(
      'SELECT id, clean_text FROM raw_twitter_data WHERE user_id = ? AND session_id = ?',
      [userId, sessionId]
    );

    console.log(`📊 Found ${tweets.length} tweets in raw_twitter_data table`);
    
    if (tweets.length === 0) {
      // Let's check if the session exists at all
      const [sessionCheck] = await db.execute(
        'SELECT session_id, total_items, valid_items, status FROM data_sessions WHERE session_id = ? AND user_id = ?',
        [sessionId, userId]
      );
      console.log(`📋 Session info:`, sessionCheck[0]);
      return res.status(400).json({ 
        error: 'No tweets to analyze in this session',
        hint: `Session "${sessionId}" shows ${sessionCheck[0]?.total_items || 0} total items with status "${sessionCheck[0]?.status}". The data might not have been processed yet.`
      });
    }

    console.log(`Found ${librarySamples.length} library samples and ${tweets.length} tweets to analyze`);

    // Process in batches for large datasets
    const BATCH_SIZE = 300; // Larger batch size for 6 workers
    const totalBatches = Math.ceil(tweets.length / BATCH_SIZE);
    
    console.log(`Processing ${tweets.length} items in ${totalBatches} batches of ${BATCH_SIZE} each`);

    // Prepare training data from library samples
    const trainingDataFormatted = librarySamples.map(item => ({
      text: item.tweet_text,
      label: item.sentiment.toLowerCase()
    }));

    // Initialize worker pool if not already done
    if (!workerPool) {
      console.log('🔄 Initializing sentiment worker pool...');
      workerPool = new SentimentWorkerPool(6); // 6 workers for maximum parallel processing
      try {
        await workerPool.initialize();
        console.log('✅ Worker pool initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize worker pool:', error.message);
        // Continue without worker pool - will use fallback method
        workerPool = null;
      }
    }
    
    // Check if we have either worker pool or can use fallback
    if (!workerPool) {
      console.log('⚠️ Worker pool not available, will use sequential processing');
    }

    // Update data_sessions to 'processing' status
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'processing', analysis_type = 'library', training_samples = ?
      WHERE session_id = ? AND user_id = ?
    `, [librarySamples.length, sessionId, userId]);
    
    // Initialize progress tracking
    if (!global.sentimentProgress) {
      global.sentimentProgress = new Map();
    }
    
    const progressKey = `${sessionId}_library`;
    global.sentimentProgress.set(progressKey, {
      status: 'processing',
      totalItems: tweets.length,
      processedItems: 0,
      currentBatch: 0,
      totalBatches: totalBatches,
      predictions: [],
      libraryId: libraryId,
      libraryName: libraries[0].name,
      trainingSamples: librarySamples.length,
      startedAt: new Date(),
      startTime: new Date(),
      lastUpdate: new Date()
    });

    // Send immediate response to start processing
    res.json({
      success: true,
      message: 'Analysis started',
      sessionId: sessionId,
      progressKey: progressKey,
      totalItems: tweets.length
    });

    // Process asynchronously
    processLibraryAnalysis(userId, sessionId, progressKey, tweets, trainingDataFormatted, totalBatches, BATCH_SIZE, db, workerPool)
      .catch(error => {
        console.error('Error in background processing:', error);
        if (global.sentimentProgress.has(progressKey)) {
          global.sentimentProgress.get(progressKey).status = 'error';
          global.sentimentProgress.get(progressKey).error = error.message;
        }
      });

  } catch (error) {
    console.error('Error in analyzeWithLibraryHandler:', error);
    res.status(500).json({
      error: 'Failed to start sentiment analysis',
      details: error.message
    });
  }
}

/**
 * Background processing for library-based analysis
 */
async function processLibraryAnalysis(userId, sessionId, progressKey, tweets, trainingDataFormatted, totalBatches, BATCH_SIZE, db, workerPool) {
  let allPredictions = [];
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 [${progressKey}] STARTING LIBRARY-BASED ANALYSIS`);
    console.log(`   Total items: ${tweets.length}`);
    console.log(`   Batches: ${totalBatches}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (workerPool) {
      console.log(`🚀 [${progressKey}] Using worker pool for parallel processing...`);
      
      const batchPromises = [];
      const concurrentBatches = Math.min(6, totalBatches); // Process up to 6 batches concurrently
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += concurrentBatches) {
        // Check if analysis was cancelled
        const currentProgress = global.sentimentProgress.get(progressKey);
        if (currentProgress && currentProgress.status === 'cancelled') {
          console.log(`🛑 Analysis cancelled, stopping batch processing`);
          break;
        }
        
        const batchGroup = [];
        
        for (let i = 0; i < concurrentBatches && (batchIndex + i) < totalBatches; i++) {
          const currentBatchIndex = batchIndex + i;
          const startIdx = currentBatchIndex * BATCH_SIZE;
          const endIdx = Math.min(startIdx + BATCH_SIZE, tweets.length);
          const batchData = tweets.slice(startIdx, endIdx);
          const predictionTexts = batchData.map(item => item.clean_text);
          
          console.log(`📊 [${progressKey}] Processing batch ${currentBatchIndex + 1}/${totalBatches}: items ${startIdx + 1}-${endIdx}`);
          
          // Add timeout wrapper (240s = 4 minutes for 200 items with Indonesian stemming)
          const batchPromise = Promise.race([
            workerPool.predict(trainingDataFormatted, predictionTexts),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Batch processing timeout (240s)')), 240000)
            )
          ])
            .then(predictions => {
              const batchPredictions = predictions.map((prediction, idx) => {
                // Ensure prediction has confidence - if it's just a string, wrap it
                let predObj = prediction;
                if (typeof prediction === 'string') {
                  predObj = { label: prediction, confidence: 0.33 };
                } else if (!prediction.confidence) {
                  predObj = { label: prediction.label || 'neutral', confidence: 0.33 };
                }
                
                return {
                  id: batchData[idx].id,
                  prediction: predObj
                };
              });
              
              // Log first prediction to verify format
              if (currentBatchIndex === 0 && batchPredictions.length > 0) {
                console.log(`   [DEBUG] Sample prediction:`, batchPredictions[0].prediction);
              }
              
              const batchProgress = ((currentBatchIndex + 1) / totalBatches * 100).toFixed(1);
              console.log(`✅ [${progressKey}] Completed batch ${currentBatchIndex + 1}/${totalBatches} (${batchProgress}%) - ${predictions.length} predictions`);
              return { batchIndex: currentBatchIndex, predictions: batchPredictions, endIdx };
            })
            .catch(error => {
              console.error(`❌ [${progressKey}] Batch ${currentBatchIndex + 1} failed:`, error.message);
              // Return neutral predictions on error
              const defaultPredictions = batchData.map(item => ({
                id: item.id,
                prediction: { label: 'neutral', confidence: 0.33 }
              }));
              return { batchIndex: currentBatchIndex, predictions: defaultPredictions, endIdx };
            });
          
          batchGroup.push(batchPromise);
        }
        
        const batchResults = await Promise.all(batchGroup);
        
        for (const result of batchResults) {
          allPredictions.push(...result.predictions);
          
          if (global.sentimentProgress.has(progressKey)) {
            global.sentimentProgress.get(progressKey).processedItems = result.endIdx;
            global.sentimentProgress.get(progressKey).currentBatch = result.batchIndex + 1;
            global.sentimentProgress.get(progressKey).lastUpdate = new Date();
          }
        }
      }
    } else {
      // Fallback to sequential processing
      console.log(`⚠️ [${progressKey}] Worker pool not available, using sequential processing`);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, tweets.length);
        const batchData = tweets.slice(startIdx, endIdx);
        
        const batchPredictions = await processBatchWithPython(trainingDataFormatted, batchData);
        allPredictions.push(...batchPredictions);
        
        if (global.sentimentProgress.has(progressKey)) {
          global.sentimentProgress.get(progressKey).processedItems = endIdx;
          global.sentimentProgress.get(progressKey).currentBatch = batchIndex + 1;
          global.sentimentProgress.get(progressKey).lastUpdate = new Date();
        }
      }
    }
    
    // Update database with predictions in bulk batches
    console.log(`\n💾 [${progressKey}] Updating ${allPredictions.length} predictions in database...`);
    const dbStartTime = Date.now();
    
    const UPDATE_BATCH_SIZE = 500;
    for (let i = 0; i < allPredictions.length; i += UPDATE_BATCH_SIZE) {
      const updateChunk = allPredictions.slice(i, i + UPDATE_BATCH_SIZE);
      
      // Build bulk update query using CASE statements
      const sentimentCases = updateChunk.map(item => {
        const sentiment = item.prediction.label.charAt(0).toUpperCase() + item.prediction.label.slice(1);
        return `WHEN id = ${item.id} THEN '${sentiment}'`;
      }).join(' ');
      
      const confidenceCases = updateChunk.map(item => {
        return `WHEN id = ${item.id} THEN ${item.prediction.confidence}`;
      }).join(' ');
      
      const ids = updateChunk.map(item => item.id).join(',');
      
      const updateQuery = `
        UPDATE raw_twitter_data 
        SET predicted_sentiment = CASE ${sentimentCases} END,
            prediction_confidence = CASE ${confidenceCases} END
        WHERE id IN (${ids})
      `;
      
      await db.execute(updateQuery);
      
      const progress = Math.min(i + UPDATE_BATCH_SIZE, allPredictions.length);
      const dbProgress = (progress / allPredictions.length * 100).toFixed(1);
      console.log(`   [${progressKey}] DB Update: ${progress}/${allPredictions.length} (${dbProgress}%)`);
    }
    
    const dbTime = ((Date.now() - dbStartTime) / 1000).toFixed(2);
    console.log(`✅ [${progressKey}] Database update completed in ${dbTime}s`);
    
    // Calculate statistics
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    allPredictions.forEach(item => {
      const label = item.prediction.label.toLowerCase();
      sentimentCounts[label]++;
    });
    
    // Update progress status
    const completedAt = new Date();
    if (global.sentimentProgress.has(progressKey)) {
      const progress = global.sentimentProgress.get(progressKey);
      progress.status = 'completed';
      progress.predictions = allPredictions;
      progress.sentimentCounts = sentimentCounts;
      progress.completedAt = completedAt;
      
      // Save to analysis_history
      try {
        const processingTimeMs = completedAt - new Date(progress.startedAt);
        
        // Determine session name from sessionId
        const sessionParts = sessionId.split('_');
        const sessionName = sessionParts[0] || sessionId;
        
        await db.execute(`
          INSERT INTO analysis_history (
            user_id,
            session_id,
            session_name,
            analysis_type,
            source_description,
            total_items,
            processed_items,
            training_samples,
            results,
            status,
            processing_time_ms,
            created_at,
            completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userId,
          sessionId,
          sessionName,
          'library', // analysis_type
          `Analyzed using word library (${progress.libraryName})`,
          progress.totalItems,
          progress.processedItems,
          progress.trainingSamples || 0,
          JSON.stringify({
            sentimentDistribution: sentimentCounts,
            libraryName: progress.libraryName,
            libraryId: progress.libraryId
          }),
          'completed',
          processingTimeMs,
          new Date(progress.startedAt),
          completedAt
        ]);
        
        console.log(`📝 [${progressKey}] Analysis saved to history table`);
      } catch (historyError) {
        console.error(`❌ [${progressKey}] Error saving to analysis_history:`, historyError);
        // Don't fail the analysis if history saving fails
      }
      
      // Update data_sessions to 'completed' status
      try {
        await db.execute(`
          UPDATE data_sessions 
          SET status = 'completed', processed_items = ?, analysis_type = 'library', completed_at = ?
          WHERE session_id = ? AND user_id = ?
        `, [progress.processedItems, completedAt, sessionId, userId]);
      } catch (sessionError) {
        console.error(`❌ [${progressKey}] Error updating data_sessions:`, sessionError);
      }
    }
    
    const totalTime = ((completedAt - new Date(global.sentimentProgress.get(progressKey).startedAt)) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [${progressKey}] LIBRARY-BASED ANALYSIS COMPLETED`);
    console.log(`   Total processed: ${allPredictions.length}`);
    console.log(`   Positive: ${sentimentCounts.positive || 0}`);
    console.log(`   Negative: ${sentimentCounts.negative || 0}`);
    console.log(`   Neutral: ${sentimentCounts.neutral || 0}`);
    console.log(`   Total time: ${totalTime}s`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [${progressKey}] LIBRARY-BASED ANALYSIS FAILED`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack trace:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    if (global.sentimentProgress.has(progressKey)) {
      global.sentimentProgress.get(progressKey).status = 'error';
      global.sentimentProgress.get(progressKey).error = process.env.NODE_ENV === 'production' 
        ? 'Analysis failed' 
        : error.message;
    }
    throw error;
  }
}

/**
 * Fallback: Process batch using Python script directly
 */
async function processBatchWithPython(trainingData, batchData) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '..', 'utils', 'sentiment_worker_indonesian.py');
    const pythonProcess = spawn(pythonPath, [pythonScript]);
    
    let outputData = '';
    let errorData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${errorData}`));
        return;
      }
      
      try {
        const lines = outputData.trim().split('\n');
        let predictions = [];
        
        // Parse each line - looking for result message
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'result' && parsed.predictions) {
              predictions = parsed.predictions;
              break;
            }
          } catch {
            // Skip invalid JSON lines
            continue;
          }
        }
        
        if (predictions.length === 0) {
          // No predictions found, use defaults
          predictions = batchData.map(() => ({ label: 'neutral', confidence: 0.33 }));
        }
        
        const result = batchData.map((item, idx) => ({
          id: item.id,
          prediction: predictions[idx] || { label: 'neutral', confidence: 0.33 }
        }));
        
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error.message}`));
      }
    });
    
    // Send input to Python
    const input = {
      type: 'predict',
      training_data: trainingData,
      texts: batchData.map(item => item.clean_text)
    };
    
    pythonProcess.stdin.write(JSON.stringify(input) + '\n');
    pythonProcess.stdin.end();
  });
}

/**
 * Simple Naive Bayes classifier
 */
function classifySentiment(text, trainingData) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const scores = {
    positive: 0,
    negative: 0,
    neutral: 0
  };

  // Count matching words for each sentiment
  words.forEach(word => {
    if (trainingData.positive.includes(word)) scores.positive++;
    if (trainingData.negative.includes(word)) scores.negative++;
    if (trainingData.neutral.includes(word)) scores.neutral++;
  });

  // Calculate total matches
  const total = scores.positive + scores.negative + scores.neutral;
  
  if (total === 0) {
    // No matches - default to neutral
    return { label: 'Neutral', confidence: 0.33 };
  }

  // Find highest score
  let maxScore = Math.max(scores.positive, scores.negative, scores.neutral);
  let label = 'Neutral';
  
  if (scores.positive === maxScore) label = 'Positive';
  else if (scores.negative === maxScore) label = 'Negative';
  
  const confidence = maxScore / total;

  return { label, confidence };
}

/**
 * Get progress for library-based analysis
 * GET /api/raw-data/library-progress/:progressKey
 */
function getLibraryAnalysisProgressHandler(req, res) {
  try {
    const { progressKey } = req.params;
    
    if (!global.sentimentProgress || !global.sentimentProgress.has(progressKey)) {
      return res.status(404).json({ error: 'Progress data not found' });
    }
    
    const progress = global.sentimentProgress.get(progressKey);
    res.json(progress);
    
  } catch (error) {
    console.error('Error in getLibraryAnalysisProgressHandler:', error);
    res.status(500).json({
      error: 'Failed to get progress',
      details: error.message
    });
  }
}

/**
 * Cancel library-based analysis
 * POST /api/raw-data/cancel-library-analysis/:progressKey
 */
function cancelLibraryAnalysisHandler(req, res) {
  try {
    const { progressKey } = req.params;
    
    if (!global.sentimentProgress || !global.sentimentProgress.has(progressKey)) {
      return res.status(404).json({ error: 'Progress data not found' });
    }
    
    const progress = global.sentimentProgress.get(progressKey);
    
    if (progress.status === 'completed') {
      return res.status(400).json({ error: 'Analysis already completed' });
    }
    
    if (progress.status === 'cancelled') {
      return res.status(400).json({ error: 'Analysis already cancelled' });
    }
    
    // Mark as cancelled
    progress.status = 'cancelled';
    progress.cancelledAt = new Date();
    
    console.log(`🛑 Analysis cancelled: ${progressKey}`);
    
    res.json({
      success: true,
      message: 'Analysis cancelled successfully',
      processedItems: progress.processedItems,
      totalItems: progress.totalItems
    });
    
  } catch (error) {
    console.error('Error in cancelLibraryAnalysisHandler:', error);
    res.status(500).json({
      error: 'Failed to cancel analysis',
      details: error.message
    });
  }
}

module.exports = {
  analyzeSentimentHandler,
  getAnalysisResultsHandler,
  getSentimentProgressHandler,
  exportResultsHandler,
  shutdownWorkerPool,
  analyzeWithLibraryHandler,
  getLibraryAnalysisProgressHandler,
  cancelLibraryAnalysisHandler
};