const { getDb } = require('../config/mysql-database');
const { processRawDataBatch, validateRawData } = require('../utils/rawDataProcessor');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

// Configure multer for CSV file upload (store in temp directory)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../temp/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}_${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for large datasets
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/**
 * Upload and process raw Twitter data
 * POST /api/raw-data/upload
 */
async function uploadRawDataHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { rawDataArray, sessionName } = req.body;
    
    // Debug logging
    console.log('📥 Upload request received:');
    console.log('- User ID:', userId);
    console.log('- Session Name:', sessionName);
    console.log('- Request body size:', JSON.stringify(req.body).length, 'bytes');
    console.log('- rawDataArray type:', typeof rawDataArray);
    console.log('- rawDataArray is array:', Array.isArray(rawDataArray));
    if (rawDataArray) {
      console.log('- rawDataArray length:', rawDataArray.length);
      console.log('- First few items:', rawDataArray.slice(0, 3));
    } else {
      console.log('- rawDataArray content:', rawDataArray);
    }
    
    // Validate input
    if (!rawDataArray || !Array.isArray(rawDataArray)) {
      console.log('❌ Validation failed: rawDataArray is not an array');
      return res.status(400).json({ 
        error: 'rawDataArray is required and must be an array of strings',
        received: typeof rawDataArray,
        isArray: Array.isArray(rawDataArray)
      });
    }
    
    if (rawDataArray.length === 0) {
      return res.status(400).json({ 
        error: 'rawDataArray cannot be empty' 
      });
    }
    
    if (rawDataArray.length < 20) {
      return res.status(400).json({ 
        error: 'Need at least 20 data points for meaningful analysis (15 for training + 5 for prediction)' 
      });
    }

    // Check for reasonable upper limit to prevent memory issues
    if (rawDataArray.length > 100000) {
      console.log(`❌ Dataset too large: ${rawDataArray.length} items`);
      return res.status(400).json({ 
        error: `Dataset too large. Maximum 100,000 data points supported per upload. Received: ${rawDataArray.length}` 
      });
    }
    
    console.log(`✅ Basic validation passed for ${rawDataArray.length} items`);
    
    // Generate session ID
    const sessionId = sessionName ? 
      `${sessionName}_${Date.now()}` : 
      `session_${uuidv4().substring(0, 8)}`;
    
    console.log(`Processing ${rawDataArray.length} raw data items for user ${userId}, session: ${sessionId}`);
    
    // Fast batch processing and upload approach
    console.log('🔄 Starting fast batch processing and upload...');
    
    const db = getDb();
    
    // Create data_sessions record to track status
    await db.execute(`
      INSERT INTO data_sessions (user_id, session_id, session_name, status, total_items, started_at)
      VALUES (?, ?, ?, 'uploading', ?, NOW())
    `, [userId, sessionId, sessionName || sessionId, rawDataArray.length]);
    
    // Initialize progress tracking
    if (!global.uploadProgress) {
      global.uploadProgress = new Map();
    }
    
    global.uploadProgress.set(sessionId, {
      status: 'processing',
      totalItems: rawDataArray.length,
      processedItems: 0,
      validItems: 0,
      invalidItems: 0,
      startTime: new Date(),
      lastUpdate: new Date()
    });
    
    console.log(`📊 Processing ${rawDataArray.length} items in fast batches...`);
    
    // Set processing timeout (10 minutes maximum)
    const PROCESSING_TIMEOUT = 30 * 60 * 1000; // 30 minutes for large datasets
    const processingStartTime = Date.now();
    
    // Process all items in memory first (much faster)
    const { parseRawTwitterData, cleanMessageText } = require('../utils/rawDataProcessor');
    const validItems = [];
    const sampleData = [];
    let validCount = 0;
    let invalidCount = 0;
    
    // Process items in larger batches for speed (since it's just data moving)
    const PROCESSING_BATCH_SIZE = 1000; // Much larger batches for speed
    let processedTotal = 0;
    
    console.log(`🚀 Fast processing ${rawDataArray.length} items in batches of ${PROCESSING_BATCH_SIZE}...`);
    
    for (let batchStart = 0; batchStart < rawDataArray.length; batchStart += PROCESSING_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + PROCESSING_BATCH_SIZE, rawDataArray.length);
      const batchNumber = Math.floor(batchStart/PROCESSING_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(rawDataArray.length/PROCESSING_BATCH_SIZE);
      
      const batchStartTime = Date.now();
      
      // Process this batch with optimized parsing
      for (let index = batchStart; index < batchEnd; index++) {
        try {
          const rawData = rawDataArray[index];
          
          // Quick validation before parsing
          if (!rawData || typeof rawData !== 'string' || rawData.trim().length < 10) {
            invalidCount++;
            continue;
          }
          
          // Use fast parsing with minimal overhead
          const parseResult = parseRawTwitterData(rawData);
          
          if (!parseResult.success) {
            invalidCount++;
            continue;
          }
          
          const timestamp = parseResult.timestamp;
          const username = parseResult.username || 'unknown';
          const message = parseResult.message;
          
          // Fast text cleaning without heavy preprocessing
          const cleanText = message ? message.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim() : '';
          
          // Check if data is valid (has meaningful content)
          if (cleanText && cleanText.length >= 3) {
            validItems.push([
              userId,
              sessionId,
              rawData,
              timestamp,
              username,
              cleanText
            ]);
            
            validCount++;
            
            // Store sample data for response (only first 3)
            if (sampleData.length < 3) {
              sampleData.push({
                rawData: rawData,
                timestamp: timestamp,
                username: username,
                cleanText: cleanText
              });
            }
          } else {
            invalidCount++;
          }
          
        } catch (error) {
          console.error(`❌ Error processing item ${index + 1}: ${error.message}`);
          invalidCount++;
        }
      }
      
      processedTotal = batchEnd;
      const batchDuration = Date.now() - batchStartTime;
      
      // Update progress after each batch
      const progressData = global.uploadProgress.get(sessionId);
      progressData.processedItems = batchEnd;
      progressData.validItems = validCount;
      progressData.invalidItems = invalidCount;
      progressData.lastUpdate = new Date();
      
      // Log progress every 5 batches or at end
      if (batchNumber % 5 === 0 || batchNumber === totalBatches) {
        const percentage = Math.round((batchEnd / rawDataArray.length) * 100);
        const elapsedTime = Math.round((Date.now() - processingStartTime) / 1000);
        const itemsPerSecond = Math.round(batchEnd / (elapsedTime || 1));
        
        console.log(`📊 Batch ${batchNumber}/${totalBatches} completed in ${batchDuration}ms - Progress: ${batchEnd}/${rawDataArray.length} (${percentage}%) - Valid: ${validCount}, Invalid: ${invalidCount} - ${itemsPerSecond} items/sec`);
      }
      
      // Minimal delay to prevent blocking
      if (batchNumber % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // Check for timeout (increased limit)
      if (Date.now() - processingStartTime > PROCESSING_TIMEOUT) {
        console.error(`❌ Processing timeout after ${Math.round((Date.now() - processingStartTime) / 1000)} seconds`);
        throw new Error(`Processing timeout - processed ${processedTotal}/${rawDataArray.length} items`);
      }
    }
    
    const processingTime = Date.now() - processingStartTime;
    console.log(`✅ Processing completed in ${processingTime}ms - ${validCount} valid items, ${invalidCount} invalid items`);
    
    // Now do fast batch database insertion
    if (validItems.length > 0) {
      console.log(`📊 Starting fast database insertion of ${validItems.length} items...`);
      
      const insertStartTime = Date.now();
      
      // Prepare optimized batch insert query
      // Use larger chunks for faster insertion
      const CHUNK_SIZE = 2000;
      let totalInserted = 0;
      
      for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
        const chunk = validItems.slice(i, i + CHUNK_SIZE);
        
        // Create optimized bulk insert query with placeholders
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const insertQuery = `
          INSERT INTO raw_twitter_data 
          (user_id, session_id, raw_data, timestamp_extracted, username_extracted, clean_text) 
          VALUES ${placeholders}
        `;
        
        // Flatten the chunk array for the query parameters
        const queryParams = chunk.flat();
        
        const chunkStartTime = Date.now();
        const [result] = await db.execute(insertQuery, queryParams);
        totalInserted += result.affectedRows;
        
        const chunkDuration = Date.now() - chunkStartTime;
        if (i % (CHUNK_SIZE * 5) === 0) { // Log every 5 chunks
          console.log(`📊 Inserted chunk ${Math.floor(i/CHUNK_SIZE) + 1}: ${chunk.length} items in ${chunkDuration}ms`);
        }
        
        // Update progress
        const progressData = global.uploadProgress.get(sessionId);
        progressData.status = 'uploading';
        
        // Log chunk insertion progress
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(validItems.length / CHUNK_SIZE);
        console.log(`📊 Database insertion: Chunk ${chunkNumber}/${totalChunks} - ${result.affectedRows} records inserted`);
      }
      
      const insertTime = Date.now() - insertStartTime;
      console.log(`✅ Database insertion completed in ${insertTime}ms - ${totalInserted} records inserted`);
      console.log(`🚀 Total time: Processing(${processingTime}ms) + Database(${insertTime}ms) = ${processingTime + insertTime}ms`);
      
      validCount = totalInserted; // Use actual inserted count
    }
    
    // Update data_sessions record to 'uploaded' status with processing details
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'uploaded', 
          processed_items = ?,
          valid_items = ?,
          invalid_items = ?,
          completed_at = NOW()
      WHERE session_id = ? AND user_id = ?
    `, [validCount, validCount, invalidCount, sessionId, userId]);
    
    // Mark processing as complete
    const finalProgress = global.uploadProgress.get(sessionId);
    finalProgress.status = 'completed';
    finalProgress.endTime = new Date();
    finalProgress.duration = finalProgress.endTime - finalProgress.startTime;
    
    const totalTime = Math.round(finalProgress.duration / 1000);
    console.log(`✅ Fast batch processing complete: ${validCount} valid items, ${invalidCount} invalid items in ${totalTime} seconds`);
    
    // Validation checks
    if (validCount === 0) {
      console.log('❌ No valid data found after processing');
      return res.status(400).json({ 
        error: 'No valid data found after processing. Please check your data format.',
        debug: {
          inputCount: rawDataArray.length,
          validCount: validCount,
          invalidCount: invalidCount,
          sampleInput: rawDataArray.slice(0, 5)
        }
      });
    }
    
    if (validCount < 15) {
      console.log(`❌ Insufficient valid data: ${validCount} items`);
      return res.status(400).json({ 
        error: `Only ${validCount} valid items found after cleaning. Need at least 15 for analysis.`,
        debug: {
          inputCount: rawDataArray.length,
          validCount: validCount,
          invalidCount: invalidCount,
          sampleInput: rawDataArray.slice(0, 5)
        }
      });
    }
    
    // Get summary statistics
    const stats = {
      totalInput: rawDataArray.length,
      validAfterProcessing: validCount,
      filtered: invalidCount,
      sessionId: sessionId,
      readyForLabeling: validCount >= 15
    };
    
    res.json({
      success: true,
      message: `Successfully processed ${validCount} items using streaming approach`,
      sessionId: sessionId,
      stats: stats,
      sampleData: sampleData,
      nextStep: 'Label 15 training samples (5 positive, 5 negative, 5 neutral)'
    });
    
  } catch (error) {
    console.error('Error in uploadRawDataHandler:', error);
    res.status(500).json({ 
      error: 'Failed to process raw data',
      details: error.message 
    });
  }
}

/**
 * Get sessions for current user
 * GET /api/raw-data/sessions
 */
async function getSessionsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const db = getDb();
    
    // Get session status from data_sessions table
    const [sessions] = await db.execute(`
      SELECT 
        ds.session_id,
        ds.session_name,
        ds.status,
        ds.total_items,
        ds.processed_items,
        ds.training_samples,
        ds.analysis_type,
        ds.created_at,
        ds.updated_at,
        ds.completed_at,
        COUNT(CASE WHEN rtd.is_training_sample = 1 THEN 1 END) as labeled_items,
        COUNT(CASE WHEN rtd.predicted_sentiment IS NOT NULL THEN 1 END) as predicted_items
      FROM data_sessions ds
      LEFT JOIN raw_twitter_data rtd ON ds.session_id = rtd.session_id AND rtd.user_id = ds.user_id
      WHERE ds.user_id = ?
      GROUP BY ds.session_id, ds.session_name, ds.status, ds.total_items, ds.processed_items, 
               ds.training_samples, ds.analysis_type, ds.created_at, ds.updated_at, ds.completed_at
      ORDER BY ds.created_at DESC
    `, [userId]);
    
    const sessionsWithStatus = sessions.map(session => ({
      session_id: session.session_id,
      session_name: session.session_name,
      total_items: session.total_items,
      labeled_items: session.labeled_items,
      predicted_items: session.predicted_items,
      status: session.status, // Use status from data_sessions table
      labeling_progress: `${session.labeled_items}/15`,
      can_analyze: session.labeled_items >= 15 && session.status !== 'processing',
      created_at: session.created_at,
      updated_at: session.updated_at,
      completed_at: session.completed_at
    }));
    
    res.json({
      success: true,
      sessions: sessionsWithStatus
    });
    
  } catch (error) {
    console.error('Error in getSessionsHandler:', error);
    res.status(500).json({ 
      error: 'Failed to get sessions',
      details: error.message 
    });
  }
}

/**
 * Get data for a specific session
 * GET /api/raw-data/session/:sessionId
 */
async function getSessionDataHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    const [data] = await db.execute(`
      SELECT 
        id,
        raw_data,
        timestamp_extracted,
        username_extracted,
        clean_text,
        sentiment_label,
        is_training_sample,
        predicted_sentiment,
        prediction_confidence,
        created_at
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ?
      ORDER BY created_at
    `, [userId, sessionId]);
    
    if (data.length === 0) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    const stats = {
      total: data.length,
      labeled: data.filter(item => item.sentiment_label).length,
      predicted: data.filter(item => item.predicted_sentiment).length,
      unlabeled: data.filter(item => !item.sentiment_label && !item.is_training_sample).length
    };
    
    res.json({
      success: true,
      sessionId,
      data,
      stats
    });
    
  } catch (error) {
    console.error('Error in getSessionDataHandler:', error);
    res.status(500).json({ 
      error: 'Failed to get session data',
      details: error.message 
    });
  }
}

/**
 * Get upload progress for a session
 * GET /api/raw-data/progress/:sessionId
 */
async function getUploadProgressHandler(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    const db = getDb();
    
    // First check memory for real-time progress
    let progressData = global.uploadProgress && global.uploadProgress.get(sessionId);
    
    if (!progressData) {
      // If not in memory, check database for completed sessions
      const [sessions] = await db.execute(`
        SELECT status, total_items, processed_items, valid_items, invalid_items, 
               started_at, completed_at, created_at
        FROM data_sessions
        WHERE session_id = ? AND user_id = ?
      `, [sessionId, userId]);
      
      if (sessions.length === 0) {
        return res.json({
          status: 'not_found',
          message: 'Session not found'
        });
      }
      
      const session = sessions[0];
      
      // Return completed session data from database
      return res.json({
        success: true,
        sessionId,
        status: session.status,
        progress: {
          totalItems: session.total_items,
          processedItems: session.processed_items,
          validItems: session.valid_items,
          invalidItems: session.invalid_items,
          percentComplete: 100,
          startTime: session.started_at || session.created_at,
          endTime: session.completed_at,
          duration: session.completed_at && session.started_at ? 
            Math.round((new Date(session.completed_at) - new Date(session.started_at)) / 1000) : null
        }
      });
    }
    
    // Calculate additional metrics
    const now = new Date();
    const elapsedTime = now - progressData.startTime;
    const percentComplete = Math.round((progressData.processedItems / progressData.totalItems) * 100);
    
    let estimatedTimeRemaining = null;
    if (progressData.processedItems > 0 && progressData.status === 'uploading') {
      const itemsPerMs = progressData.processedItems / elapsedTime;
      const remainingItems = progressData.totalItems - progressData.processedItems;
      estimatedTimeRemaining = Math.round(remainingItems / itemsPerMs);
    }
    
    res.json({
      success: true,
      sessionId,
      status: progressData.status,
      progress: {
        totalItems: progressData.totalItems,
        processedItems: progressData.processedItems,
        currentChunk: progressData.currentChunk,
        totalChunks: progressData.totalChunks,
        percentComplete,
        elapsedTime: Math.round(elapsedTime / 1000), // in seconds
        estimatedTimeRemaining: estimatedTimeRemaining ? Math.round(estimatedTimeRemaining / 1000) : null,
        startTime: progressData.startTime,
        lastUpdate: progressData.lastUpdate,
        endTime: progressData.endTime || null,
        duration: progressData.duration ? Math.round(progressData.duration / 1000) : null
      }
    });
    
  } catch (error) {
    console.error('Error in getUploadProgressHandler:', error);
    res.status(500).json({ 
      error: 'Failed to get upload progress',
      details: error.message 
    });
  }
}

/**
 * Delete a session and all its data
 * DELETE /api/raw-data/session/:sessionId
 */
async function deleteSessionHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    // Clean up progress tracking
    if (global.uploadProgress && global.uploadProgress.has(sessionId)) {
      global.uploadProgress.delete(sessionId);
    }
    if (global.sentimentProgress) {
      global.sentimentProgress.delete(sessionId);
      global.sentimentProgress.delete(`${sessionId}_library`);
    }
    
    // Delete from all related tables (delete in order to avoid FK constraint issues)
    // 1. Delete raw tweet data
    const [dataResult] = await db.execute(`
      DELETE FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ?
    `, [userId, sessionId]);
    
    // 2. Delete analysis history for this session
    const [historyResult] = await db.execute(`
      DELETE FROM analysis_history 
      WHERE user_id = ? AND session_id = ?
    `, [userId, sessionId]);
    
    // 3. Delete session record
    const [sessionResult] = await db.execute(`
      DELETE FROM data_sessions 
      WHERE user_id = ? AND session_id = ?
    `, [userId, sessionId]);
    
    if (dataResult.affectedRows === 0 && sessionResult.affectedRows === 0) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    console.log(`🗑️ Deleted session ${sessionId}: ${dataResult.affectedRows} tweets, ${historyResult.affectedRows} history records`);
    
    res.json({
      success: true,
      message: `Deleted session ${sessionId} with ${dataResult.affectedRows} items and ${historyResult.affectedRows} analysis records`
    });
    
  } catch (error) {
    console.error('Error in deleteSessionHandler:', error);
    res.status(500).json({ 
      error: 'Failed to delete session',
      details: error.message 
    });
  }
}

/**
 * Upload and process CSV file with raw data
 * POST /api/raw-data/upload-csv
 */
async function uploadCsvFileHandler(req, res) {
  let filePath = null;
  
  try {
    const userId = req.user.userId;
    const sessionName = req.body.sessionName || 'CSV Upload';
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    
    filePath = req.file.path;
    console.log(`📁 CSV file uploaded: ${filePath}`);
    
    // Generate session ID
    const sessionId = `${sessionName}_${Date.now()}`;
    
    const db = getDb();
    
    // Create data_sessions record
    await db.execute(`
      INSERT INTO data_sessions (user_id, session_id, session_name, status, started_at)
      VALUES (?, ?, ?, 'uploading', NOW())
    `, [userId, sessionId, sessionName]);
    
    // Send immediate response
    res.json({
      success: true,
      sessionId: sessionId,
      message: 'CSV file uploaded, processing started'
    });
    
    // Process CSV file in background
    console.log(`🚀 Starting background processing for session ${sessionId}`);
    setImmediate(() => {
      processUploadedCsv(userId, sessionId, sessionName, filePath).catch(error => {
        console.error(`❌ Background processing error for ${sessionId}:`, error);
      });
    });
    
  } catch (error) {
    console.error('Error in uploadCsvFileHandler:', error);
    
    // Clean up file if error occurs
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(500).json({ 
      error: 'Failed to upload CSV file',
      details: error.message 
    });
  }
}

/**
 * Process uploaded CSV file in background
 */
async function processUploadedCsv(userId, sessionId, sessionName, filePath) {
  const db = getDb();
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📁 [${sessionId}] Starting CSV processing`);
    console.log(`   User ID: ${userId}`);
    console.log(`   File: ${filePath}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Read and parse CSV file
    const rawDataArray = [];
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Assuming CSV has a column with tweet text (try common column names)
          const text = row.text || row.tweet || row.content || row.message || 
                       row.Text || row.Tweet || row.Content || row.Message ||
                       Object.values(row)[0]; // fallback to first column
          
          if (text && text.trim()) {
            rawDataArray.push(text.trim());
          }
        })
        .on('end', () => {
          console.log(`✅ [${sessionId}] CSV parsed: ${rawDataArray.length} rows`);
          resolve();
        })
        .on('error', (error) => {
          console.error(`❌ [${sessionId}] CSV parsing error:`, error);
          reject(error);
        });
    });
    
    // Update total_items count
    await db.execute(`
      UPDATE data_sessions 
      SET total_items = ?
      WHERE session_id = ? AND user_id = ?
    `, [rawDataArray.length, sessionId, userId]);
    
    // Validate minimum data
    if (rawDataArray.length < 20) {
      throw new Error(`Need at least 20 data points. Found ${rawDataArray.length}`);
    }
    
    // Process data - for CSV files, treat each row as plain text
    const { parseRawTwitterData, cleanMessageText } = require('../utils/rawDataProcessor');
    const validItems = [];
    let validCount = 0;
    let invalidCount = 0;
    
    console.log(`\n📊 [${sessionId}] Processing ${rawDataArray.length} items...`);
    const processingStartTime = Date.now();
    
    for (let i = 0; i < rawDataArray.length; i++) {
      const rawText = rawDataArray[i];
      
      // Log first item and every 100 items
      if (i === 0) {
        console.log(`   [DEBUG] First item: "${rawText.substring(0, 100)}..."`);
      }
      
      if ((i + 1) % 100 === 0) {
        console.log(`   Processing: ${i + 1}/${rawDataArray.length} (${((i + 1) / rawDataArray.length * 100).toFixed(1)}%)`);
      }
      
      try {
        // Parse tab-separated values: timestamp\tusername\ttext\t...
        let timestamp = null;
        let username = 'unknown';
        let cleanText = rawText;
        
        // Split by tabs
        const parts = rawText.split('\t');
        
        if (parts.length >= 3) {
          // Extract timestamp (first column)
          const timestampStr = parts[0].trim();
          if (timestampStr && timestampStr.length > 0) {
            timestamp = timestampStr;
          }
          
          // Extract username (second column)
          const usernameStr = parts[1].trim();
          if (usernameStr && usernameStr.length > 0) {
            username = usernameStr;
          }
          
          // Extract text (third column)
          cleanText = parts[2].trim();
        }
        
        // Clean text - remove URLs and extra whitespace
        cleanText = cleanText
          .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (i === 0) {
          console.log(`   [DEBUG] First item parsed: timestamp="${timestamp}", username="${username}", text="${cleanText.substring(0, 80)}..."`);
        }
        
        // Only add if we have valid text content
        if (cleanText && cleanText.trim().length > 5) {
          validItems.push([
            userId,
            sessionId,
            parts.length >= 3 ? parts[2].trim() : rawText, // Store only tweet text, not full CSV line
            timestamp,
            username,
            cleanText
          ]);
          validCount++;
        } else {
          invalidCount++;
        }
      } catch (error) {
        console.error(`   [ERROR] Item ${i}: ${error.message}`);
        invalidCount++;
      }
    }
    
    if (validCount === 0 && invalidCount > 0) {
      console.log(`   [DEBUG] First few raw items that were invalid:`);
      for (let i = 0; i < Math.min(3, rawDataArray.length); i++) {
        console.log(`      ${i}: "${rawDataArray[i].substring(0, 100)}"`);
      }
    }
    
    const processingTime = ((Date.now() - processingStartTime) / 1000).toFixed(2);
    console.log(`✅ [${sessionId}] Processing complete in ${processingTime}s: ${validCount} valid, ${invalidCount} invalid`);
    
    // Insert into database in batches
    if (validItems.length > 0) {
      console.log(`\n💾 [${sessionId}] Inserting ${validItems.length} records into database...`);
      const CHUNK_SIZE = 100; // Reduced from 2000 to avoid max_allowed_packet error
      let totalInserted = 0;
      const dbStartTime = Date.now();
      
      for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
        const chunk = validItems.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const insertQuery = `
          INSERT INTO raw_twitter_data 
          (user_id, session_id, raw_data, timestamp_extracted, username_extracted, clean_text) 
          VALUES ${placeholders}
        `;
        
        const queryParams = chunk.flat();
        const [result] = await db.execute(insertQuery, queryParams);
        totalInserted += result.affectedRows;
        
        const progress = Math.min(i + CHUNK_SIZE, validItems.length);
        console.log(`   Inserted: ${progress}/${validItems.length} (${(progress / validItems.length * 100).toFixed(1)}%)`);
      }
      
      const dbTime = ((Date.now() - dbStartTime) / 1000).toFixed(2);
      console.log(`✅ [${sessionId}] Database insertion complete in ${dbTime}s: ${totalInserted} records`);
    }
    
    // Update session status to 'uploaded'
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'uploaded',
          processed_items = ?,
          valid_items = ?,
          invalid_items = ?,
          completed_at = NOW()
      WHERE session_id = ? AND user_id = ?
    `, [validCount, validCount, invalidCount, sessionId, userId]);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [${sessionId}] PROCESSING COMPLETED SUCCESSFULLY`);
    console.log(`   Valid items: ${validCount}`);
    console.log(`   Invalid items: ${invalidCount}`);
    console.log(`   Status: uploaded`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [${sessionId}] ERROR PROCESSING CSV:`, error.message);
    console.error(`   Stack trace:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    
    // Update session status to 'failed'
    await db.execute(`
      UPDATE data_sessions 
      SET status = 'failed',
          error_message = ?
      WHERE session_id = ? AND user_id = ?
    `, [error.message, sessionId, userId]);
    
  } finally {
    // Delete the CSV file after processing
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ [${sessionId}] Deleted CSV file: ${path.basename(filePath)}`);
      } catch (err) {
        console.error('Failed to delete CSV file:', err);
      }
    }
  }
}

/**
 * Get raw data items from a session with pagination
 * GET /api/raw-data/view/:sessionId?limit=50&offset=0
 */
async function viewSessionDataHandler(req, res) {
  try {
    const db = await getDb();
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log(`👁️ Fetching data for session ${sessionId}, limit=${limit}, offset=${offset}`);

    // Verify session belongs to user
    const [sessions] = await db.execute(`
      SELECT session_id FROM data_sessions 
      WHERE session_id = ? AND user_id = ?
    `, [sessionId, userId]);

    if (sessions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Fetch raw data with pagination
    const query = `
      SELECT id, clean_text, raw_data, username_extracted, 
             timestamp_extracted, sentiment_label
      FROM raw_twitter_data
      WHERE session_id = ?
      ORDER BY id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [data] = await db.execute(query, [sessionId]);

    console.log(`✅ Retrieved ${data.length} items for session ${sessionId}`);

    res.json({
      success: true,
      data: data,
      pagination: {
        limit: limit,
        offset: offset,
        count: data.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching session data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session data',
      error: error.message
    });
  }
}

/**
 * Update a raw data item
 * PUT /api/raw-data/item/:itemId
 */
async function updateRawDataItemHandler(req, res) {
  try {
    const db = await getDb();
    const userId = req.user.userId;
    const { itemId } = req.params;
    const { clean_text } = req.body;

    if (!clean_text || !clean_text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    console.log(`✏️ Updating item ${itemId}`);

    // Verify item belongs to user's session
    const [items] = await db.execute(`
      SELECT rtd.id, rtd.session_id 
      FROM raw_twitter_data rtd
      JOIN data_sessions ds ON rtd.session_id = ds.session_id
      WHERE rtd.id = ? AND ds.user_id = ?
    `, [itemId, userId]);

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Update the item
    await db.execute(`
      UPDATE raw_twitter_data 
      SET clean_text = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [clean_text.trim(), itemId]);

    console.log(`✅ Item ${itemId} updated successfully`);

    res.json({
      success: true,
      message: 'Item updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item',
      error: error.message
    });
  }
}

/**
 * Delete a raw data item
 * DELETE /api/raw-data/item/:itemId
 */
async function deleteRawDataItemHandler(req, res) {
  try {
    const db = await getDb();
    const userId = req.user.userId;
    const { itemId } = req.params;

    console.log(`🗑️ Deleting item ${itemId}`);

    // Verify item belongs to user's session
    const [items] = await db.execute(`
      SELECT rtd.id, rtd.session_id 
      FROM raw_twitter_data rtd
      JOIN data_sessions ds ON rtd.session_id = ds.session_id
      WHERE rtd.id = ? AND ds.user_id = ?
    `, [itemId, userId]);

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    const sessionId = items[0].session_id;

    // Delete the item
    await db.execute(`
      DELETE FROM raw_twitter_data 
      WHERE id = ?
    `, [itemId]);

    // Update session total_items count
    await db.execute(`
      UPDATE data_sessions 
      SET total_items = (
        SELECT COUNT(*) FROM raw_twitter_data 
        WHERE session_id = ?
      )
      WHERE session_id = ?
    `, [sessionId, sessionId]);

    console.log(`✅ Item ${itemId} deleted successfully`);

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete item',
      error: error.message
    });
  }
}

module.exports = {
  uploadRawDataHandler,
  uploadCsvFileHandler,
  upload,
  getSessionsHandler,
  getSessionDataHandler,
  getUploadProgressHandler,
  deleteSessionHandler,
  viewSessionDataHandler,
  updateRawDataItemHandler,
  deleteRawDataItemHandler
};
