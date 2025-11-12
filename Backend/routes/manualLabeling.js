const { getDb } = require('../config/mysql-database');

/**
 * Get unlabeled data for manual labeling
 * GET /api/raw-data/labeling/:sessionId
 */
async function getLabelingDataHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    // Get unlabeled data from the session
    const [unlabeledData] = await db.execute(`
      SELECT 
        id,
        clean_text,
        raw_data,
        timestamp_extracted,
        username_extracted
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NULL
      ORDER BY RAND()
    `, [userId, sessionId]);
    
    if (unlabeledData.length === 0) {
      return res.status(404).json({ 
        error: 'No unlabeled data found for this session' 
      });
    }
    
    // Get current labeling progress
    const [labelingStats] = await db.execute(`
      SELECT 
        sentiment_label,
        COUNT(*) as count
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NOT NULL
      GROUP BY sentiment_label
    `, [userId, sessionId]);
    
    const currentLabels = {
      Positive: 0,
      Negative: 0,
      Neutral: 0
    };
    
    labelingStats.forEach(stat => {
      currentLabels[stat.sentiment_label] = stat.count;
    });
    
    const totalLabeled = Object.values(currentLabels).reduce((sum, count) => sum + count, 0);
    const needsLabeling = {
      Positive: Math.max(0, 5 - currentLabels.Positive),
      Negative: Math.max(0, 5 - currentLabels.Negative),
      Neutral: Math.max(0, 5 - currentLabels.Neutral)
    };
    
    const totalNeeded = Object.values(needsLabeling).reduce((sum, count) => sum + count, 0);
    
    res.json({
      success: true,
      sessionId,
      unlabeledData: unlabeledData.slice(0, 50), // Limit to 50 items for UI performance
      currentLabels,
      needsLabeling,
      totalLabeled,
      totalNeeded,
      isComplete: totalNeeded === 0,
      canProceedAnalysis: totalNeeded === 0
    });
    
  } catch (error) {
    console.error('Error in getLabelingDataHandler:', error);
    res.status(500).json({ 
      error: 'Failed to get labeling data',
      details: error.message 
    });
  }
}

/**
 * Submit manual labels for training data
 * POST /api/raw-data/labeling/:sessionId
 */
async function submitLabelsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { labels } = req.body; // Array of {id, sentiment_label}
    
    console.log('📝 Label submission request:', { userId, sessionId, body: req.body });
    
    if (!labels || !Array.isArray(labels)) {
      console.error('❌ Invalid labels format:', req.body);
      return res.status(400).json({ 
        error: 'labels must be an array of {id, sentiment_label}',
        received: req.body
      });
    }
    
    // Validate sentiment labels
    const validLabels = ['Positive', 'Negative', 'Neutral'];
    for (const label of labels) {
      if (!label.id || !label.sentiment_label || !validLabels.includes(label.sentiment_label)) {
        return res.status(400).json({ 
          error: `Invalid label format. Each item must have id and sentiment_label (${validLabels.join(', ')})` 
        });
      }
    }
    
    const db = getDb();
    
    // Check current labeling status
    const [currentStats] = await db.execute(`
      SELECT 
        sentiment_label,
        COUNT(*) as count
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NOT NULL
      GROUP BY sentiment_label
    `, [userId, sessionId]);
    
    const currentCounts = {
      Positive: 0,
      Negative: 0,
      Neutral: 0
    };
    
    currentStats.forEach(stat => {
      currentCounts[stat.sentiment_label] = stat.count;
    });
    
    // Count new labels being submitted
    const newCounts = { ...currentCounts };
    labels.forEach(label => {
      newCounts[label.sentiment_label] = (newCounts[label.sentiment_label] || 0) + 1;
    });
    
    // Check if submission would exceed limits
    const errors = [];
    if (newCounts.Positive > 5) errors.push(`Too many Positive labels (${newCounts.Positive}/5)`);
    if (newCounts.Negative > 5) errors.push(`Too many Negative labels (${newCounts.Negative}/5)`);
    if (newCounts.Neutral > 5) errors.push(`Too many Neutral labels (${newCounts.Neutral}/5)`);
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Label limits exceeded',
        details: errors,
        currentCounts,
        attempting: newCounts
      });
    }
    
    // Update labels in database
    const updatePromises = labels.map(label => 
      db.execute(`
        UPDATE raw_twitter_data 
        SET sentiment_label = ?, is_training_sample = TRUE, updated_at = NOW()
        WHERE id = ? AND user_id = ? AND session_id = ?
      `, [label.sentiment_label, label.id, userId, sessionId])
    );
    
    await Promise.all(updatePromises);
    
    // Get updated stats
    const [updatedStats] = await db.execute(`
      SELECT 
        sentiment_label,
        COUNT(*) as count
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NOT NULL
      GROUP BY sentiment_label
    `, [userId, sessionId]);
    
    const finalCounts = {
      Positive: 0,
      Negative: 0,
      Neutral: 0
    };
    
    updatedStats.forEach(stat => {
      finalCounts[stat.sentiment_label] = stat.count;
    });
    
    const totalLabeled = Object.values(finalCounts).reduce((sum, count) => sum + count, 0);
    const isComplete = finalCounts.Positive >= 5 && finalCounts.Negative >= 5 && finalCounts.Neutral >= 5;
    
    res.json({
      success: true,
      message: `Successfully labeled ${labels.length} items`,
      labeledCount: labels.length,
      currentLabels: finalCounts,
      totalLabeled,
      isComplete,
      canProceedAnalysis: isComplete,
      nextStep: isComplete ? 'Ready for sentiment analysis' : 'Continue labeling remaining samples'
    });
    
  } catch (error) {
    console.error('Error in submitLabelsHandler:', error);
    res.status(500).json({ 
      error: 'Failed to submit labels',
      details: error.message 
    });
  }
}

/**
 * Get training data summary for a session
 * GET /api/raw-data/training-summary/:sessionId
 */
async function getTrainingSummaryHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    // Get labeled training data
    const [trainingData] = await db.execute(`
      SELECT 
        id,
        clean_text,
        sentiment_label,
        raw_data,
        timestamp_extracted,
        username_extracted
      FROM raw_twitter_data 
      WHERE user_id = ? AND session_id = ? AND is_training_sample = TRUE
      ORDER BY sentiment_label, id
    `, [userId, sessionId]);
    
    if (trainingData.length === 0) {
      return res.status(404).json({ 
        error: 'No training data found for this session' 
      });
    }
    
    // Group by sentiment
    const groupedData = {
      Positive: trainingData.filter(item => item.sentiment_label === 'Positive'),
      Negative: trainingData.filter(item => item.sentiment_label === 'Negative'),
      Neutral: trainingData.filter(item => item.sentiment_label === 'Neutral')
    };
    
    const summary = {
      total: trainingData.length,
      positive: groupedData.Positive.length,
      negative: groupedData.Negative.length,
      neutral: groupedData.Neutral.length,
      isComplete: trainingData.length >= 15 && 
                  groupedData.Positive.length >= 5 && 
                  groupedData.Negative.length >= 5 && 
                  groupedData.Neutral.length >= 5
    };
    
    res.json({
      success: true,
      sessionId,
      trainingData: groupedData,
      summary
    });
    
  } catch (error) {
    console.error('Error in getTrainingSummaryHandler:', error);
    res.status(500).json({ 
      error: 'Failed to get training summary',
      details: error.message 
    });
  }
}

/**
 * Remove a label from training data
 * DELETE /api/raw-data/labeling/:sessionId/:itemId
 */
async function removeLabelHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId, itemId } = req.params;
    const db = getDb();
    
    const [result] = await db.execute(`
      UPDATE raw_twitter_data 
      SET sentiment_label = NULL, is_training_sample = FALSE, updated_at = NOW()
      WHERE id = ? AND user_id = ? AND session_id = ?
    `, [itemId, userId, sessionId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        error: 'Item not found or already unlabeled' 
      });
    }
    
    res.json({
      success: true,
      message: 'Label removed successfully'
    });
    
  } catch (error) {
    console.error('Error in removeLabelHandler:', error);
    res.status(500).json({ 
      error: 'Failed to remove label',
      details: error.message 
    });
  }
}

/**
 * Reset all labels for a session
 * POST /api/raw-data/labeling/:sessionId/reset
 */
async function resetLabelsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const db = getDb();
    
    console.log('🔄 Resetting labels for session:', sessionId);
    
    const [result] = await db.execute(`
      UPDATE raw_twitter_data 
      SET sentiment_label = NULL, is_training_sample = FALSE, updated_at = NOW()
      WHERE user_id = ? AND session_id = ? AND sentiment_label IS NOT NULL
    `, [userId, sessionId]);
    
    console.log('✅ Reset complete:', result.affectedRows, 'labels cleared');
    
    res.json({
      success: true,
      message: 'All labels reset successfully',
      labelsCleared: result.affectedRows
    });
    
  } catch (error) {
    console.error('Error in resetLabelsHandler:', error);
    res.status(500).json({ 
      error: 'Failed to reset labels',
      details: error.message 
    });
  }
}

module.exports = {
  getLabelingDataHandler,
  submitLabelsHandler,
  getTrainingSummaryHandler,
  removeLabelHandler,
  resetLabelsHandler
};