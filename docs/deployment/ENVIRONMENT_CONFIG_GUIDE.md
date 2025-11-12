# Environment Configuration Guide

## Overview

The application uses environment-specific configurations for development and production deployments.

## File Structure

```
Frontend/src/environments/
├── environment.ts       # Development configuration
└── environment.prod.ts  # Production configuration
```

Angular automatically uses the correct file based on build configuration:
- `ng serve` → uses `environment.ts`
- `ng build --configuration production` → uses `environment.prod.ts`

## Configuration Properties

### Development (environment.ts)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',  // Direct backend URL
  
  enableLogging: true,
  logLevel: 'debug',       // Show all logs
  enableAnalytics: false,
  
  apiTimeout: 300000,      // 5 minutes
  maxRetries: 3,
  
  showDebugInfo: true,     // Show debug panels
  enableDevTools: true
};
```

### Production (environment.prod.ts)

```typescript
export const environment = {
  production: true,
  apiUrl: '/api',          // Relative path (nginx proxy)
  
  enableLogging: true,
  logLevel: 'error',       // Only errors
  enableAnalytics: false,
  
  apiTimeout: 300000,
  maxRetries: 3,
  
  showDebugInfo: false,    // Hide debug info
  enableDevTools: false
};
```

## Deployment Scenarios

### 1. Docker Compose (Recommended)

**Current Setup:**
- Frontend: nginx on port 80
- Backend: Node.js on port 5000
- Nginx proxies `/api/*` to `backend:5000/api/*`

**Configuration:**
```typescript
// environment.prod.ts
apiUrl: '/api'  // ✅ Correct - nginx handles routing
```

**How it works:**
1. Browser requests: `http://your-domain.com/api/sentiment/analyze`
2. Nginx receives request at port 80
3. Nginx proxies to: `http://backend:5000/api/sentiment/analyze`
4. Backend responds through nginx

### 2. Separate Servers

**Scenario:** Frontend and backend on different servers/domains

**Frontend Server:** `https://app.yourdomain.com`  
**Backend Server:** `https://api.yourdomain.com`

**Configuration:**
```typescript
// environment.prod.ts
apiUrl: 'https://api.yourdomain.com/api'
```

**CORS Configuration Required on Backend:**
```javascript
// Backend/index.js
const corsOptions = {
  origin: ['https://app.yourdomain.com'],
  credentials: true
};
```

### 3. Custom Domain with Environment Variables

**Use runtime configuration:**

```typescript
// environment.prod.ts
apiUrl: (typeof window !== 'undefined' && (window as any).API_URL) || '/api'
```

**Set in index.html before Angular loads:**
```html
<!-- Frontend/src/index.html -->
<script>
  window.API_URL = 'https://api.yourdomain.com/api';
</script>
```

### 4. Cloud Deployment (AWS, Azure, GCP)

**Option A: Same Domain with API Gateway/Load Balancer**
```typescript
apiUrl: '/api'  // Load balancer routes /api to backend
```

**Option B: Different Domains**
```typescript
apiUrl: 'https://backend.yourdomain.com/api'
```

## Backend Environment Configuration

### Development (.env)
```properties
NODE_ENV=development
PORT=5000
DB_HOST=localhost
LOG_LEVEL=debug

# Frontend URL for CORS
FRONTEND_URL=http://localhost:4200
```

### Production (.env.production)
```properties
NODE_ENV=production
PORT=5000
DB_HOST=sentiment-mysql  # Docker service name
LOG_LEVEL=info

# Frontend URL for CORS
FRONTEND_URL=https://yourdomain.com
```

## Docker Compose Configuration

### Development
```yaml
# docker-compose.dev.yml
services:
  backend:
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    ports:
      - "5000:5000"  # Expose for direct access
  
  frontend:
    # Serve with ng serve for hot reload
    command: npm start
    ports:
      - "4200:4200"
```

### Production
```yaml
# docker-compose.yml
services:
  backend:
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    # No port exposure needed (accessed via nginx)
  
  frontend:
    # Nginx serves built Angular app
    ports:
      - "80:80"
      - "443:443"  # If using SSL
```

## Nginx Configuration

### Current Setup (Frontend/nginx.conf)

```nginx
server {
    listen 80;
    
    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Long timeouts for sentiment analysis
        proxy_read_timeout 600s;
    }
    
    # Serve Angular app
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### SSL/HTTPS Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    
    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Building for Production

### 1. Build Frontend
```bash
cd Frontend
npm run build -- --configuration production
```

Output: `Frontend/dist/browser/`

### 2. Build Docker Images
```bash
docker-compose build
```

### 3. Start Production
```bash
docker-compose up -d
```

## Environment-Specific Features

### Using Environment in Components

```typescript
import { environment } from '../environments/environment';

export class MyComponent {
  constructor() {
    if (environment.showDebugInfo) {
      console.log('Debug mode enabled');
    }
    
    if (!environment.production) {
      // Development-only code
    }
  }
}
```

### Conditional Templates

```html
<!-- Show debug info only in development -->
<div *ngIf="!environment.production" class="debug-panel">
  Debug Info Here
</div>
```

```typescript
export class MyComponent {
  environment = environment;  // Expose to template
}
```

## Common Issues & Solutions

### Issue: API calls fail with CORS errors

**Solution:** Update backend CORS configuration
```javascript
const corsOptions = {
  origin: [environment.FRONTEND_URL],
  credentials: true
};
```

### Issue: API URL not working after deployment

**Check:**
1. Nginx proxy configuration
2. Backend is accessible from nginx container
3. Firewall rules allow traffic

**Debug:**
```bash
# Test from nginx container
docker exec sentiment-frontend curl http://backend:5000/api/health

# Check nginx logs
docker logs sentiment-frontend

# Check backend logs
docker logs sentiment-backend
```

### Issue: Angular serves wrong environment

**Solution:** Check build command
```bash
# Development
ng build

# Production
ng build --configuration production
```

### Issue: Environment variables not updating

**Solution:** Rebuild containers
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Security Best Practices

1. **Never commit sensitive data** to environment files
2. **Use environment variables** for secrets
3. **Enable HTTPS** in production
4. **Set secure headers** in nginx
5. **Limit CORS origins** to your domain only
6. **Use strong JWT secrets**
7. **Enable rate limiting**

## Verification Checklist

- [ ] `environment.prod.ts` has `production: true`
- [ ] `apiUrl` is correct for deployment scenario
- [ ] Backend CORS allows frontend domain
- [ ] Nginx proxy configuration is correct
- [ ] SSL certificates installed (if using HTTPS)
- [ ] Environment variables set in docker-compose.yml
- [ ] Debug panels hidden in production
- [ ] Console logs suppressed in production
- [ ] Build command uses `--configuration production`
- [ ] Test API calls work after deployment

## Testing

### Test Production Build Locally

```bash
# Build production
npm run build -- --configuration production

# Serve with http-server
npx http-server dist/browser -p 8080 -c-1

# Test at http://localhost:8080
```

### Test API Connection

```typescript
// Add health check endpoint
this.http.get(environment.apiUrl + '/health').subscribe(
  response => console.log('API connected:', response),
  error => console.error('API connection failed:', error)
);
```

## Next Steps

After configuring environments:

1. Test locally with production build
2. Update docker-compose.yml with production environment variables
3. Configure domain and SSL certificates
4. Set up monitoring and logging
5. Configure backups
6. Set up CI/CD pipeline (optional)
