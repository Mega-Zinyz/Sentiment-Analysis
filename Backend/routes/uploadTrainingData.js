const { getDb } = require('../config/mysql-database');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Upload and process CSV training data
async function uploadTrainingDataHandler(req, res) {
  try {
    const userId = req.user.userId;
    const datasetName = req.body.dataset_name || 'Uploaded Dataset';
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    const db = getDb();
    const csvData = [];
    
    // Parse CSV from buffer
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          // Normalize column names (handle different variations)
          const normalizedRow = {};
          Object.keys(row).forEach(key => {
            const lowerKey = key.toLowerCase().trim();
            if (lowerKey.includes('tweet') || lowerKey.includes('text') || lowerKey.includes('content')) {
              normalizedRow.tweet_text = row[key];
            } else if (lowerKey.includes('label') || lowerKey.includes('sentiment') || lowerKey.includes('class')) {
              // Normalize sentiment labels
              let label = row[key].toString().toLowerCase().trim();
              if (label.includes('pos') || label === '1' || label === 'good') {
                normalizedRow.sentiment_label = 'Positive';
              } else if (label.includes('neg') || label === '0' || label === 'bad') {
                normalizedRow.sentiment_label = 'Negative';
              } else {
                normalizedRow.sentiment_label = 'Neutral';
              }
            }
          });
          
          if (normalizedRow.tweet_text && normalizedRow.sentiment_label) {
            csvData.push(normalizedRow);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (csvData.length === 0) {
      return res.status(400).json({ 
        error: 'No valid data found. Please ensure your CSV has columns for text and sentiment labels.' 
      });
    }

    // Insert data into database
    const insertQuery = `
      INSERT INTO training_data_original (user_id, dataset_name, tweet_text, sentiment_label) 
      VALUES (?, ?, ?, ?)
    `;
    
    let insertedCount = 0;
    for (const row of csvData) {
      await db.execute(insertQuery, [userId, datasetName, row.tweet_text, row.sentiment_label]);
      insertedCount++;
    }

    res.json({ 
      success: true, 
      message: `Successfully uploaded ${insertedCount} training records.`,
      inserted: insertedCount,
      dataset_name: datasetName
    });

  } catch (error) {
    console.error('Error uploading training data:', error);
    res.status(500).json({ error: 'Failed to upload training data: ' + error.message });
  }
}

// Get dataset statistics
async function getDatasetStatsHandler(req, res) {
  try {
    const db = getDb();
    const userId = req.user.userId;
    
    const statsQuery = `
      SELECT 
        dataset_name,
        sentiment_label,
        COUNT(*) as count
      FROM training_data_original 
      WHERE user_id = ? 
      GROUP BY dataset_name, sentiment_label
      ORDER BY dataset_name, sentiment_label
    `;
    
    const [rows] = await db.execute(statsQuery, [userId]);
    
    // Organize stats by dataset
    const datasets = {};
    rows.forEach(row => {
      if (!datasets[row.dataset_name]) {
        datasets[row.dataset_name] = {
          name: row.dataset_name,
          total: 0,
          positive: 0,
          negative: 0,
          neutral: 0
        };
      }
      
      datasets[row.dataset_name].total += row.count;
      datasets[row.dataset_name][row.sentiment_label.toLowerCase()] = row.count;
    });
    
    res.json({ 
      datasets: Object.values(datasets),
      totalDatasets: Object.keys(datasets).length
    });
    
  } catch (error) {
    console.error('Error fetching dataset stats:', error);
    res.status(500).json({ error: 'Failed to fetch dataset statistics.' });
  }
}

module.exports = { 
  uploadTrainingDataHandler, 
  getDatasetStatsHandler,
  upload 
};