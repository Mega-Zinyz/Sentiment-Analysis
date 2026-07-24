const express = require('express');
const router = express.Router();
const { 
  submitCrawlJob, 
  cancelCrawlJob, 
  stopAllJobs, 
  getJobStatus, 
  getUserJobs 
} = require('../utils/job-queue');
const { authMiddleware } = require('../middleware/auth'); // Sesuaikan dengan middleware auth kamu

// Terapkan middleware autentikasi ke seluruh route crawler
router.use(authMiddleware);

/**
 * POST /api/crawler/start
 * Memulai job crawling baru
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { keyword, targetCount, config } = req.body;

    if (!keyword || keyword.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Kata kunci (keyword) pencarian harus diisi.'
      });
    }

    const result = await submitCrawlJob(
      userId, 
      keyword, 
      targetCount || 100, 
      config || {}
    );

    return res.status(200).json(result);

  } catch (error) {
    // 1. Tangkap error jika pengguna sudah memiliki job yang berjalan / dalam masa cooldown
    if (error.message && error.message.includes('sedang berjalan atau menunggu')) {
      return res.status(409).json({
        success: false,
        code: 'JOB_ALREADY_RUNNING',
        message: error.message
      });
    }

    // 2. Tangkap error jika antrean server sedang penuh
    if (error.message && error.message.includes('Server sedang sibuk')) {
      return res.status(429).json({
        success: false,
        code: 'SERVER_BUSY',
        message: error.message
      });
    }

    // 3. Fallback untuk error server yang sesungguhnya
    console.error('Unhandled Error in /api/crawler/start:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan pada server saat memulai crawler.'
    });
  }
});

/**
 * POST /api/crawler/stop
 * Menghentikan satu job spesifik
 */
router.post('/stop', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId wajib disertakan.' });
    }

    await cancelCrawlJob(jobId);
    return res.json({ success: true, message: `Job ${jobId} berhasil dibatalkan.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/crawler/stop-all
 * Menghentikan semua job aktif milik pengguna
 */
router.post('/stop-all', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await stopAllJobs(userId);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/crawler/status/:jobId
 * Mengambil status job berdasarkan jobId
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const job = await getJobStatus(req.params.jobId, userId);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job tidak ditemukan.' });
    }

    return res.json({ success: true, job });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/crawler/jobs
 * Mengambil riwayat job pengguna
 */
router.get('/jobs', async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const limit = req.query.limit || 20;
    const collectionId = req.query.collectionId || null;

    const jobs = await getUserJobs(userId, limit, collectionId);
    return res.json({ success: true, jobs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;