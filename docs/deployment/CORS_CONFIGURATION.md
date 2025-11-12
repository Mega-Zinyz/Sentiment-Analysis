# CORS Configuration Guide

This guide explains how to configure CORS (Cross-Origin Resource Sharing) for different deployment scenarios.

## 🎯 Pattern Matching Support

The system now supports flexible pattern matching for origins:

### 1. **Exact Match** (Most Secure)
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```
✅ **Recommended for production**
- Only allows exact domain matches
- Most secure option

### 2. **Wildcard Subdomain** (Secure for your domains)
```env
ALLOWED_ORIGINS=*.yourdomain.com
```
✅ **Good for multi-subdomain deployments**
- Allows: `app.yourdomain.com`, `api.yourdomain.com`, `staging.yourdomain.com`
- Blocks: `yourdomain.com` (root domain), `otherdomain.com`

**Combined example**:
```env
ALLOWED_ORIGINS=https://yourdomain.com,*.yourdomain.com
```
- Allows root domain + all subdomains

### 3. **Protocol Wildcard** (Less Secure)
```env
ALLOWED_ORIGINS=https://*
```
⚠️ **Use with caution**
- Allows ANY domain with HTTPS
- Logs security warning
- Not recommended for production

### 4. **Full Wildcard** (Not Secure)
```env
ALLOWED_ORIGINS=*
```
❌ **NEVER use in production**
- Allows ALL origins (HTTP and HTTPS)
- Major security risk
- Logs security warning

---

## 📋 Common Scenarios

### Scenario 1: Development (Default)
```env
NODE_ENV=development
ALLOWED_ORIGINS=
```
**Allowed origins**:
- `http://localhost:4200` (Angular dev server)
- `http://localhost` (Frontend in Docker)
- `http://localhost:80`
- `http://127.0.0.1:4200`

### Scenario 2: Single Production Domain
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://sentimentapp.com
```
**Allowed**: Only `https://sentimentapp.com`

### Scenario 3: Multiple Specific Domains
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://sentimentapp.com,https://www.sentimentapp.com,https://app.sentimentapp.com
```
**Allowed**: Only the 3 specified domains

### Scenario 4: Root Domain + All Subdomains
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://sentimentapp.com,*.sentimentapp.com
```
**Allowed**:
- `https://sentimentapp.com` (root)
- `https://app.sentimentapp.com`
- `https://api.sentimentapp.com`
- `https://staging.sentimentapp.com`
- Any other subdomain of `sentimentapp.com`

### Scenario 5: Multiple Domains with Wildcards
```env
NODE_ENV=production
ALLOWED_ORIGINS=*.production.com,*.staging.com
```
**Allowed**:
- All subdomains of `production.com`
- All subdomains of `staging.com`

### Scenario 6: Testing/Staging (Temporary)
```env
NODE_ENV=development
ALLOWED_ORIGINS=https://*
```
⚠️ **Only for testing** - allows any HTTPS domain

---

## 🔍 How Pattern Matching Works

### Wildcard Subdomain (`*.domain.com`)
```javascript
// Pattern: *.yourdomain.com

✅ Matches:
- app.yourdomain.com
- api.yourdomain.com
- staging.yourdomain.com
- deep.nested.yourdomain.com

❌ Does NOT match:
- yourdomain.com (root domain - needs separate entry)
- otherdomain.com
- yourdomain.com.malicious.com
```

### Protocol Wildcard (`https://*`)
```javascript
// Pattern: https://*

✅ Matches:
- https://anydomain.com
- https://app.example.com
- https://totally-different-site.org

❌ Does NOT match:
- http://insecure-site.com (different protocol)
```

### Full Wildcard (`*`)
```javascript
// Pattern: *

✅ Matches EVERYTHING:
- http://anydomain.com
- https://anydomain.com
- Any origin at all
```

---

## 🛡️ Security Best Practices

### ✅ DO:
1. **Use specific domains** when possible
2. **Use wildcard subdomains** only for your own domains
3. **Test CORS** before deploying to production
4. **Monitor logs** for blocked origins
5. **Use HTTPS** in production

### ❌ DON'T:
1. **Never use `*`** in production
2. **Avoid `https://*`** unless necessary
3. **Don't allow HTTP** in production
4. **Don't blindly allow** all subdomains of unknown domains

---

## 🧪 Testing CORS

### Test Allowed Origin
```bash
# Should succeed (200 OK)
curl -H "Origin: https://yourdomain.com" http://localhost:5000/api/health

# Expected: Success response
```

### Test Blocked Origin
```bash
# Should be blocked
curl -H "Origin: https://malicious-site.com" http://localhost:5000/api/health

# Expected: CORS error or error response
```

### Check Logs for Blocks
```bash
# View CORS blocks
docker-compose logs backend | grep "CORS blocked"

# Output example:
# CORS blocked origin { origin: 'https://malicious-site.com', allowedOrigins: [...] }
```

---

## 📊 Examples by Hosting Provider

### AWS / Azure / Google Cloud
```env
# Production domain with CDN
ALLOWED_ORIGINS=https://myapp.com,*.myapp.com,https://cdn.myapp.com
```

### Vercel / Netlify Frontend
```env
# Your custom domain + Vercel preview URLs
ALLOWED_ORIGINS=https://myapp.com,*.vercel.app
```

### Multiple Environments
```env
# Production + Staging
ALLOWED_ORIGINS=https://app.mysite.com,https://staging.mysite.com
```

### Microservices Architecture
```env
# Main app + API subdomain + Admin panel
ALLOWED_ORIGINS=https://myapp.com,https://api.myapp.com,https://admin.myapp.com
```

---

## 🔄 Changing CORS Configuration

### Update Origins:
1. Edit `.env` file:
   ```env
   ALLOWED_ORIGINS=https://newdomain.com
   ```

2. Restart backend:
   ```bash
   docker-compose restart backend
   ```

3. Verify:
   ```bash
   curl -H "Origin: https://newdomain.com" http://localhost:5000/health
   ```

### Add New Origin (No Downtime):
```bash
# Current
ALLOWED_ORIGINS=https://app.com

# Add new domain
ALLOWED_ORIGINS=https://app.com,https://new-app.com

# Restart
docker-compose restart backend
```

---

## 🚨 Troubleshooting

### Issue: "CORS blocked origin" in logs
**Cause**: Origin not in allowed list

**Solution**:
1. Check the blocked origin in logs
2. Add to `ALLOWED_ORIGINS` in `.env`
3. Restart backend

### Issue: Wildcard not working
**Cause**: Incorrect pattern syntax

**Examples**:
```env
❌ Wrong: *yourdomain.com
✅ Correct: *.yourdomain.com

❌ Wrong: yourdomain.*
✅ Correct: *.yourdomain.com

❌ Wrong: https://*.yourdomain.com
✅ Correct: *.yourdomain.com
```

### Issue: Root domain not allowed with wildcard
**Cause**: `*.yourdomain.com` doesn't match `yourdomain.com`

**Solution**: Add both:
```env
ALLOWED_ORIGINS=https://yourdomain.com,*.yourdomain.com
```

### Issue: Security warning in logs
**Cause**: Using wildcard patterns like `*` or `https://*`

**Solution**: Replace with specific domains or subdomain wildcards:
```env
# Instead of:
ALLOWED_ORIGINS=https://*

# Use:
ALLOWED_ORIGINS=*.yourdomain.com,*.staging.yourdomain.com
```

---

## 📝 Configuration Checklist

Before deploying to production:

- [ ] `ALLOWED_ORIGINS` is set (not empty)
- [ ] Only your domains are listed
- [ ] HTTPS protocol used (not HTTP)
- [ ] Wildcard patterns tested
- [ ] Root domain included if using `*.domain.com`
- [ ] No `*` or `https://*` patterns in production
- [ ] CORS tested with actual frontend URL
- [ ] Logs monitored for blocked origins

---

## 🎓 Understanding CORS

**Why CORS exists**: Browsers block requests from one domain to another for security. CORS lets you explicitly allow trusted domains.

**Same-origin**: If frontend and backend are on same domain (e.g., both on `yourdomain.com`), CORS is not needed for that case.

**Cross-origin**: If frontend is on `app.yourdomain.com` and backend is on `api.yourdomain.com`, CORS configuration is required.

---

**Current Implementation**: Pattern-based CORS with wildcard support  
**Security Level**: High (with proper configuration)  
**Flexibility**: High (supports various deployment scenarios)

---

*Last Updated: November 12, 2025*
