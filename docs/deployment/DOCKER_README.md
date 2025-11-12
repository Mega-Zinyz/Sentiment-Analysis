# Sentiment Analysis Application - Docker Setup

## Quick Start

### Prerequisites
- Docker Desktop installed
- Docker Compose installed

### Setup Steps

1. **Create environment file**
   ```bash
   copy .env.example .env
   ```
   Then edit `.env` file with your configuration.

2. **Build and start all services**
   ```bash
   docker-compose up -d
   ```

3. **Check service status**
   ```bash
   docker-compose ps
   ```

4. **View logs**
   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f backend
   docker-compose logs -f frontend
   docker-compose logs -f mysql
   ```

5. **Access the application**
   - Frontend: http://localhost
   - Backend API: http://localhost:5000

### Useful Commands

**Stop all services:**
```bash
docker-compose down
```

**Stop and remove volumes (WARNING: deletes database):**
```bash
docker-compose down -v
```

**Rebuild services after code changes:**
```bash
docker-compose up -d --build
```

**Enter a container shell:**
```bash
docker-compose exec backend sh
docker-compose exec frontend sh
docker-compose exec mysql bash
```

**Database access:**
```bash
docker-compose exec mysql mysql -u sentiment_user -p sentiment_analysis
```

### Troubleshooting

**Backend won't start:**
- Check logs: `docker-compose logs backend`
- Verify MySQL is healthy: `docker-compose ps`
- Check environment variables in `.env`

**Frontend shows connection error:**
- Verify backend is running: `docker-compose ps`
- Check API URL in frontend environment

**Database connection failed:**
- Wait for MySQL to be ready (healthcheck)
- Verify credentials in `.env`

### Production Deployment

For production, update:
1. Change all passwords in `.env`
2. Use proper JWT secret
3. Consider using reverse proxy (nginx/traefik)
4. Enable SSL/TLS certificates
5. Set up proper backup for MySQL volume

### Architecture

```
┌─────────────┐
│   Frontend  │ :80
│   (Nginx)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │ :5000
│  (Node.js)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    MySQL    │ :3306
│  (Database) │
└─────────────┘
```
