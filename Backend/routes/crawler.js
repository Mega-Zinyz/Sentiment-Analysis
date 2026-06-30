const express = require('express');
const router = express.Router();
const { submitCrawlJob, cancelCrawlJob, stopAllJobs, getJobStatus, getUserJobs } = require('../utils/job-queue');
const { getDb } = require('../config/mysql-database');
const XLSX = require('xlsx');

const parseCrawlerConfig = (config) => {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
};

/**
 * Start a new crawling job
 * POST /api/crawler/start
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      keyword,
      targetCount = 100,
      config = {},
      sinceDate,
      untilDate,
      collectionId,
    } = req.body;

    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    if (sinceDate && isNaN(Date.parse(sinceDate))) {
      return res.status(400).json({ error: 'Invalid start date' });
    }

    if (untilDate && isNaN(Date.parse(untilDate))) {
      return res.status(400).json({ error: 'Invalid end date' });
    }

    if (sinceDate && untilDate && new Date(sinceDate) > new Date(untilDate)) {
      return res.status(400).json({ error: 'Start date must be before or equal to end date' });
    }

    if (keyword.length < 2) {
      return res.status(400).json({ error: 'Keyword must be at least 2 characters' });
    }
    
    if (targetCount < 10 || targetCount > 10000) {
      return res.status(400).json({ error: 'Target count must be between 10 and 10000' });
    }

    // Load X.com session cookies from database
    let xCookies = null;
    try {
      const db = getDb();
      const [creds] = await db.execute(
        'SELECT x_cookies FROM user_api_credentials WHERE user_id = ? AND is_active = TRUE LIMIT 1',
        [userId]
      );
      if (creds.length > 0 && creds[0].x_cookies) {
        xCookies = JSON.parse(creds[0].x_cookies);
        console.log(`[CRAWLER] Loaded ${xCookies.length} session cookies from DB`);
      }
    } catch (credErr) {
      console.warn('Could not load X.com cookies from DB:', credErr.message);
    }

    // Auto-create a collection if none provided
    let resolvedCollectionId = collectionId || null;
    if (!resolvedCollectionId) {
      const db = getDb();
      const { v4: uuidv4 } = require('uuid');
      resolvedCollectionId = uuidv4();
      await db.execute(
        `INSERT INTO crawler_collections (user_id, collection_id, name, keywords, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [userId, resolvedCollectionId, `${keyword} — ${new Date().toLocaleDateString('id-ID')}`, keyword]
      );
    }

    const queueConfig = {
      headless: true,
      rateLimit: 3500,
      maxRetries: 2,
      maxScrolls: 4,
      minScrollDelay: 2000,
      maxScrollDelay: 4500,
      ...config,
      sinceDate: sinceDate || null,
      untilDate: untilDate || null,
      xCookies,
      collectionId: resolvedCollectionId,
    };

    const result = await submitCrawlJob(userId, keyword, targetCount, queueConfig);
    
    // Emit only to this user's socket room
    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${userId}`).emit('crawler:job_started', {
        jobId: result.jobId,
        userId,
        keyword,
        targetCount,
        sinceDate: queueConfig.sinceDate || null,
        untilDate: queueConfig.untilDate || null,
        status: 'queued'
      });
    }
    
    res.json({
      success: true,
      message: 'Crawling job started',
      jobId: result.jobId,
      status: result.status
    });
    
  } catch (error) {
    console.error('Error starting crawl job:', error);
    res.status(500).json({ error: 'Failed to start crawling job', details: error.message });
  }
});

/**
 * Get job status and progress
 * GET /api/crawler/status/:jobId
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;
    
    const job = await getJobStatus(jobId, userId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const jobConfig = parseCrawlerConfig(job.config);
    res.json({
      success: true,
      job: {
        jobId: job.job_id,
        keyword: job.keyword,
        status: job.status,
        targetCount: job.target_count,
        collectedCount: job.collected_count || 0,
        failedCount: job.failed_count || 0,
        statusMessage: job.status_message,
        lastError: job.last_error,
        estimatedTimeRemaining: job.estimated_time_remaining,
        progress: Math.round(((job.collected_count || 0) / job.target_count) * 100),
        sinceDate: jobConfig.sinceDate || null,
        untilDate: jobConfig.untilDate || null,
        loginEnabled: !!(jobConfig.xCookies && jobConfig.xCookies.length > 0),
        startedAt: job.started_at,
        completedAt: job.completed_at,
        createdAt: job.created_at
      }
    });
    
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status', details: error.message });
  }
});

/**
 * Get all jobs for user
 * GET /api/crawler/jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, collectionId } = req.query;

    const jobs = await getUserJobs(userId, parseInt(limit), collectionId || null);
    
    const formattedJobs = jobs.map(job => {
      const cfg = parseCrawlerConfig(job.config);
      const isDone = ['completed','failed','cancelled','suspended'].includes(job.status);
      // Prefer dedicated columns; fall back to config JSON for legacy rows
      const sinceDate = job.since_date
        ? new Date(job.since_date).toISOString().slice(0, 10)
        : (cfg.sinceDate || null);
      const untilDate = job.until_date
        ? new Date(job.until_date).toISOString().slice(0, 10)
        : (cfg.untilDate || null);
      return {
        jobId: job.job_id,
        keyword: job.keyword,
        status: job.status,
        targetCount: job.target_count,
        collectedCount: job.collected_count || 0,
        progress: Math.round(((job.collected_count || 0) / job.target_count) * 100),
        statusMessage: job.status_message || null,
        sinceDate,
        untilDate,
        loginEnabled: !!(cfg.xCookies && cfg.xCookies.length > 0),
        createdAt: job.created_at,
        updatedAt: job.updated_at || null,
        completedAt: isDone ? (job.completed_at || job.updated_at || null) : null
      };
    });
    
    res.json({
      success: true,
      total: formattedJobs.length,
      jobs: formattedJobs
    });
    
  } catch (error) {
    console.error('Error getting user jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs', details: error.message });
  }
});

/**
 * Get crawler statistics for user
 * GET /api/crawler/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = getDb();
    
    const [stats] = await db.execute(`
      SELECT
        COUNT(*) as totalJobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedJobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedJobs,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processingJobs,
        SUM(collected_count) as totalTweetsCollected,
        AVG(collected_count) as avgTweetsPerJob
      FROM crawler_jobs
      WHERE user_id = ?
    `, [userId]);
    
    const [processingJob] = await db.execute(`
      SELECT j.job_id, j.keyword, p.total_collected, j.target_count, p.status_message
      FROM crawler_jobs j
      LEFT JOIN crawler_job_progress p ON j.job_id = p.job_id
      WHERE j.user_id = ? AND j.status = 'processing'
      LIMIT 1
    `, [userId]);
    
    res.json({
      success: true,
      stats: {
        totalJobs: stats[0].totalJobs || 0,
        completedJobs: stats[0].completedJobs || 0,
        failedJobs: stats[0].failedJobs || 0,
        processingJobs: stats[0].processingJobs || 0,
        totalTweetsCollected: stats[0].totalTweetsCollected || 0,
        avgTweetsPerJob: Math.round(stats[0].avgTweetsPerJob || 0)
      },
      currentJob: processingJob[0] ? {
        jobId: processingJob[0].job_id,
        keyword: processingJob[0].keyword,
        collectedCount: processingJob[0].total_collected || 0,
        targetCount: processingJob[0].target_count,
        statusMessage: processingJob[0].status_message,
        progress: Math.round(((processingJob[0].total_collected || 0) / processingJob[0].target_count) * 100)
      } : null
    });
    
  } catch (error) {
    console.error('Error getting crawler stats:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

/**
 * Cancel a crawling job
 * POST /api/crawler/cancel/:jobId
 */
router.post('/cancel/:jobId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;
    const db = getDb();
    
    // Verify job ownership
    const [job] = await db.execute(`
      SELECT id FROM crawler_jobs WHERE job_id = ? AND user_id = ?
    `, [jobId, userId]);
    
    if (job.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Update job status in DB
    await db.execute(`
      UPDATE crawler_jobs
      SET status = 'cancelled', updated_at = NOW()
      WHERE job_id = ? AND user_id = ?
    `, [jobId, userId]);

    // Signal the running processor to stop (non-blocking)
    cancelCrawlJob(jobId);

    const io = req.app.locals.io;
    if (io) io.to(`user:${userId}`).emit('crawler:job_cancelled', { jobId, userId });

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job', details: error.message });
  }
});

/**
 * Force-stop ALL queued and active jobs for the current user.
 * Also cleans up globally stale 'processing' rows (zombie workers).
 * POST /api/crawler/stop-all
 */
router.post('/stop-all', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { cancelled, staleCleared } = await stopAllJobs(userId);

    const io = req.app.locals.io;
    if (io) io.to(`user:${userId}`).emit('crawler:queue_stopped', { userId, cancelled, staleCleared });

    res.json({ success: true, cancelled, staleCleared });
  } catch (error) {
    console.error('Error stopping all jobs:', error);
    res.status(500).json({ error: 'Failed to stop all jobs', details: error.message });
  }
});

/**
 * Restart a failed/suspended crawling job
 * POST /api/crawler/resume/:jobId
 * Creates a fresh job with the same keyword+config, marks the original as cancelled.
 */
router.post('/resume/:jobId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;
    const db = getDb();

    // Verify job ownership
    const [jobs] = await db.execute(
      'SELECT job_id, status, keyword, target_count, config FROM crawler_jobs WHERE job_id = ? AND user_id = ?',
      [jobId, userId]
    );
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobs[0];
    const canRestart = ['failed', 'suspended', 'error', 'cancelled'].includes(job.status);
    if (!canRestart) {
      return res.status(400).json({
        error: `Tidak bisa restart job dengan status '${job.status}'`
      });
    }

    // Parse original config (no cookies stored — we reload fresh ones below)
    const originalConfig = job.config
      ? (typeof job.config === 'string' ? JSON.parse(job.config) : job.config)
      : {};

    // Load fresh session cookies from DB
    let xCookies = null;
    try {
      const [creds] = await db.execute(
        'SELECT x_cookies FROM user_api_credentials WHERE user_id = ? AND is_active = TRUE LIMIT 1',
        [userId]
      );
      if (creds.length > 0 && creds[0].x_cookies) {
        xCookies = JSON.parse(creds[0].x_cookies);
      }
    } catch {}

    const newConfig = {
      headless: true,
      rateLimit: 3500,
      maxRetries: 2,
      maxScrolls: 4,
      minScrollDelay: 2000,
      maxScrollDelay: 4500,
      ...originalConfig,
      xCookies, // always use freshest cookies
    };

    // Mark original job as cancelled so it doesn't linger as 'queued'
    await db.execute(
      "UPDATE crawler_jobs SET status = 'cancelled', updated_at = NOW() WHERE job_id = ? AND user_id = ?",
      [jobId, userId]
    );

    // Submit a brand-new job (fresh UUID, full target count)
    const result = await submitCrawlJob(userId, job.keyword, job.target_count, newConfig);

    const io = req.app.locals.io;
    if (io) io.to(`user:${userId}`).emit('crawler:job_started', { jobId: result.jobId, userId, keyword: job.keyword, targetCount: job.target_count, sinceDate: originalConfig.sinceDate || null, untilDate: originalConfig.untilDate || null, status: 'queued' });

    res.json({
      success: true,
      message: 'Job berhasil di-restart',
      newJobId: result.jobId,
      originalJobId: jobId
    });
  } catch (error) {
    console.error('Error resuming job:', error);
    res.status(500).json({ error: 'Failed to resume job', details: error.message });
  }
});

/**
 * Export job tweets as Excel
 * GET /api/crawler/jobs/:jobId/export/excel
 * Works for both paths: crawler_tweets (with collection) and raw_twitter_data (fallback)
 */
router.get('/jobs/:jobId/export/excel', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;
    const db = getDb();

    // Verify job ownership and get config
    const [jobs] = await db.execute(
      'SELECT job_id, keyword, config FROM crawler_jobs WHERE job_id = ? AND user_id = ?',
      [jobId, userId]
    );
    if (jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobs[0];
    const config = typeof job.config === 'string' ? JSON.parse(job.config) : (job.config || {});
    const collectionId = config.collectionId || null;

    let rows = [];

    if (collectionId) {
      // Path 1: tweets stored in crawler_tweets via collection
      const [collections] = await db.execute(
        'SELECT id FROM crawler_collections WHERE collection_id = ? AND user_id = ?',
        [collectionId, userId]
      );
      if (collections.length > 0) {
        const collectionPk = collections[0].id;
        const [tweets] = await db.execute(
          `SELECT tweet_id, text, username, created_at_tweet, url, likes, retweets, replies,
                  sentiment_label, manual_label, notes, imported_at
           FROM crawler_tweets WHERE user_id = ? AND collection_id = ? ORDER BY imported_at ASC`,
          [userId, collectionPk]
        );
        rows = tweets.map((t, i) => ({
          No: i + 1,
          tweet_id: t.tweet_id || '',
          text: t.text || '',
          username: t.username || '',
          created_at: t.created_at_tweet ? new Date(t.created_at_tweet).toISOString() : '',
          url: t.url || '',
          likes: t.likes || 0,
          retweets: t.retweets || 0,
          replies: t.replies || 0,
          sentiment_label: t.sentiment_label || '',
          notes: t.notes || ''
        }));
      }
    }

    // Path 2 (fallback): tweets stored in raw_twitter_data
    if (rows.length === 0) {
      const sessionId = `crawler_${jobId}`;
      const [items] = await db.execute(
        `SELECT raw_data, clean_text, username_extracted, timestamp_extracted
         FROM raw_twitter_data WHERE user_id = ? AND session_id = ? ORDER BY id ASC`,
        [userId, sessionId]
      );
      rows = items.map((item, i) => {
        let parsedRaw = {};
        try { parsedRaw = JSON.parse(item.raw_data); } catch {}
        return {
          No: i + 1,
          tweet_id: parsedRaw.id || parsedRaw.tweetId || '',
          text: item.clean_text || parsedRaw.text || '',
          username: item.username_extracted || parsedRaw.username || '',
          created_at: item.timestamp_extracted ? new Date(item.timestamp_extracted).toISOString() : '',
          url: parsedRaw.url || '',
          likes: parsedRaw.likes || parsedRaw.likeCount || 0,
          retweets: parsedRaw.retweets || parsedRaw.retweetCount || 0,
          replies: parsedRaw.replies || parsedRaw.replyCount || 0,
          sentiment_label: '',
          notes: ''
        };
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tidak ada tweet untuk job ini' });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tweets');

    const safeKeyword = job.keyword.replace(/[^a-z0-9_\-]/gi, '_');
    const filename = `crawler_${safeKeyword}_${jobId.substring(0, 8)}.xlsx`;
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Error exporting job to Excel:', error);
    res.status(500).json({ error: 'Failed to export job data' });
  }
});

module.exports = router;
