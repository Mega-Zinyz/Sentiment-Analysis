# Indonesian Sentiment Analysis Application

A full-stack sentiment analysis application for Indonesian text using Naive Bayes classifier with Docker deployment.

## Features

- 🔐 **User Authentication** - Secure JWT-based authentication
- 📊 **Sentiment Analysis** - Naive Bayes classifier for Indonesian text
- 📚 **Word Library Management** - Custom training data libraries
- 📈 **Analysis History** - Track and view past analyses
- 🐦 **Twitter/X Integration** - Collect and analyze tweets
- 📁 **Data Management** - Upload CSV, manual labeling, CRUD operations
- 🐳 **Docker Deployment** - Easy deployment with Docker Compose
- 📝 **Comprehensive Logging** - Winston logger for production debugging

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.12+ (for local development)

### Run with Docker (Recommended)

```bash
# Clone repository
git clone <your-repo-url>
cd sentimen_analisis

# Start all services
docker-compose up -d

# Access application
# Frontend: http://localhost
# Backend API: http://localhost:5000
```

### Default Login
- Username: `admin`
- Password: `admin123`

## Project Structure

```
sentimen_analisis/
├── docs/                      # 📚 All documentation
│   ├── deployment/           # Deployment guides
│   └── development/          # Development guides
├── Backend/                  # 🚀 Node.js API
│   ├── routes/              # API endpoints
│   ├── python/              # ML models
│   ├── scripts/             # Database & maintenance scripts
│   └── docs/                # API documentation
├── Frontend/                 # 🎨 Angular web app
└── docker-compose.yml        # 🐳 Docker configuration
```

## Documentation

### Getting Started
- [Docker Deployment Guide](docs/deployment/DOCKER_README.md)
- [Environment Configuration](docs/deployment/ENVIRONMENT_CONFIG_GUIDE.md)
- [Hosting Providers](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md)

### Development
- [Logging & Debugging](docs/development/LOGGING_GUIDE.md)
- [Production Debugging](docs/development/PRODUCTION_DEBUGGING.md)

### API Documentation
- [Raw Data Analysis API](Backend/docs/RAW_DATA_ANALYSIS_API.md)
- [Security Analysis](Backend/docs/SECURITY_ANALYSIS.md)

## Technology Stack

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: MySQL 8.0
- **ML**: Python 3.12 with scikit-learn, Sastrawi
- **Authentication**: JWT
- **Logging**: Winston

### Frontend
- **Framework**: Angular 18+
- **Language**: TypeScript
- **Server**: Nginx

### DevOps
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **CI/CD Ready**: GitHub Actions compatible

## Development

### Backend Development
```bash
cd Backend
npm install
cp .env.example .env
npm run dev
```

### Frontend Development
```bash
cd Frontend
npm install
npm start
```

## Configuration

### Environment Variables
See `.env.example` for all configuration options.

Key variables:
- `NODE_ENV` - production/development
- `DB_HOST` - MySQL host
- `JWT_SECRET` - Authentication secret
- `LOG_LEVEL` - Logging verbosity

### Production Deployment
See [Hosting Deployment Guide](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md) for provider-specific instructions.

## Performance

- ⚡ **6 Worker Pool** - Parallel sentiment analysis
- 📦 **Batch Processing** - 300 tweets per batch
- ⏱️ **~20-25 minutes** for 23,000 tweets
- 🔄 **Auto-scaling Ready** - Kubernetes compatible

## Security Features

- 🔐 JWT authentication with refresh tokens
- 🛡️ Rate limiting on API endpoints
- 🔒 Password hashing with bcrypt
- 🔑 Data encryption for sensitive fields
- 📝 Audit logging for security events
- 🚫 CORS protection
- 🔍 SQL injection prevention

## License

This project is part of academic research. See LICENSE file for details.

## Support

For issues and questions:
1. Check documentation in `docs/`
2. Review logs: `docker logs sentiment-backend`
3. See troubleshooting guides in documentation

## Contributors

- [Your Name] - Initial work

---

Made with ❤️ for Indonesian NLP research
