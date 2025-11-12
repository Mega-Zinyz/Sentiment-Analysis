# Hosting Provider Deployment Guide

## How Docker Works on Hosting Providers

When you deploy Docker containers on hosting providers, they handle networking, domains, and SSL differently than localhost. Here's how it works:

## Common Hosting Provider Scenarios

### 1. **Container-as-a-Service (AWS ECS, Azure Container Instances, Google Cloud Run)**

**How it works:**
- Provider runs your Docker images
- Assigns public URLs/IPs
- Handles load balancing
- Manages SSL certificates

**Example: AWS ECS**
```
Your Domain: https://sentiment-app.com
Provider gives you:
- Backend: internal-backend.ecs.amazonaws.com:5000 (internal)
- Frontend: sentiment-app.com (public)
```

**Configuration needed:**

1. **docker-compose.yml** (or provider's config):
```yaml
services:
  backend:
    image: your-registry/sentiment-backend:latest
    environment:
      - NODE_ENV=production
      - FRONTEND_URL=https://sentiment-app.com
    # No port exposure to public

  frontend:
    image: your-registry/sentiment-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - backend
```

2. **environment.prod.ts**:
```typescript
apiUrl: '/api'  // ✅ Keep relative, nginx handles routing
```

3. **Nginx stays the same**:
```nginx
location /api/ {
    proxy_pass http://backend:5000/api/;
    # Works because containers are in same network
}
```

**Why it works:**
- Containers can communicate via service names
- Frontend container proxies API requests
- Only frontend exposed to internet
- Backend stays internal and secure

---

### 2. **Platform-as-a-Service (Heroku, Railway, Render, Fly.io)**

**How it works:**
- Deploy frontend and backend separately
- Each gets its own URL
- Provider handles SSL automatically

**Example: Railway**
```
Frontend: https://sentiment-app.railway.app
Backend:  https://sentiment-api.railway.app
```

**Configuration needed:**

**environment.prod.ts**:
```typescript
export const environment = {
  production: true,
  // ❌ Can't use '/api' - different domains
  apiUrl: 'https://sentiment-api.railway.app/api'
};
```

**Backend CORS** (Backend/index.js):
```javascript
const corsOptions = {
  origin: [
    'https://sentiment-app.railway.app',  // Frontend URL
    process.env.FRONTEND_URL
  ],
  credentials: true
};
```

**Backend/index.js** - Update port:
```javascript
const port = process.env.PORT || 5000;  // ✅ Provider sets PORT
```

---

### 3. **Virtual Private Server (DigitalOcean, Linode, Vultr)**

**How it works:**
- You get a VM with public IP
- Install Docker yourself
- Point your domain to IP
- Set up SSL (Let's Encrypt)

**Example: DigitalOcean Droplet**
```
Server IP: 142.93.123.45
Your domain: sentiment-app.com
```

**Setup Steps:**

1. **Point domain to IP** (DNS):
```
A Record: sentiment-app.com → 142.93.123.45
A Record: www.sentiment-app.com → 142.93.123.45
```

2. **docker-compose.yml**:
```yaml
services:
  mysql:
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

  backend:
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql

  frontend:
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx-ssl.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

3. **SSL with Let's Encrypt**:
```bash
# On server
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d sentiment-app.com -d www.sentiment-app.com
```

4. **nginx-ssl.conf**:
```nginx
server {
    listen 80;
    server_name sentiment-app.com www.sentiment-app.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sentiment-app.com www.sentiment-app.com;
    
    ssl_certificate /etc/letsencrypt/live/sentiment-app.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sentiment-app.com/privkey.pem;
    
    location /api/ {
        proxy_pass http://backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
    
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

5. **environment.prod.ts**:
```typescript
apiUrl: '/api'  // ✅ Same domain, nginx proxies
```

---

### 4. **Kubernetes (AWS EKS, Google GKE, Azure AKS)**

**How it works:**
- Containers orchestrated across multiple nodes
- Internal networking between services
- Ingress controller handles external traffic

**Example Configuration:**

**deployment.yaml**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  type: ClusterIP  # Internal only
  ports:
    - port: 5000
  selector:
    app: sentiment-backend
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  type: LoadBalancer  # External access
  ports:
    - port: 80
  selector:
    app: sentiment-frontend
```

**ingress.yaml**:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sentiment-ingress
spec:
  rules:
  - host: sentiment-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

**Configuration:**
```typescript
// environment.prod.ts
apiUrl: '/api'  // ✅ Ingress routes to backend
```

---

## Comparison Table

| Provider Type | Frontend URL | Backend URL | apiUrl Config | SSL |
|--------------|-------------|-------------|---------------|-----|
| **Docker Compose (VPS)** | your-domain.com | internal | `/api` | Manual (Let's Encrypt) |
| **AWS ECS** | your-domain.com | internal | `/api` | AWS Certificate Manager |
| **Heroku/Railway** | app-123.provider.com | api-456.provider.com | `https://api-456.provider.com/api` | Automatic |
| **Azure App Service** | your-domain.com | internal | `/api` | Azure Managed |
| **Google Cloud Run** | cloud-run-url | cloud-run-api-url | Full URL or `/api` | Automatic |
| **DigitalOcean App Platform** | app.ondigitalocean.com | api.ondigitalocean.com | Full API URL | Automatic |
| **Kubernetes** | your-domain.com | internal | `/api` | cert-manager |

---

## Configuration Decision Tree

```
Are frontend and backend on same domain?
│
├─ YES (sentiment-app.com/api)
│  └─ Use: apiUrl: '/api'
│     ├─ Docker Compose on VPS ✓
│     ├─ Kubernetes with Ingress ✓
│     └─ AWS ECS with ALB ✓
│
└─ NO (different domains)
   └─ Use: apiUrl: 'https://api.domain.com/api'
      ├─ Heroku (separate apps) ✓
      ├─ Railway (separate services) ✓
      └─ Render (separate web services) ✓
```

---

## Provider-Specific Examples

### AWS Elastic Container Service (ECS)

**Architecture:**
```
Internet
    ↓
Application Load Balancer (ALB)
    ↓
┌────────────────────────┐
│  Target Group 1: /     │ → Frontend Container (port 80)
│  Target Group 2: /api/ │ → Backend Container (port 5000)
└────────────────────────┘
```

**Setup:**
1. Create ECS Cluster
2. Create Task Definitions (frontend, backend, mysql)
3. Create ALB with routing rules
4. Point domain to ALB
5. Add SSL certificate to ALB

**Configuration:**
```typescript
apiUrl: '/api'  // ALB routes /api/* to backend
```

---

### Google Cloud Run

**Architecture:**
```
Cloud Load Balancer
    ↓
┌──────────────────────┐
│ Path: /api/* → Backend Cloud Run Service
│ Path: /* → Frontend Cloud Run Service
└──────────────────────┘
```

**Setup:**
```bash
# Deploy backend
gcloud run deploy sentiment-backend \
  --image gcr.io/your-project/backend \
  --platform managed \
  --no-allow-unauthenticated

# Deploy frontend
gcloud run deploy sentiment-frontend \
  --image gcr.io/your-project/frontend \
  --platform managed \
  --allow-unauthenticated

# Set up load balancer with custom domain
```

**Configuration:**
```typescript
// Option 1: Load balancer routes
apiUrl: '/api'

// Option 2: Direct backend URL
apiUrl: 'https://sentiment-backend-xyz.run.app/api'
```

---

### DigitalOcean App Platform

**Architecture:**
```
App Platform (apps.digitalocean.com)
    ↓
┌──────────────────────────┐
│ sentiment-app (Frontend) │ → https://sentiment-app-123.ondigitalocean.app
│ sentiment-api (Backend)  │ → https://sentiment-api-456.ondigitalocean.app
└──────────────────────────┘
```

**app.yaml**:
```yaml
name: sentiment-analysis
services:
  - name: frontend
    dockerfile_path: Frontend/Dockerfile
    http_port: 80
    routes:
      - path: /
    envs:
      - key: API_URL
        value: https://sentiment-api-456.ondigitalocean.app/api

  - name: backend
    dockerfile_path: Backend/Dockerfile
    http_port: 5000
    routes:
      - path: /api
    envs:
      - key: NODE_ENV
        value: production
      - key: FRONTEND_URL
        value: https://sentiment-app-123.ondigitalocean.app

databases:
  - name: sentiment-db
    engine: MYSQL
    version: "8"
```

**Configuration:**
```typescript
apiUrl: 'https://sentiment-api-456.ondigitalocean.app/api'
```

---

## Environment Variables for Each Provider

### For Same-Domain Setup (Nginx Proxy)
```bash
# .env.production
NODE_ENV=production
PORT=5000
DB_HOST=mysql
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
```

### For Separate-Domain Setup
```bash
# Backend .env
NODE_ENV=production
PORT=5000  # Or provider-assigned port
DB_HOST=your-db-host
FRONTEND_URL=https://frontend-app.provider.com
CORS_ORIGIN=https://frontend-app.provider.com

# Frontend environment
API_URL=https://backend-app.provider.com/api
```

---

## Database Considerations

### Managed Database (Recommended for Production)
```yaml
# Use provider's managed MySQL
backend:
  environment:
    - DB_HOST=mysql-cluster.provider.com
    - DB_PORT=3306
    - DB_USER=sentiment_user
    - DB_PASSWORD=${DB_PASSWORD}
    - DB_NAME=sentiment_analysis
    - DB_SSL=true
```

### Container Database (Development/Small Scale)
```yaml
mysql:
  image: mysql:8.0
  volumes:
    - mysql_data:/var/lib/mysql
  environment:
    - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
```

---

## SSL Certificate Options

| Method | Provider | Auto-Renew | Cost | Complexity |
|--------|----------|------------|------|------------|
| Let's Encrypt | Self-hosted | Yes (cron) | Free | Medium |
| AWS Certificate Manager | AWS | Yes | Free | Low |
| Azure App Service | Azure | Yes | Free | Low |
| Google Managed | Google Cloud | Yes | Free | Low |
| Cloudflare | Any | Yes | Free | Low |

---

## Deployment Checklist by Provider

### VPS (DigitalOcean, Linode, Vultr)
- [ ] Point domain DNS to server IP
- [ ] Install Docker and Docker Compose
- [ ] Clone repository
- [ ] Set up .env.production
- [ ] Run docker-compose up -d
- [ ] Install SSL with certbot
- [ ] Set up automatic backups
- [ ] Configure firewall (ufw)

### PaaS (Heroku, Railway, Render)
- [ ] Connect GitHub repository
- [ ] Set environment variables in dashboard
- [ ] Update environment.prod.ts with backend URL
- [ ] Configure CORS for frontend domain
- [ ] Add managed database
- [ ] Deploy both services

### Container Service (AWS ECS, Google Cloud Run)
- [ ] Build and push Docker images to registry
- [ ] Create task definitions/services
- [ ] Set up load balancer/ingress
- [ ] Configure environment variables
- [ ] Point domain to load balancer
- [ ] Add SSL certificate
- [ ] Set up auto-scaling

---

## Common Issues & Solutions

### Issue: CORS errors after deployment
**Cause:** Backend not allowing frontend domain
**Solution:**
```javascript
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'https://yourdomain.com'
  ],
  credentials: true
};
```

### Issue: 502 Bad Gateway
**Cause:** Backend container not responding
**Debug:**
```bash
docker logs sentiment-backend
# Check if backend started properly
```

### Issue: Database connection fails
**Cause:** Wrong DB_HOST in production
**Solution:** Use provider's database hostname
```bash
DB_HOST=mysql-abc123.provider.com  # Not 'localhost'
```

### Issue: API calls fail with 404
**Cause:** Nginx not proxying correctly
**Solution:** Check nginx logs
```bash
docker logs sentiment-frontend
# Verify proxy_pass URL
```

---

## Cost Comparison (Monthly)

| Provider | Specs | Estimated Cost | SSL | Backup |
|----------|-------|---------------|-----|--------|
| **DigitalOcean Droplet** | 2GB RAM, 1 CPU | $12 | Free | $2 |
| **AWS ECS** | Fargate, 1GB RAM | $15-30 | Free | Included |
| **Heroku** | Standard dynos | $50+ | Free | Extra |
| **Railway** | 8GB RAM, Shared | $20 | Free | Included |
| **Google Cloud Run** | Pay per use | $10-40 | Free | Extra |
| **Azure Container Instances** | 1 vCPU, 1.5GB | $35 | Free | Included |

---

## Recommended Setup for Production

**Best for Beginners:**
- **DigitalOcean App Platform** or **Railway**
- Automatic SSL
- Simple deployment
- Managed database option

**Best for Scale:**
- **AWS ECS** or **Google Kubernetes Engine**
- Auto-scaling
- Load balancing
- Enterprise features

**Best for Budget:**
- **DigitalOcean Droplet** with Docker Compose
- Full control
- One-time setup
- Cheapest option

---

## Quick Start Commands

### Deploy to VPS
```bash
# On local machine
git push origin main

# On server
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### Deploy to Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Deploy to AWS ECS (via CLI)
```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin
docker-compose build
docker tag sentiment-backend:latest your-ecr/backend:latest
docker push your-ecr/backend:latest

# Update ECS service
aws ecs update-service --cluster sentiment --service backend --force-new-deployment
```

---

Your application is **provider-agnostic** because it uses Docker! 🎉
