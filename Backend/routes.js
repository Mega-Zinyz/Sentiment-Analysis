const express = require('express');

const router = express.Router();
const { fetchTweetsHandler, getRateLimitsHandler } = require('./routes/fetchTweets');
const { getTrainDataHandler, saveTrainDataHandler } = require('./routes/trainData');
const { saveAnalysisResultsHandler, getAnalysisResultsHandler } = require('./routes/analysisResults');
const { uploadTrainingDataHandler, getDatasetStatsHandler, upload } = require('./routes/uploadTrainingData');
const { checkCredentialsHandler, configureCredentialsHandler, getCredentialsStatusHandler, deleteCredentialsHandler, validateCredentialsHandler } = require('./routes/apiConfig');

// Authentication
const { registerHandler, loginHandler, logoutHandler, profileHandler } = require('./routes/auth');
const { authenticateToken, requireAdmin, optionalAuth } = require('./middleware/auth');

// Admin management
const {
  getSystemStatsHandler,
  getUsersHandler,
  toggleUserStatusHandler,
  updateUserRoleHandler,
  deleteUserHandler,
  getUserAnalyticsHandler,
  getSystemAnalyticsHandler,
  getAuditLogsHandler,
  getSuspiciousActivitiesHandler
} = require('./routes/admin');

// Analysis history management
const {
  getAnalysisHistoryHandler,
  getAnalysisDetailsHandler,
  deleteAnalysisHandler,
  clearAnalysisHistoryHandler,
  getAnalysisStatsHandler
} = require('./routes/analysisHistory');

// Analysis insights management
const {
  getAnalysisInsightsHandler
} = require('./routes/analysisInsights');

// Tweet datasets management
const tweetDatasetsRouter = require('./routes/tweetDatasets');

// Word libraries management
const wordLibrariesRouter = require('./routes/wordLibraries');

// Debug routes (admin-only)
const debugRouter = require('./routes/debug');

// Profile management
const {
  getProfileHandler,
  updateProfileHandler,
  changePasswordHandler,
  getApiCredentialsHandler,
  updateApiCredentialsHandler,
  deleteApiCredentialsHandler
} = require('./routes/profile');

// Session management
const {
  getUserSessionsHandler,
  revokeSessionHandler,
  revokeOtherSessionsHandler,
  getSessionStatsHandler,
  cleanupSessionsHandler
} = require('./routes/sessions');


router.get('/', (req, res) => {
  res.send('Sentiment Analysis API is running.');
});

// Authentication routes (public)
router.post('/auth/register', registerHandler);
router.post('/auth/login', loginHandler);
router.post('/auth/logout', logoutHandler);
router.get('/auth/profile', authenticateToken, profileHandler);

// Main functionality routes (require authentication)
router.post('/fetch-tweets', authenticateToken, fetchTweetsHandler);
router.get('/rate-limits', authenticateToken, getRateLimitsHandler);

// Training data CSV endpoints (require authentication)
router.get('/train-data', authenticateToken, getTrainDataHandler);
router.post('/train-data', authenticateToken, saveTrainDataHandler);

// Analysis results endpoints (require authentication)
router.post('/save-analysis-results', authenticateToken, saveAnalysisResultsHandler);
router.get('/analysis-results', authenticateToken, getAnalysisResultsHandler);

// Training data upload endpoints (require authentication)
router.post('/upload-training-data', authenticateToken, upload.single('csvFile'), uploadTrainingDataHandler);
router.get('/dataset-stats', authenticateToken, getDatasetStatsHandler);

// API Configuration endpoints (require authentication)
router.get('/check-credentials', optionalAuth, checkCredentialsHandler);
router.post('/validate-credentials', authenticateToken, validateCredentialsHandler);
router.post('/configure-credentials', authenticateToken, configureCredentialsHandler);
router.get('/credentials-status', optionalAuth, getCredentialsStatusHandler);
router.delete('/credentials', authenticateToken, deleteCredentialsHandler);

// Admin endpoints (require admin role)
router.get('/admin/stats', authenticateToken, requireAdmin, getSystemStatsHandler);
router.get('/admin/users', authenticateToken, requireAdmin, getUsersHandler);
router.get('/admin/users/:userId/analytics', authenticateToken, requireAdmin, getUserAnalyticsHandler);
router.get('/admin/analytics', authenticateToken, requireAdmin, getSystemAnalyticsHandler);
router.get('/admin/audit-logs', authenticateToken, requireAdmin, getAuditLogsHandler);
router.get('/admin/suspicious-activities', authenticateToken, requireAdmin, getSuspiciousActivitiesHandler);
router.put('/admin/users/:userId/status', authenticateToken, requireAdmin, toggleUserStatusHandler);
router.put('/admin/users/:userId/role', authenticateToken, requireAdmin, updateUserRoleHandler);
router.delete('/admin/users/:userId', authenticateToken, requireAdmin, deleteUserHandler);

// Analysis history endpoints (require authentication)
router.get('/analysis-history', authenticateToken, getAnalysisHistoryHandler);
router.get('/analysis-history/stats', authenticateToken, getAnalysisStatsHandler);
router.get('/analysis-history/:analysisId/details', authenticateToken, getAnalysisDetailsHandler);
router.get('/analysis-history/:analysisId/insights', authenticateToken, getAnalysisInsightsHandler);
router.delete('/analysis-history/:analysisId', authenticateToken, deleteAnalysisHandler);

// Profile management endpoints (require authentication)
router.get('/profile', authenticateToken, getProfileHandler);
router.put('/profile', authenticateToken, updateProfileHandler);
router.put('/profile/password', authenticateToken, changePasswordHandler);
router.get('/profile/api-credentials', authenticateToken, getApiCredentialsHandler);
router.put('/profile/api-credentials', authenticateToken, updateApiCredentialsHandler);
router.delete('/profile/api-credentials', authenticateToken, deleteApiCredentialsHandler);

// Session management endpoints (require authentication)
router.get('/sessions', authenticateToken, getUserSessionsHandler);
router.delete('/sessions/:sessionId', authenticateToken, revokeSessionHandler);
router.delete('/sessions', authenticateToken, revokeOtherSessionsHandler);

// Admin session management (require admin role)
router.get('/admin/sessions/stats', authenticateToken, requireAdmin, getSessionStatsHandler);
router.post('/admin/sessions/cleanup', authenticateToken, requireAdmin, cleanupSessionsHandler);

// Raw data processing endpoints (require authentication)
const { 
  uploadRawDataHandler,
  uploadCsvFileHandler,
  upload: uploadCsv,
  getSessionsHandler, 
  getSessionDataHandler, 
  getUploadProgressHandler,
  deleteSessionHandler,
  viewSessionDataHandler,
  updateRawDataItemHandler,
  deleteRawDataItemHandler,
  uploadXTweetsHandler
} = require('./routes/rawDataUpload');

const { 
  getLabelingDataHandler, 
  submitLabelsHandler, 
  getTrainingSummaryHandler, 
  removeLabelHandler,
  resetLabelsHandler 
} = require('./routes/manualLabeling');

const { 
  analyzeSentimentHandler, 
  getAnalysisResultsHandler: getRawDataAnalysisResultsHandler, 
  getSentimentProgressHandler,
  exportResultsHandler,
  analyzeWithLibraryHandler,
  getLibraryAnalysisProgressHandler,
  cancelLibraryAnalysisHandler
} = require('./routes/sentimentAnalysis');

// Raw data upload and management
router.post('/raw-data/upload', authenticateToken, uploadRawDataHandler);
router.post('/raw-data/upload-csv', authenticateToken, uploadCsv.single('csvFile'), uploadCsvFileHandler);
router.post('/raw-data/upload-x-tweets', authenticateToken, uploadXTweetsHandler);
router.get('/raw-data/sessions', authenticateToken, getSessionsHandler);
router.get('/raw-data/session/:sessionId', authenticateToken, getSessionDataHandler);
router.get('/raw-data/view/:sessionId', authenticateToken, viewSessionDataHandler);
router.get('/raw-data/progress/:sessionId', authenticateToken, getUploadProgressHandler);
router.delete('/raw-data/session/:sessionId', authenticateToken, deleteSessionHandler);

// Raw data item CRUD
router.put('/raw-data/item/:itemId', authenticateToken, updateRawDataItemHandler);
router.delete('/raw-data/item/:itemId', authenticateToken, deleteRawDataItemHandler);

// Manual labeling
router.get('/raw-data/labeling/:sessionId', authenticateToken, getLabelingDataHandler);
router.post('/raw-data/labeling/:sessionId', authenticateToken, submitLabelsHandler);
router.post('/raw-data/labeling/:sessionId/reset', authenticateToken, resetLabelsHandler);
router.get('/raw-data/training-summary/:sessionId', authenticateToken, getTrainingSummaryHandler);
router.delete('/raw-data/labeling/:sessionId/:itemId', authenticateToken, removeLabelHandler);

// Sentiment analysis
router.post('/raw-data/analyze/:sessionId', authenticateToken, analyzeSentimentHandler);
router.post('/raw-data/analyze-with-library', authenticateToken, analyzeWithLibraryHandler);
router.get('/raw-data/library-progress/:progressKey', authenticateToken, getLibraryAnalysisProgressHandler);
router.post('/raw-data/cancel-library-analysis/:progressKey', authenticateToken, cancelLibraryAnalysisHandler);
router.get('/raw-data/results/:sessionId', authenticateToken, getRawDataAnalysisResultsHandler);
router.get('/raw-data/export/:sessionId', authenticateToken, exportResultsHandler);

// Tweet datasets management
router.use('/tweet-datasets', authenticateToken, tweetDatasetsRouter);

// Word libraries management
router.use('/word-libraries', authenticateToken, wordLibrariesRouter);

// Manual debug log entry for authenticated users
const fs = require('fs');
const path = require('path');

// Route: POST /api/debug/manual-log
// Authenticated users can write a manual test entry to the failed_tweets.log
router.post('/debug/manual-log', authenticateToken, async (req, res) => {
  try {
    const user = req.user || { id: null, username: null };
    const payload = req.body || {};

    const logsDir = path.join(__dirname, '..', 'logs');
    try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}
    const failedLogPath = path.join(logsDir, 'failed_tweets.log');

    const record = {
      when: new Date().toISOString(),
      triggeredBy: { id: user.userId || user.id || null, username: user.username || null },
      reason: 'manual_test',
      payload
    };

    fs.appendFileSync(failedLogPath, JSON.stringify(record) + '\n');

    res.json({ success: true, recorded: true });
  } catch (error) {
    console.error('Failed to write manual debug log:', error && error.stack ? error.stack : error);
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// Debug endpoints - restrict to authenticated admins in mounting below
router.use('/debug', authenticateToken, requireAdmin, debugRouter);

// Error logging (no auth required for frontend error reporting)
const errorLogRouter = require('./routes/errorLog');
router.use('/error-log', errorLogRouter);

module.exports = router;
