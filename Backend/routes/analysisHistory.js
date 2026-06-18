const { getDb } = require('../config/mysql-database');
const XLSX = require('xlsx');

/**
 * Get analysis history with pagination
 * GET /api/analysis-history?page=1&limit=20
 */
async function getAnalysisHistoryHandler(req, res) {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Max 50 per page
    const offset = (page - 1) * limit;
    
    const db = getDb();
    
    // Get total count
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total
      FROM analysis_history 
      WHERE user_id = ?
    `, [userId]);
    
    const totalAnalyses = countResult[0].total;
    const totalPages = Math.ceil(totalAnalyses / limit);
    
    // Get analysis history with pagination
    const [analyses] = await db.execute(`
      SELECT 
        id,
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
        error_message,
        processing_time_ms,
        created_at,
        completed_at
      FROM analysis_history 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, [userId]);
    
    // Transform data — pass raw results JSON so frontend can parse all formats
    const processedAnalyses = analyses.map(analysis => {
      const completionRate = analysis.total_items > 0
        ? Math.round((analysis.processed_items / analysis.total_items) * 100)
        : 100;

      return {
        id: analysis.id,
        user_id: analysis.user_id,
        session_id: analysis.session_id,
        analysis_name: analysis.session_name || 'Unnamed Analysis',
        analysis_type: analysis.analysis_type || 'manual',
        source_description: analysis.source_description || 'No description',
        total_items: analysis.total_items || 0,
        processed_items: analysis.processed_items || 0,
        training_samples: analysis.training_samples || 0,
        sentiment_distribution: analysis.results || '{}',   // raw JSON — frontend parses
        status: analysis.status || 'completed',
        error_message: analysis.error_message,
        processing_time: analysis.processing_time_ms,
        duration: analysis.processing_time_ms ? `${Math.round(analysis.processing_time_ms / 1000)}s` : '0s',
        completionRate,
        created_at: analysis.created_at,
        completed_at: analysis.completed_at || analysis.created_at
      };
    });
    
    res.json({
      success: true,
      analyses: processedAnalyses,
      pagination: {
        currentPage: page,
        totalPages,
        totalAnalyses,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error in getAnalysisHistoryHandler:', error);
    res.status(500).json({
      error: 'Failed to get analysis history',
      details: error.message
    });
  }
}

/**
 * Get detailed analysis results
 * GET /api/analysis-history/:analysisId/details?page=1&limit=20
 */
async function getAnalysisDetailsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 per page for details
    const offset = (page - 1) * limit;
    
    const db = getDb();
    
    // Get analysis info using current table structure
    const [analysisInfo] = await db.execute(`
      SELECT 
        id,
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
        error_message,
        processing_time_ms,
        created_at,
        completed_at
      FROM analysis_history 
      WHERE id = ? AND user_id = ?
    `, [analysisId, userId]);
    
    if (analysisInfo.length === 0) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }
    
    const analysis = analysisInfo[0];
    
    // Parse sentiment distribution from results
    let sentimentDistribution = {};
    try {
      const parsedResults = JSON.parse(analysis.results || '{}');
      if (parsedResults.sentimentDistribution) {
        sentimentDistribution = parsedResults.sentimentDistribution;
      } else if (parsedResults.positive !== undefined) {
        // Handle direct sentiment counts format
        sentimentDistribution = {
          positive: parsedResults.positive || 0,
          negative: parsedResults.negative || 0,
          neutral: parsedResults.neutral || 0
        };
      }
    } catch (error) {
      console.error('Error parsing results:', error);
    }
    
    // Get total count of detailed results for this analysis
    const [countDetailResult] = await db.execute(`
      SELECT COUNT(*) as total
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ?
    `, [userId, analysis.session_id]);
    
    const totalResults = countDetailResult[0].total;
    const totalPages = Math.ceil(totalResults / limit);
    
    // Get actual detailed results from raw_twitter_data table
    const [detailedResults] = await db.execute(`
      SELECT 
        id,
        raw_data,
        clean_text,
        predicted_sentiment,
        prediction_confidence,
        timestamp_extracted,
        username_extracted,
        created_at
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, [userId, analysis.session_id]);
    
    // Transform the results to match frontend expectations
    const processedResults = detailedResults.map((result, index) => ({
      id: result.id,
      text: result.clean_text || result.raw_data || 'No text available',
      originalText: result.raw_data,
      sentiment: result.predicted_sentiment ? result.predicted_sentiment.toLowerCase() : 'neutral',
      confidence: result.prediction_confidence || 0,
      username: result.username_extracted,
      timestamp: result.timestamp_extracted,
      created_at: result.created_at
    }));
    
    res.json({
      success: true,
      analysis: {
        id: analysis.id,
        user_id: analysis.user_id,
        session_id: analysis.session_id,
        analysis_name: analysis.session_name || 'Unnamed Analysis',
        analysis_type: analysis.analysis_type || 'manual',
        source_description: analysis.source_description || 'No description',
        total_items: analysis.total_items || 0,
        processed_items: analysis.processed_items || 0,
        training_samples: analysis.training_samples || 0,
        sentiment_distribution: analysis.results || '{}',   // raw JSON — frontend parses
        status: analysis.status || 'completed',
        processing_time: analysis.processing_time_ms,
        created_at: analysis.created_at,
        completed_at: analysis.completed_at
      },
      results: processedResults,
      pagination: {
        currentPage: page,
        totalPages,
        totalResults,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error in getAnalysisDetailsHandler:', error);
    res.status(500).json({
      error: 'Failed to get analysis details',
      details: error.message
    });
  }
}

/**
 * Delete analysis from history
 * DELETE /api/analysis-history/:analysisId
 */
async function deleteAnalysisHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();
    
    // Check if analysis exists and belongs to user
    const [analysisInfo] = await db.execute(`
      SELECT id, session_id FROM analysis_history 
      WHERE id = ? AND user_id = ?
    `, [analysisId, userId]);
    
    if (analysisInfo.length === 0) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }
    
    // Delete analysis history record
    await db.execute(`
      DELETE FROM analysis_history 
      WHERE id = ? AND user_id = ?
    `, [analysisId, userId]);
    
    res.json({
      success: true,
      message: 'Analysis deleted successfully'
    });
    
  } catch (error) {
    console.error('Error in deleteAnalysisHandler:', error);
    res.status(500).json({
      error: 'Failed to delete analysis',
      details: error.message
    });
  }
}

/**
 * Get analysis statistics
 * GET /api/analysis-history/stats
 */
async function getAnalysisStatsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const db = getDb();
    
    // Get overall statistics
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_analyses,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_analyses,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_analyses,
        SUM(total_items) as total_items_analyzed,
        AVG(processing_time_ms) as avg_processing_time,
        COUNT(CASE WHEN analysis_type = 'manual' THEN 1 END) as manual_analyses,
        COUNT(CASE WHEN analysis_type = 'api' THEN 1 END) as api_analyses
      FROM analysis_history 
      WHERE user_id = ?
    `, [userId]);
    
    // Get recent activity (last 30 days)
    const [recentActivity] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as analyses_count,
        SUM(total_items) as items_count
      FROM analysis_history 
      WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [userId]);
    
    res.json({
      success: true,
      stats: {
        ...stats[0],
        avg_processing_time: stats[0].avg_processing_time ? Math.round(stats[0].avg_processing_time) : 0
      },
      recentActivity
    });
    
  } catch (error) {
    console.error('Error in getAnalysisStatsHandler:', error);
    res.status(500).json({
      error: 'Failed to get analysis statistics',
      details: error.message
    });
  }
}

/**
 * Export all analysis results as Excel
 * GET /api/analysis-history/:analysisId/export/excel
 */
async function exportAnalysisExcelHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    const db = getDb();

    const [analysisInfo] = await db.execute(
      `SELECT id, session_id, session_name, analysis_type, total_items, results
       FROM analysis_history WHERE id = ? AND user_id = ?`,
      [analysisId, userId]
    );

    if (analysisInfo.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const analysis = analysisInfo[0];

    const [rows] = await db.execute(
      `SELECT id, raw_data, clean_text, predicted_sentiment, prediction_confidence,
              timestamp_extracted, username_extracted, created_at
       FROM raw_twitter_data
       WHERE user_id = ? AND session_id = ?
       ORDER BY id ASC`,
      [userId, analysis.session_id]
    );

    const sheetData = rows.map((r, i) => ({
      No: i + 1,
      Text: r.clean_text || r.raw_data || '',
      'Text Asli': r.raw_data || '',
      Sentimen: r.predicted_sentiment || '',
      Confidence: r.prediction_confidence != null
        ? (r.prediction_confidence * 100).toFixed(1) + '%'
        : '',
      Username: r.username_extracted || '',
      'Tanggal Tweet': r.timestamp_extracted || '',
      'Diproses Pada': r.created_at
        ? new Date(r.created_at).toLocaleString('id-ID')
        : ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Column widths
    ws['!cols'] = [
      { wch: 5 }, { wch: 60 }, { wch: 60 }, { wch: 12 },
      { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Analisis');

    const safeName = (analysis.session_name || 'analisis')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    const filename = `${safeName}_${Date.now()}.xlsx`;
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (error) {
    console.error('Error in exportAnalysisExcelHandler:', error);
    res.status(500).json({ error: 'Failed to export Excel', details: error.message });
  }
}

/**
 * Get latest model metrics for training data quality display
 * GET /api/analysis-history/latest-metrics
 */
async function getLatestModelMetricsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const db = getDb();

    const [rows] = await db.execute(
      `SELECT id, session_name, analysis_type, training_samples, results, created_at
       FROM analysis_history
       WHERE user_id = ? AND status = 'completed' AND results IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, metrics: null });
    }

    // Find the first row that has modelMetrics stored
    let modelMetrics = null;
    let analysisContext = null;

    for (const row of rows) {
      try {
        const stored = JSON.parse(row.results || '{}');
        if (stored.testMetrics) {
          modelMetrics = { ...stored.testMetrics, source: 'test_set', testSplit: stored.testSplit };
        } else if (stored.trainingMetrics) {
          modelMetrics = { ...stored.trainingMetrics, source: 'training_set' };
        } else if (stored.metrics) {
          modelMetrics = { ...stored.metrics, source: 'training_set' };
        }

        if (modelMetrics) {
          analysisContext = {
            id: row.id,
            session_name: row.session_name,
            analysis_type: row.analysis_type,
            training_samples: row.training_samples,
            created_at: row.created_at
          };
          break;
        }
      } catch {}
    }

    res.json({ success: true, metrics: modelMetrics, analysis: analysisContext });
  } catch (error) {
    console.error('Error in getLatestModelMetricsHandler:', error);
    res.status(500).json({ error: 'Failed to get latest metrics', details: error.message });
  }
}

module.exports = {
  getAnalysisHistoryHandler,
  getAnalysisDetailsHandler,
  deleteAnalysisHandler,
  getAnalysisStatsHandler,
  exportAnalysisExcelHandler,
  getLatestModelMetricsHandler
};