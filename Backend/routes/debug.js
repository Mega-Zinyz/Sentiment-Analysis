const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// GET /debug/failed-tweets?n=50
// Returns the last `n` lines from the failed_tweets.log file.
router.get('/failed-tweets', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(500, parseInt(req.query.n || '50', 10)));
    const logsDir = path.join(__dirname, '..', 'logs');
    const logFile = path.join(logsDir, 'failed_tweets.log');

    if (!fs.existsSync(logFile)) {
      return res.json({ lines: [], message: 'No failed tweets log found' });
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-n);

    res.json({ lines: tail, totalLines: lines.length });
  } catch (error) {
    console.error('Error reading failed_tweets.log:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: 'Failed to read failed tweets log', details: error?.message || String(error) });
  }
});

module.exports = router;
