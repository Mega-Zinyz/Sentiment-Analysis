# Production Checklist

Use this checklist before deploying to production.

## ✅ Pre-Deployment Checklist

### 1. Environment Configuration

* [ ] Copy `.env.example` to `.env`
* [ ] Set `NODE_ENV=production`
*   [ ] Generate new `JWT_SECRET` (64 bytes)

    ```bash
    node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    ```
*   [ ] Generate new `ENCRYPTION_KEY` (32 bytes)

    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
* [ ] Set strong `DB_ROOT_PASSWORD` and `DB_PASSWORD`
* [ ] Configure `ALLOWED_ORIGINS` with your production domain(s)
* [ ] Set `LOG_LEVEL=info` or `LOG_LEVEL=warn`

### 2. Security Verification

* [ ] Verify `.env` is in `.gitignore`
*   [ ] Confirm no secrets committed to git

    ```bash
    git log --all --source --full-history -- "*/.env"
    ```
* [ ] Test CORS with production domain
* [ ] Verify error responses are sanitized (no stack traces)
* [ ] Check SSL/TLS certificate is valid

### 3. Database

* [ ] Backup existing data (if any)
* [ ] Verify database credentials are strong
* [ ] Test database connection
*   [ ] Run database migrations

    ```bash
    docker-compose exec backend node scripts/migration/migrate-database.js
    ```

### 4. Docker Configuration

* [ ] Review `docker-compose.yml`
* [ ] Verify all environment variables are passed correctly
* [ ] Check volume mounts for persistence
* [ ] Confirm restart policies are set

### 5. Testing

* [ ] Test health endpoint: `http://your-domain.com/health`
* [ ] Test API authentication
* [ ] Test sentiment analysis workflow
* [ ] Verify file uploads work
* [ ] Check logs are being written: `docker logs sentiment-backend`

### 6. Monitoring Setup

* [ ] Configure log retention (default: 14-30 days)
* [ ] Set up log monitoring/alerts
* [ ] Monitor disk space for logs and uploads
* [ ] Set up database backup schedule

### 7. Documentation

* [ ] Update README with production URL
* [ ] Document deployment procedure
* [ ] Record secret key backup location
* [ ] Create incident response plan

## 🚀 Deployment Steps

### First Time Deployment

1.  **Clone repository** (or transfer files):

    ```bash
    git clone <your-repo> sentiment_analisis
    cd sentiment_analisis
    ```
2.  **Configure environment**:

    ```bash
    cp .env.example .env
    # Edit .env with production values
    nano .env
    ```
3.  **Generate secrets**:

    ```bash
    cd Backend
    node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
    node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
    ```
4.  **Build and start**:

    ```bash
    docker-compose up -d --build
    ```
5.  **Verify deployment**:

    ```bash
    docker-compose ps
    curl http://localhost:5000/health
    ```
6.  **Check logs**:

    ```bash
    docker-compose logs -f backend
    ```

### Updates/Redeployment

1.  **Pull latest changes**:

    ```bash
    git pull origin main
    ```
2.  **Backup database** (if schema changes):

    ```bash
    docker-compose exec mysql mysqldump -u root -p sentiment_analysis > backup_$(date +%Y%m%d).sql
    ```
3.  **Rebuild and restart**:

    ```bash
    docker-compose down
    docker-compose up -d --build
    ```
4.  **Run migrations** (if needed):

    ```bash
    docker-compose exec backend node scripts/migration/migrate-database.js
    ```
5.  **Verify**:

    ```bash
    docker-compose ps
    curl http://localhost:5000/health
    ```

## 🔍 Post-Deployment Verification

### Health Checks

```bash
# Backend health
curl http://your-domain.com/health

# Expected response:
# {"status":"online","services":{"api":{"status":"online"},"database":{"status":"online"}}}
```

### Test Authentication

```bash
# Register test user
curl -X POST http://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123","fullName":"Test User"}'

# Login
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123"}'
```

### Test CORS

```bash
# Should be allowed (your domain)
curl -H "Origin: https://yourdomain.com" http://your-domain.com/api/health

# Should be blocked (unauthorized domain)
curl -H "Origin: https://malicious-site.com" http://your-domain.com/api/health
```

### Check Logs

```bash
# View recent logs
docker-compose logs --tail=100 backend

# Follow logs in real-time
docker-compose logs -f backend

# Check error logs inside container
docker-compose exec backend ls -la /app/logs/
docker-compose exec backend tail -f /app/logs/error-*.log
```

## 📊 Monitoring Commands

### Container Status

```bash
# All containers
docker-compose ps

# Container resource usage
docker stats sentiment-backend sentiment-frontend sentiment-mysql
```

### Database

```bash
# Connect to MySQL
docker-compose exec mysql mysql -u root -p sentiment_analysis

# Check database size
docker-compose exec mysql mysql -u root -p -e "SELECT table_schema AS 'Database', ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)' FROM information_schema.tables WHERE table_schema='sentiment_analysis';"
```

### Disk Space

```bash
# Check Docker volumes
docker system df -v

# Clean up unused resources
docker system prune -a --volumes
```

## 🆘 Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Database not ready: Wait for mysql to be healthy
# - Port conflict: Check if port 5000 is in use
# - Environment variables: Verify .env file
```

### Database connection failed

```bash
# Check MySQL is running
docker-compose ps mysql

# Test connection
docker-compose exec mysql mysqladmin ping -h localhost

# Reset database (WARNING: deletes data)
docker-compose down -v
docker-compose up -d
```

### CORS errors

```bash
# Check ALLOWED_ORIGINS in .env
cat .env | grep ALLOWED_ORIGINS

# View CORS blocks in logs
docker-compose logs backend | grep "CORS blocked"
```

## 🔐 Security Reminders

1. **Never commit `.env` files** - They contain secrets!
2. **Rotate secrets regularly** - Change JWT\_SECRET periodically
3. **Use strong passwords** - Minimum 12 characters
4. **Enable HTTPS** - Configure at hosting provider level
5. **Monitor logs** - Check for unauthorized access attempts
6. **Backup encryption keys** - Store safely outside server
7. **Update dependencies** - Run `npm audit` regularly
8. **Limit database access** - Don't expose port 3306 publicly

## 📝 Current Configuration

* **Backend Port**: 5000
* **Frontend Port**: 80
* **Database Port**: 3306 (internal only)
* **Workers**: 6 parallel workers
* **Batch Size**: 300 tweets per batch
* **Log Retention**: 14-30 days
* **Performance**: \~20-25 minutes for 23,000 tweets

***

**System Status**: ✅ Production Ready

Last Updated: November 12, 2025
