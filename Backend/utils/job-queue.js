const Queue = require('bull');
const redis = require('redis');
const PlaywrightCrawler = require('../crawlers/playwright-crawler');
const { getDb } = require('../config/mysql-database');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Redis connection
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redisClient.on('error', (err) => logger.error('Redis client error:', err));
redisClient.on('connect', () => logger.info('✅ Connected to Redis'));

// Global io reference
let io = null;

// Singleton queue — reused across all submitCrawlJob calls
let _queue = null;

// In-memory cancellation registry. cancelCrawlJob() adds a jobId here;
// the processor injects a cancelCheck into the crawler that reads from this set.
const cancelledJobs = new Set();

/**
 * Signal a running or queued job to stop.
 * For queued (not-yet-started) jobs, also removes the Bull job from the queue.
 */
async function cancelCrawlJob(jobId) {
  cancelledJobs.add(jobId);
  const queue = createJobQueue();
  try {
    const bullJob = await queue.getJob(jobId);
    if (bullJob) {
      const state = await bullJob.getState();
      if (['waiting', 'delayed', 'paused'].includes(state)) {
        await bullJob.remove();
        logger.info(`🛑 Removed queued Bull job from queue: ${jobId}`);
      }
    }
  } catch (e) {
    logger.warn(`Could not remove Bull job ${jobId} from queue: ${e.message}`);
  }
}

/**
 * Set socket.io instance for real-time updates
 */
function setIO(socketIO) {
  io = socketIO;
}

/**
 * Create and configure job queue (singleton)
 */
function createJobQueue() {
  if (_queue) return _queue;
  _queue = new Queue('tweet-crawler', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    }
  });
  return _queue;
}

/**
 * Initialize job queue processor
 */
// Cooldown between sequential jobs to prevent X.com IP/session rate limiting.
// After each job finishes (success or fail), the processor sleeps before returning,
// which delays Bull from picking up the next queued job.
const INTER_JOB_COOLDOWN_MS = 35000; // 35s base + 0-15s jitter

function initializeQueueProcessor(queue) {
  // Concurrency = 1: process one crawl job at a time to prevent hardware overload
  queue.process(1, async (job) => {
    const { userId, keyword, targetCount, config } = job.data;
    const jobId = job.id.toString();

    logger.info(`🚀 Processing job ${jobId} for user ${userId}`);

    // Emit job started event
    if (io) {
      io.emit('crawler:job_started', {
        jobId,
        userId,
        keyword,
        targetCount
      });
    }

    // If job was cancelled before the processor even started, handle cleanly
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      await updateJobStatus(jobId, userId, 'cancelled', 0, 'Dibatalkan oleh pengguna');
      return { success: false, cancelled: true, jobId };
    }

    try {
      // Update job status in database
      await updateJobStatus(jobId, userId, 'processing');

      // Initialize crawler
      const crawler = new PlaywrightCrawler(config || {});

      // Inject live cancellation check — not serialised through Redis,
      // set directly on the constructed object after Bull deserialises config.
      crawler.config.cancelCheck = () => cancelledJobs.has(jobId);

      // Crawl tweets with progress callback
      const tweets = await crawler.crawlTweets(
        keyword,
        targetCount,
        async (progress) => {
          await updateJobProgress(jobId, userId, progress.collected, progress.total);
          job.progress(progress.progress);
        }
      );

      // Check if job was cancelled mid-crawl (crawler exits scroll loop early)
      if (cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId);
        const collectionId = config && config.collectionId ? config.collectionId : null;
        if (tweets.length > 0) {
          await saveTweetsToDB(jobId, userId, keyword, tweets, collectionId);
        }
        await updateJobStatus(jobId, userId, 'cancelled', tweets.length, 'Dibatalkan oleh pengguna');
        if (io) io.emit('crawler:job_cancelled', { jobId, userId, collectedCount: tweets.length });
        logger.info(`🛑 Job ${jobId} cancelled mid-crawl. Saved ${tweets.length} tweets.`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { success: false, cancelled: true, collected: tweets.length, jobId };
      }

      // Save tweets to database (linked to collection if provided)
      const collectionId = config && config.collectionId ? config.collectionId : null;
      await saveTweetsToDB(jobId, userId, keyword, tweets, collectionId);

      // If 0 tweets collected, mark as failed so user knows there was a problem
      // (likely X.com login wall / rate limit, not a genuine empty result)
      if (tweets.length === 0) {
        const reason = 'Tidak ada tweet terkumpul — kemungkinan X.com menampilkan login wall atau rate limit. Coba lagi setelah beberapa menit, atau periksa cookies di halaman Profil.';
        await updateJobStatus(jobId, userId, 'failed', 0, reason);
        if (io) {
          io.emit('crawler:job_failed', { jobId, userId, error: reason });
        }
        logger.warn(`⚠️  Job ${jobId} — 0 tweets collected, marked as failed`);
      } else {
        await updateJobStatus(jobId, userId, 'completed', tweets.length);
        if (io) {
          io.emit('crawler:job_completed', { jobId, userId, collectedCount: tweets.length, targetCount });
        }
        logger.info(`✅ Job ${jobId} completed. Collected ${tweets.length} tweets`);
      }

      // Inter-job cooldown: prevents X.com from detecting consecutive bot requests.
      // Sleep INSIDE the processor so the next queued job doesn't start until after the wait.
      const cooldown = INTER_JOB_COOLDOWN_MS + Math.random() * 15000;
      logger.info(`⏱️  Inter-job cooldown: ${Math.round(cooldown / 1000)}s before next job...`);
      await new Promise(resolve => setTimeout(resolve, cooldown));

      return {
        success: tweets.length > 0,
        collected: tweets.length,
        jobId
      };

    } catch (error) {
      logger.error(`❌ Job ${jobId} failed:`, error);

      await updateJobStatus(jobId, userId, 'failed', 0, error.message);

      if (io) {
        io.emit('crawler:job_failed', { jobId, userId, error: error.message });
      }

      // Still cool down on error to avoid hammering X.com
      await new Promise(resolve => setTimeout(resolve, 15000));

      throw error;
    }
  });
  
  // Handle failed jobs
  queue.on('failed', (job, err) => {
    logger.error(`❌ Job ${job.id} failed permanently:`, err.message);
  });
  
  // Handle completed jobs
  queue.on('completed', (job, result) => {
    logger.info(`✅ Job ${job.id} completed:`, result);
  });
}

/**
 * Submit new crawling job
 * @param {string} userId - User ID
 * @param {string} keyword - Search keyword
 * @param {number} targetCount - Target tweet count
 * @param {object} config - Crawler configuration
 * @param {string} parentJobId - Optional parent job ID if resuming
 */
async function submitCrawlJob(userId, keyword, targetCount = 100, config = {}, parentJobId = null) {
  try {
    const queue = createJobQueue();
    const jobId = uuidv4();
    
    const configForDatabase = { ...config };
    // Never persist cookies/credentials in DB config (only in user_api_credentials)
    delete configForDatabase.xCookies;

    // Create job in database first
    const db = getDb();
    const notes = parentJobId ? `Resumed from job ${parentJobId}` : null;
    
    // The `notes` variable is not used in the current schema for crawler_jobs.
    // It was likely intended for a field that no longer exists.
    // We will proceed without inserting it into `crawler_jobs`.
    await db.execute(`
      INSERT INTO crawler_jobs (job_id, user_id, keyword, target_count, status, config)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `, [jobId, userId, keyword, targetCount, JSON.stringify(configForDatabase)]);
    
    // Create progress record
    await db.execute(`
      INSERT INTO crawler_job_progress (job_id, user_id, status_message)
      VALUES (?, ?, 'Queued for processing')
    `, [jobId, userId]);
    
    // Add job to queue
    const job = await queue.add(
      {
        userId,
        keyword,
        targetCount,
        config: {
          headless: true,
          rateLimit: 2000,
          maxRetries: 3,
          ...config
        }
      },
      {
        jobId: jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: false,
        removeOnFail: false
      }
    );
    
    logger.info(`📌 Job submitted: ${jobId}`);
    
    return {
      success: true,
      jobId,
      status: 'queued'
    };
    
  } catch (error) {
    logger.error('Error submitting job:', error);
    throw error;
  }
}

/**
 * Get job status
 */
async function getJobStatus(jobId, userId) {
  try {
    const db = getDb();
    
    const [job] = await db.execute(`
      SELECT j.*, p.total_collected, p.status_message, p.last_error
      FROM crawler_jobs j
      LEFT JOIN crawler_job_progress p ON j.job_id = p.job_id
      WHERE j.job_id = ? AND j.user_id = ?
    `, [jobId, userId]);
    
    if (job.length === 0) {
      return null;
    }
    
    return job[0];
  } catch (error) {
    logger.error('Error getting job status:', error);
    throw error;
  }
}

/**
 * Get all jobs for user
 */
async function getUserJobs(userId, limit = 20, collectionId = null) {
  // 1. Validate parameters *before* the query to prevent SQL errors.
  const numericUserId = Number(userId);
  let numericLimit = Number(limit);

  if (isNaN(numericUserId) || numericUserId <= 0) {
    logger.error('Invalid or missing userId for getUserJobs', { userId });
    throw new Error('Invalid user ID provided.');
  }

  if (isNaN(numericLimit) || numericLimit <= 0) {
    logger.warn('Invalid limit provided for getUserJobs, defaulting to 20.', { limit });
    numericLimit = 20;
  }

  try {
    const db = getDb();

    // Build WHERE clause — optionally filter by collection stored in config JSON
    const conditions = ['j.user_id = ?'];
    const params = [numericUserId];

    if (collectionId) {
      conditions.push(`JSON_UNQUOTE(JSON_EXTRACT(j.config, '$.collectionId')) = ?`);
      params.push(collectionId);
    }

    // LIMIT inlined (not ?-param): mysql2 prepared statements reject JS numbers
    // for LIMIT/OFFSET with HY000 "Incorrect arguments to mysqld_stmt_execute".
    const query = `
      SELECT
        j.*,
        p.total_collected,
        p.status_message,
        p.last_error
      FROM crawler_jobs j
      LEFT JOIN crawler_job_progress p ON j.job_id = p.job_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY j.created_at DESC
      LIMIT ${numericLimit}
    `;

    const [jobs] = await db.execute(query, params);

    return jobs || [];

  } catch (error) {
    logger.error('SQL Error in getUserJobs', { 
      errorMessage: error.message, 
      sqlState: error.sqlState,
      params: { userId, limit }
    });
    throw error;
  }
}

/**
 * Update job status in database
 */
async function updateJobStatus(jobId, userId, status, collectedCount = 0, errorMessage = null) {
  try {
    const db = getDb();

    let query = 'UPDATE crawler_jobs SET status = ?, collected_count = ?, updated_at = NOW()';
    const params = [status, collectedCount];

    if (status === 'completed') {
      query += ', completed_at = NOW()';
    } else if (status === 'processing' || status === 'failed') { // Also set started_at for failed jobs
      query += ', started_at = NOW()';
    }

    query += ' WHERE job_id = ? AND user_id = ?';
    params.push(jobId, userId);

    await db.execute(query, params);

    if (status === 'failed' && errorMessage) {
      // Truncate error message to fit into the database column (e.g., VARCHAR(255))
      const truncatedError = errorMessage.substring(0, 255);
      await db.execute(`
        UPDATE crawler_job_progress
        SET last_error = ?, status_message = ?
        WHERE job_id = ? AND user_id = ?
      `, [truncatedError, `Failed: ${truncatedError}`, jobId, userId]);
    }
  } catch (error) {
    logger.error('Error updating job status:', { 
        errorMessage: error.message, 
        jobId, 
        userId, 
        stack: error.stack 
    });
  }
}

/**
 * Update job progress in database and emit real-time WebSocket event
 */
async function updateJobProgress(jobId, userId, collected, total) {
  try {
    const db = getDb();

    const progress = Math.round((collected / total) * 100);
    const statusMessage = `Processing... ${progress}% complete (${collected}/${total} tweets)`;

    await db.execute(`
      UPDATE crawler_job_progress
      SET total_collected = ?, status_message = ?, updated_at = NOW()
      WHERE job_id = ? AND user_id = ?
    `, [
      collected,
      statusMessage,
      jobId,
      userId
    ]);

    // Emit real-time progress to all connected clients
    if (io) {
      io.emit('crawler:job_progress', {
        jobId,
        userId,
        collected,
        total,
        progress,
        statusMessage
      });
    }
  } catch (error) {
    logger.error('Error updating job progress:', error);
  }
}

/**
 * Save tweets to database
 */
async function saveTweetsToDB(jobId, userId, keyword, tweets, collectionId = null) {
  try {
    const db = getDb();

    // Resolve numeric collection PK from collection_id UUID (if provided)
    let collectionPk = null;
    if (collectionId) {
      const [rows] = await db.execute(
        'SELECT id FROM crawler_collections WHERE collection_id = ? AND user_id = ?',
        [collectionId, userId]
      );
      if (rows.length > 0) collectionPk = rows[0].id;
    }

    let saved = 0;
    for (const tweet of tweets) {
      const tweetId = tweet.id || tweet.tweetId || null;

      if (collectionPk) {
        // Save to crawler_tweets (linked to collection)
        await db.execute(`
          INSERT IGNORE INTO crawler_tweets
            (tweet_id, collection_id, user_id, text, username, author_id,
             created_at_tweet, url, likes, retweets, replies, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'crawler')
        `, [
          tweetId,
          collectionPk,
          userId,
          tweet.text || '',
          tweet.username || tweet.author || '',
          tweet.authorId || tweet.userId || null,
          tweet.created_at || tweet.createdAt || tweet.date || null,
          tweet.url || null,
          tweet.likes || tweet.likeCount || 0,
          tweet.retweets || tweet.retweetCount || 0,
          tweet.replies || tweet.replyCount || 0,
        ]);
        saved++;
      } else {
        // Fallback: save to raw_twitter_data without collection
        await db.execute(`
          INSERT INTO raw_twitter_data
            (user_id, job_id, session_id, raw_data, clean_text, collected_via, created_at)
          VALUES (?, ?, ?, ?, ?, 'crawler', NOW())
        `, [userId, jobId, `crawler_${jobId}`, JSON.stringify(tweet), tweet.text]);
        saved++;
      }
    }

    // Update tweet_count on the collection
    if (collectionPk) {
      await db.execute(`
        UPDATE crawler_collections
        SET tweet_count = (SELECT COUNT(*) FROM crawler_tweets WHERE collection_id = ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [collectionPk, collectionPk]);
    }

    logger.info(`💾 Saved ${saved} tweets to database`);
  } catch (error) {
    logger.error('Error saving tweets to DB:', error);
    throw error;
  }
}

module.exports = {
  createJobQueue,
  initializeQueueProcessor,
  submitCrawlJob,
  cancelCrawlJob,
  getJobStatus,
  getUserJobs,
  redisClient,
  setIO
};