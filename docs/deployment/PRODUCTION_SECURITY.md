# Production Security Configuration

This document outlines the security measures implemented and required configuration for production deployment.

## 🔒 Security Features Implemented

### 1. Error Handling
- **Production Mode**: Sanitized error messages without internal details
- **Development Mode**: Full error details for debugging
- **Stack Traces**: Hidden in production, shown in development
- **Error Logging**: All errors logged to Winston with full details

**Configuration**: Set `NODE_ENV=production` to enable sanitized errors.

### 2. CORS (Cross-Origin Resource Sharing)
- **Dynamic Origin Validation**: Uses environment variable configuration
- **Origin Whitelist**: Configurable via `ALLOWED_ORIGINS` env var
- **Localhost Fallback**: Defaults to localhost origins for development
- **CORS Logging**: Blocked origins are logged with Winston

**Configuration**:
```env
# Development (default)
ALLOWED_ORIGINS=

# Production (specify your domains)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

### 3. Authentication & Authorization
- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Automatic cleanup of expired sessions
- **Role-Based Access**: Admin routes protected

### 4. Data Protection
- **Encryption**: AES-256-GCM for sensitive data
- **SQL Injection**: Parameterized queries throughout
- **XSS Protection**: Input sanitization
- **Rate Limiting**: Prevents brute force attacks

### 5. Audit Logging
- **User Actions**: Login, registration, data access tracked
- **Security Events**: Failed logins, unauthorized access logged
- **Retention**: 30 days in audit_log table

## 🛠️ Production Setup Checklist

### Environment Variables
```env
# CRITICAL: Change these in production!
JWT_SECRET=your-unique-secret-key-here
ENCRYPTION_KEY=your-32-byte-hex-key-here

# Set to production mode
NODE_ENV=production

# Configure allowed origins (your domain)
ALLOWED_ORIGINS=https://yourdomain.com

# Database with strong password
DB_PASSWORD=strong-random-password

# Logging
LOG_LEVEL=info
```

### Generate Secure Keys

**JWT Secret** (strong random string):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Encryption Key** (32 bytes):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### CORS Configuration Examples

**Single Domain**:
```env
ALLOWED_ORIGINS=https://yourdomain.com
```

**Multiple Domains** (frontend + API docs):
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com,https://www.yourdomain.com
```

**Development** (leave empty for localhost):
```env
ALLOWED_ORIGINS=
```

## 🚨 Security Testing

### Test CORS Protection
```bash
# Should be blocked (wrong origin)
curl -H "Origin: https://malicious-site.com" http://your-api.com/api/health

# Should be allowed (whitelisted origin)
curl -H "Origin: https://yourdomain.com" http://your-api.com/api/health
```

### Test Error Handling

**Development** (`NODE_ENV=development`):
- Errors include full stack traces
- Detailed error messages
- Debug information exposed

**Production** (`NODE_ENV=production`):
- Generic error messages: "An error occurred during analysis"
- No stack traces exposed
- Internal details only in server logs

### Verify Logs Location
```bash
# Inside Docker container
docker exec sentiment-backend ls -la /app/logs/

# Expected files:
# - error-YYYY-MM-DD.log
# - combined-YYYY-MM-DD.log
# - analysis-YYYY-MM-DD.log
```

## 📊 Monitoring

### Check CORS Blocks
```bash
# View blocked CORS attempts
docker logs sentiment-backend | grep "CORS blocked"
```

### Monitor Errors
```bash
# View error log
docker exec sentiment-backend tail -f /app/logs/error-$(date +%Y-%m-%d).log
```

### Audit User Actions
```sql
-- Check recent security events
SELECT * FROM audit_log 
WHERE action IN ('login_failed', 'unauthorized_access') 
ORDER BY timestamp DESC 
LIMIT 100;
```

## 🔍 Security Headers (nginx)

Add to `Frontend/nginx.conf`:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## 🛡️ Best Practices

1. **Never commit `.env` files** - Keep secrets out of version control
2. **Use strong passwords** - Minimum 12 characters for DB and JWT secrets
3. **Regular updates** - Keep dependencies updated for security patches
4. **Log rotation** - Winston handles this automatically (14-30 days)
5. **HTTPS only** - Use SSL/TLS in production (configured at hosting level)
6. **Backup encryption keys** - Store safely, required for data decryption
7. **Monitor logs** - Review error and audit logs regularly
8. **Test CORS** - Verify only whitelisted origins can access API
9. **Rate limiting** - Already configured for auth endpoints
10. **Database access** - Restrict to backend container only in production

## 🔐 Incident Response

If security breach suspected:

1. **Rotate secrets immediately**:
   ```bash
   # Generate new keys
   JWT_SECRET=<new-secret>
   ENCRYPTION_KEY=<new-key>
   DB_PASSWORD=<new-password>
   ```

2. **Check audit logs**:
   ```sql
   SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL 24 HOUR;
   ```

3. **Revoke all sessions**:
   ```sql
   DELETE FROM user_sessions;
   ```

4. **Review error logs**:
   ```bash
   docker exec sentiment-backend cat /app/logs/error-*.log | grep -i "error\|unauthorized\|failed"
   ```

5. **Update ALLOWED_ORIGINS** to remove compromised domain

## 📝 Notes

- Error handler middleware is the last middleware in `index.js`
- 404 handler catches undefined routes
- Global error handler sanitizes all uncaught errors
- CORS function validates each request's origin dynamically
- All sensitive operations are logged to Winston
- Production logs are rotated automatically
