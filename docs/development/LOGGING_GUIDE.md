# Production Logging & Debugging Guide

## Overview

This application uses **Winston** for production-grade logging instead of console.log statements. This allows you to debug production issues without cluttering the console.

## How It Works

### Development Mode (NODE_ENV=development)
- Logs appear in **console** with colors
- All log levels visible (debug, info, warn, error)
- Frontend shows detailed error messages

### Production Mode (NODE_ENV=production)
- Logs written to **rotating log files** in `/app/logs/`
- Console.log statements are suppressed (except important ones with emojis)
- Frontend errors automatically sent to backend for logging
- Log files rotate daily and are kept for 14-30 days

## Log Files Location

```
Backend/logs/
├── error-2025-11-12.log          # Error logs only (kept 30 days)
├── combined-2025-11-12.log       # All logs info+ (kept 14 days)
└── analysis-2025-11-12.log       # Sentiment analysis logs (kept 30 days)
```

## Accessing Logs in Production

### 1. Docker Container Logs
```bash
# View live logs
docker logs -f sentiment-backend

# View last 100 lines
docker logs --tail 100 sentiment-backend

# View logs from specific time
docker logs --since 30m sentiment-backend
```

### 2. Access Log Files Inside Container
```bash
# Enter container
docker exec -it sentiment-backend sh

# View error logs
cat /app/logs/error-2025-11-12.log

# Tail live errors
tail -f /app/logs/error-2025-11-12.log

# Search for specific error
grep "session_id" /app/logs/error-2025-11-12.log
```

### 3. Copy Log Files to Host
```bash
# Copy today's error log
docker cp sentiment-backend:/app/logs/error-2025-11-12.log ./error.log

# Copy all logs
docker cp sentiment-backend:/app/logs/ ./backend-logs/
```

### 4. Mount Logs Volume (Recommended for Production)

Update `docker-compose.yml`:
```yaml
backend:
  volumes:
    - ./logs:/app/logs  # Mount logs to host
```

Then logs will be available at `./logs/` on your host machine.

## Log Levels

1. **error** - Critical errors that need immediate attention
2. **warn** - Warning messages about potential issues
3. **info** - General information (analysis progress, API calls)
4. **debug** - Detailed debugging information (dev only)

## Using the Logger in Code

### Backend (Node.js)

```javascript
const logger = require('./utils/logger');

// Basic logging
logger.info('User logged in successfully');
logger.error('Database connection failed');
logger.warn('Rate limit approaching threshold');

// Structured logging with metadata
logger.info('Analysis started', {
  sessionId: 'ABC123',
  itemCount: 1000,
  userId: 42
});

// Specialized logging methods
logger.logAnalysis('SESSION_123', 'Batch 5/10 completed', { 
  batchSize: 100 
});

logger.logAuth(userId, 'Login attempt', { 
  success: true, 
  ip: '192.168.1.1' 
});

logger.logAPI('/api/sentiment/analyze', 'POST', 200, { 
  duration: '1.5s' 
});

logger.logError('SENTIMENT_ANALYSIS', error, { 
  sessionId: 'ABC123' 
});
```

### Frontend (Angular)

Frontend errors are automatically logged to backend in production via `GlobalErrorHandler`.

To manually log:
```typescript
// Errors are automatically caught and logged
throw new Error('Something went wrong');

// For severe errors in development that should be logged:
this.http.post(`${environment.apiUrl}/error-log`, {
  message: 'Critical operation failed',
  severity: 'error',
  metadata: { userId: this.userId, action: 'export' }
}).subscribe();
```

## Monitoring Production Issues

### Common Debugging Scenarios:

**1. Analysis taking too long**
```bash
# Check analysis logs
docker exec sentiment-backend tail -f /app/logs/analysis-2025-11-12.log | grep "ANALYSIS"
```

**2. User authentication errors**
```bash
# Search for auth issues
docker exec sentiment-backend grep "AUTH" /app/logs/error-2025-11-12.log
```

**3. Database connection issues**
```bash
# Look for database errors
docker exec sentiment-backend grep -i "database\|mysql" /app/logs/error-2025-11-12.log
```

**4. API errors**
```bash
# Monitor API calls
docker exec sentiment-backend grep "API" /app/logs/combined-2025-11-12.log
```

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production` in docker-compose.yml
- [ ] Mount logs volume: `./logs:/app/logs`
- [ ] Set `LOG_LEVEL=info` (not debug)
- [ ] Remove any remaining console.log from code
- [ ] Test log file rotation (check next day)
- [ ] Setup log monitoring (optional: ELK stack, CloudWatch, etc.)
- [ ] Configure log retention based on compliance requirements

## Log Rotation

Logs automatically rotate:
- **Daily**: New file created each day
- **Max Size**: 20-50MB per file
- **Retention**: 14-30 days depending on log type
- **Old logs**: Automatically deleted

## Security Notes

- Log files may contain sensitive data (sanitize before sharing)
- Don't log passwords, API keys, or tokens
- Limit access to log files in production
- Consider encrypting log files at rest
- Review logs periodically for security incidents

## Advanced: Centralized Logging (Optional)

For large-scale production, consider:

1. **ELK Stack** (Elasticsearch, Logstash, Kibana)
2. **CloudWatch** (AWS)
3. **Papertrail** (Solarwinds)
4. **Datadog**
5. **Sentry** (for error tracking)

Winston supports transports for all major logging services.

## Troubleshooting

**Logs not appearing:**
- Check `NODE_ENV` is set correctly
- Verify `/app/logs` directory exists and is writable
- Check Docker volume mounts

**Log files too large:**
- Reduce `maxSize` in `logger.js`
- Decrease `maxFiles` retention period
- Adjust `LOG_LEVEL` to `info` or `warn`

**Missing log entries:**
- Check `LOG_LEVEL` setting (may be filtering out logs)
- Verify logger is imported and used instead of console.log
- Check if errors are thrown before logging
