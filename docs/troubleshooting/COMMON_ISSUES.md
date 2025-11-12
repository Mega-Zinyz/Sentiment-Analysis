# Common Issues & Troubleshooting

This guide covers the most common issues you might encounter and their solutions.

## 🔍 Quick Diagnosis

### Check System Health

```bash
# Check all containers
docker-compose ps

# Check backend health
curl http://localhost:5000/health

# View recent logs
docker-compose logs --tail=50 backend
```

## 🚫 Installation & Setup Issues

### Issue: Docker Compose Fails to Start

**Symptoms:**
- Containers won't start
- Error messages during `docker-compose up`

**Solutions:**

1. **Check Docker is Running**
   ```powershell
   docker --version
   docker-compose --version
   ```

2. **Check Port Conflicts**
   ```powershell
   # Check if ports are already in use
   netstat -ano | findstr :80
   netstat -ano | findstr :5000
   netstat -ano | findstr :3306
   ```

3. **Clear Docker Cache**
   ```bash
   docker-compose down -v
   docker system prune -a
   docker-compose up -d --build
   ```

4. **Check .env File Exists**
   ```powershell
   Test-Path .env
   cat .env
   ```

### Issue: Environment Variables Not Loading

**Symptoms:**
- "JWT_SECRET is required" error
- Database connection failed
- CORS errors

**Solutions:**

1. **Verify .env File**
   ```bash
   # Check file exists
   ls -la .env
   
   # Verify critical variables
   cat .env | grep JWT_SECRET
   cat .env | grep DB_PASSWORD
   ```

2. **Regenerate Secrets**
   ```bash
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
   node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Check for Quotes**
   ```bash
   # WRONG
   JWT_SECRET="your-secret-here"
   
   # CORRECT
   JWT_SECRET=your-secret-here
   ```

## 🔐 Authentication Issues

### Issue: Cannot Login / Invalid Credentials

**Symptoms:**
- "Invalid email or password" error
- Login succeeds but immediately logs out

**Solutions:**

1. **Check User Exists**
   ```bash
   docker exec -it sentiment-mysql mysql -u sentiment_user -p
   USE sentiment_analysis;
   SELECT email, full_name FROM users;
   ```

2. **Reset Admin Password**
   ```bash
   cd Backend
   node scripts/maintenance/reset-admin-password.js
   ```

3. **Clear Browser Storage**
   - Open DevTools (F12)
   - Go to Application → Storage
   - Clear site data
   - Refresh page

### Issue: JWT Token Expired

**Symptoms:**
- 401 Unauthorized errors
- Redirected to login frequently

**Solutions:**

1. **Check Token Expiration Settings**
   ```bash
   JWT_EXPIRATION=24h
   JWT_REFRESH_EXPIRATION=7d
   ```

2. **Clear Tokens and Re-login**
   - Logout
   - Clear browser cache
   - Login again

## 🗄️ Database Issues

### Issue: Database Connection Failed

**Symptoms:**
- "Error: connect ECONNREFUSED"
- "Access denied for user"
- Backend logs show database errors

**Solutions:**

1. **Check MySQL Container Status**
   ```bash
   docker-compose ps mysql
   docker-compose logs mysql
   ```

2. **Wait for MySQL to be Ready**
   ```bash
   # MySQL takes time to initialize
   docker-compose logs mysql | grep "ready for connections"
   ```

3. **Verify Database Credentials**
   ```bash
   cat .env | grep DB_
   ```

4. **Reset Database (WARNING: Deletes all data)**
   ```bash
   docker-compose down -v
   docker-compose up -d
   # Wait 30 seconds for initialization
   ```

5. **Manual Database Connection Test**
   ```bash
   docker exec -it sentiment-mysql mysql -u sentiment_user -p
   # Enter password from .env file
   SHOW DATABASES;
   USE sentiment_analysis;
   SHOW TABLES;
   ```

### Issue: Tables Don't Exist

**Symptoms:**
- "Table doesn't exist" errors
- Database schema not created

**Solutions:**

1. **Run Setup Script**
   ```bash
   cd Backend
   node scripts/setup/setup-database.js
   ```

2. **Check Tables**
   ```bash
   docker exec -it sentiment-mysql mysql -u sentiment_user -p
   USE sentiment_analysis;
   SHOW TABLES;
   ```

## 📊 Analysis Issues

### Issue: Analysis Stuck or Very Slow

**Symptoms:**
- Progress bar not moving
- Analysis takes longer than expected
- No results after long wait

**Solutions:**

1. **Check Worker Status**
   ```bash
   docker-compose logs backend | grep "Worker"
   docker-compose logs backend | grep "Processing batch"
   ```

2. **Restart Backend**
   ```bash
   docker-compose restart backend
   ```

3. **Reduce Worker Count/Batch Size**
   Edit `Backend/routes/sentimentAnalysis.js`:
   ```javascript
   const NUM_WORKERS = 3;      // Reduce from 6
   const BATCH_SIZE = 200;     // Reduce from 300
   ```

4. **Check System Resources**
   ```bash
   docker stats sentiment-backend
   ```

5. **Check for Errors**
   ```bash
   docker-compose logs backend | grep "ERROR"
   docker exec sentiment-backend tail -f /app/logs/error-*.log
   ```

### Issue: Analysis Results Show 0% or 100%

**Symptoms:**
- All tweets classified as positive
- All tweets classified as negative
- No variation in results

**Solutions:**

1. **Check Word Library Quality**
   - Ensure library has both positive AND negative words
   - Add more diverse words
   - Use domain-specific vocabulary

2. **Verify Word Library Selection**
   - Check that correct library was selected
   - View library contents in Admin panel

3. **Test with Sample Data**
   ```bash
   cd Backend
   node scripts/testing/test_raw_data_analysis.js
   ```

### Issue: Python Worker Timeout

**Symptoms:**
- "Worker timeout" errors
- Analysis fails after 240 seconds

**Solutions:**

1. **Increase Timeout**
   Edit `Backend/routes/sentimentAnalysis.js`:
   ```javascript
   const WORKER_TIMEOUT = 360; // Increase from 240
   ```

2. **Reduce Batch Size**
   ```javascript
   const BATCH_SIZE = 200; // Reduce from 300
   ```

3. **Check Python Dependencies**
   ```bash
   docker exec sentiment-backend pip list | grep -E "scikit|sastrawi"
   ```

## 🌐 Frontend Issues

### Issue: Frontend Not Loading / Blank Page

**Symptoms:**
- White screen
- "Cannot GET /" error
- Nginx errors

**Solutions:**

1. **Check Frontend Container**
   ```bash
   docker-compose ps frontend
   docker-compose logs frontend
   ```

2. **Rebuild Frontend**
   ```bash
   docker-compose up -d --build frontend
   ```

3. **Check Nginx Configuration**
   ```bash
   docker exec sentiment-frontend cat /etc/nginx/nginx.conf
   ```

4. **Clear Browser Cache**
   - Hard refresh (Ctrl + Shift + R)
   - Clear cache and cookies

### Issue: CORS Errors

**Symptoms:**
- "Access to XMLHttpRequest blocked by CORS"
- Network errors in browser console

**Solutions:**

1. **Check Allowed Origins**
   ```bash
   cat .env | grep ALLOWED_ORIGINS
   ```

2. **Update CORS Settings**
   ```bash
   # For development
   ALLOWED_ORIGINS=http://localhost,http://localhost:4200
   
   # For production
   ALLOWED_ORIGINS=https://yourdomain.com
   
   # For wildcard subdomain
   ALLOWED_ORIGINS=*.yourdomain.com
   ```

3. **Restart Backend**
   ```bash
   docker-compose restart backend
   ```

4. **Check CORS Logs**
   ```bash
   docker-compose logs backend | grep "CORS"
   ```

### Issue: API Requests Failing

**Symptoms:**
- 404 Not Found errors
- 500 Internal Server Error
- Network timeout

**Solutions:**

1. **Check Backend Health**
   ```bash
   curl http://localhost:5000/health
   ```

2. **Verify API URL Configuration**
   Check `Frontend/src/environments/environment.ts`:
   ```typescript
   export const environment = {
     apiUrl: 'http://localhost:5000'
   };
   ```

3. **Check Network Tab**
   - Open DevTools (F12)
   - Go to Network tab
   - See actual requests and responses
   - Check request URL and payload

## 🔒 Security Issues

### Issue: Rate Limiting / Too Many Requests

**Symptoms:**
- "Too many requests" error
- 429 status code
- Temporary API lockout

**Solutions:**

1. **Wait and Retry**
   - Rate limit resets after 15 minutes

2. **Adjust Rate Limits**
   Edit `.env`:
   ```bash
   RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
   RATE_LIMIT_MAX_REQUESTS=200  # Increase from 100
   ```

3. **Check IP Address**
   ```bash
   docker-compose logs backend | grep "Rate limit"
   ```

### Issue: Unauthorized / 401 Errors

**Symptoms:**
- Logged out unexpectedly
- Cannot access protected routes
- "Unauthorized" errors

**Solutions:**

1. **Check Token Validity**
   - Open DevTools → Application → Session Storage
   - Check if `token` exists
   - Check `tokenExpiry`

2. **Re-authenticate**
   - Logout and login again
   - Clear session storage

3. **Verify JWT Secret**
   ```bash
   cat .env | grep JWT_SECRET
   # Ensure it's set and hasn't changed
   ```

## 📁 File Upload Issues

### Issue: CSV Upload Fails

**Symptoms:**
- "Invalid file format" error
- Upload stuck at 0%
- No data appears after upload

**Solutions:**

1. **Verify CSV Format**
   Required columns:
   ```text
   timestamp,username,message
   2024-01-01 10:00:00,user123,Tweet text here
   ```

2. **Check File Size**
   ```bash
   # Increase in .env if needed
   MAX_FILE_SIZE=50MB
   ```

3. **Check Upload Directory Permissions**
   ```bash
   docker exec sentiment-backend ls -la /app/temp/uploads
   ```

4. **Check Backend Logs**
   ```bash
   docker-compose logs backend | grep "upload"
   ```

## 🐛 Performance Issues

### Issue: High Memory Usage

**Symptoms:**
- System slowdown
- Container crashes
- Out of memory errors

**Solutions:**

1. **Check Resource Usage**
   ```bash
   docker stats
   ```

2. **Reduce Worker Count**
   ```javascript
   const NUM_WORKERS = 3; // Instead of 6
   ```

3. **Reduce Batch Size**
   ```javascript
   const BATCH_SIZE = 100; // Instead of 300
   ```

4. **Increase Docker Memory Limit**
   - Docker Desktop → Settings → Resources
   - Increase memory allocation

### Issue: Slow Database Queries

**Symptoms:**
- Long response times
- Timeouts
- High database CPU usage

**Solutions:**

1. **Add Database Indexes**
   ```sql
   CREATE INDEX idx_user_id ON analysis_sessions(user_id);
   CREATE INDEX idx_session_id ON analysis_results(session_id);
   ```

2. **Optimize Queries**
   ```bash
   docker exec sentiment-backend cat /app/logs/combined-*.log | grep "query"
   ```

3. **Check Connection Pool**
   ```javascript
   // Backend/config/mysql-database.js
   connectionLimit: 10 // Adjust as needed
   ```

## 🔧 Docker Issues

### Issue: Container Keeps Restarting

**Symptoms:**
- Container status shows "restarting"
- Logs show repeated startup messages

**Solutions:**

1. **Check Container Logs**
   ```bash
   docker-compose logs --tail=100 backend
   docker-compose logs --tail=100 frontend
   docker-compose logs --tail=100 mysql
   ```

2. **Check for Port Conflicts**
   ```powershell
   netstat -ano | findstr :80
   netstat -ano | findstr :5000
   netstat -ano | findstr :3306
   ```

3. **Remove and Recreate**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Issue: Volume Permission Errors

**Symptoms:**
- "Permission denied" errors
- Cannot write to volumes
- Log files not created

**Solutions:**

1. **Check Volume Mounts**
   ```bash
   docker-compose config
   ```

2. **Reset Volumes**
   ```bash
   docker-compose down -v
   docker volume prune
   docker-compose up -d
   ```

## 📞 Getting More Help

If your issue isn't covered here:

1. **Check Detailed Logs**
   ```bash
   docker-compose logs --tail=200 > debug.log
   ```

2. **Search Existing Issues**
   - [GitHub Issues](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues)

3. **Create New Issue**
   Include:
   - Exact error message
   - Steps to reproduce
   - System info (OS, Docker version)
   - Relevant logs

4. **Check Documentation**
   - [Production Debugging](../development/PRODUCTION_DEBUGGING.md)
   - [Logging Guide](../development/LOGGING_GUIDE.md)

---

**Last Updated**: November 12, 2025
