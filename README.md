# Sentiment Analysis System# Indonesian Sentiment Analysis Application



A comprehensive sentiment analysis application for Indonesian text using Naive Bayes classification. Built with Angular, Node.js, MySQL, and Python.A full-stack sentiment analysis application for Indonesian text using Naive Bayes classifier with Docker deployment.



## 🚀 Features## Features



- **Manual Sentiment Analysis** - Upload CSV files and analyze with custom word libraries- 🔐 **User Authentication** - Secure JWT-based authentication

- **X/Twitter API Integration** - Collect tweets directly and analyze in real-time- 📊 **Sentiment Analysis** - Naive Bayes classifier for Indonesian text

- **Custom Word Libraries** - Create and manage positive/negative word dictionaries- 📚 **Word Library Management** - Custom training data libraries

- **Batch Processing** - High-performance analysis with 6 parallel workers- 📈 **Analysis History** - Track and view past analyses

- **Analysis History** - Track all analyses with detailed insights- 🐦 **Twitter/X Integration** - Collect and analyze tweets

- **User Management** - Authentication with JWT and role-based access- 📁 **Data Management** - Upload CSV, manual labeling, CRUD operations

- **Production Logging** - Winston-based logging with automatic rotation- 🐳 **Docker Deployment** - Easy deployment with Docker Compose

- **Docker Deployment** - Fully containerized with docker-compose- 📝 **Comprehensive Logging** - Winston logger for production debugging



## 📊 Performance## Quick Start



- **Speed**: ~20-25 minutes for 23,000 tweets### Prerequisites

- **Workers**: 6 parallel processing workers- Docker & Docker Compose

- **Batch Size**: 300 tweets per batch- Node.js 20+ (for local development)

- **Algorithm**: Naive Bayes with Sastrawi Indonesian text processing- Python 3.12+ (for local development)



## 🛠️ Tech Stack### Run with Docker (Recommended)



### Frontend```bash

- Angular 18+# Clone repository

- TypeScriptgit clone <your-repo-url>

- Nginx (production)cd sentimen_analisis

- Bootstrap UI

# Start all services

### Backenddocker-compose up -d

- Node.js 20

- Express.js# Access application

- MySQL 8.0# Frontend: http://localhost

- Python 3.12 with scikit-learn# Backend API: http://localhost:5000

- JWT Authentication```

- Winston Logging

### Default Login

### Machine Learning- Username: `admin`

- Naive Bayes Classifier- Password: `admin123`

- Sastrawi (Indonesian stemmer)

- scikit-learn## Project Structure

- spaCy

```

## 📋 Prerequisitessentimen_analisis/

├── docs/                      # 📚 All documentation

- Docker Desktop│   ├── deployment/           # Deployment guides

- Docker Compose│   └── development/          # Development guides

- Node.js 20+ (for development)├── Backend/                  # 🚀 Node.js API

- 4GB+ RAM recommended│   ├── routes/              # API endpoints

│   ├── python/              # ML models

## 🚀 Quick Start│   ├── scripts/             # Database & maintenance scripts

│   └── docs/                # API documentation

### 1. Clone Repository├── Frontend/                 # 🎨 Angular web app

```bash└── docker-compose.yml        # 🐳 Docker configuration

git clone https://github.com/Mega-Zinyz/Sentiment-Analysis.git```

cd Sentiment-Analysis

```## Documentation



### 2. Configure Environment### Getting Started

```bash- [Docker Deployment Guide](docs/deployment/DOCKER_README.md)

# Copy environment template- [Environment Configuration](docs/deployment/ENVIRONMENT_CONFIG_GUIDE.md)

cp .env.example .env- [Hosting Providers](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md)



# Edit .env with your configuration### Development

# IMPORTANT: Change JWT_SECRET and ENCRYPTION_KEY for production!- [Logging & Debugging](docs/development/LOGGING_GUIDE.md)

```- [Production Debugging](docs/development/PRODUCTION_DEBUGGING.md)



### 3. Generate Production Secrets (Required for Production)### API Documentation

```bash- [Raw Data Analysis API](Backend/docs/RAW_DATA_ANALYSIS_API.md)

# Generate JWT_SECRET- [Security Analysis](Backend/docs/SECURITY_ANALYSIS.md)

node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

## Technology Stack

# Generate ENCRYPTION_KEY

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"### Backend

- **Runtime**: Node.js 20

# Update these values in .env file- **Framework**: Express.js

```- **Database**: MySQL 8.0

- **ML**: Python 3.12 with scikit-learn, Sastrawi

### 4. Start Services- **Authentication**: JWT

```bash- **Logging**: Winston

# Start all services

docker-compose up -d### Frontend

- **Framework**: Angular 18+

# Check status- **Language**: TypeScript

docker-compose ps- **Server**: Nginx



# View logs### DevOps

docker-compose logs -f backend- **Containerization**: Docker

```- **Orchestration**: Docker Compose

- **CI/CD Ready**: GitHub Actions compatible

### 5. Access Application

- **Frontend**: http://localhost## Development

- **Backend API**: http://localhost:5000

- **Health Check**: http://localhost:5000/health### Backend Development

```bash

### 6. First Time Setupcd Backend

1. Register a new account at http://localhost/registernpm install

2. Login at http://localhost/logincp .env.example .env

3. Create a word library (positive/negative words)npm run dev

4. Start analyzing!```



## 📁 Project Structure### Frontend Development

```bash

```cd Frontend

Sentiment-Analysis/npm install

├── Frontend/                 # Angular frontendnpm start

│   ├── src/```

│   │   ├── app/

│   │   │   ├── admin/       # Admin panel## Configuration

│   │   │   ├── login/       # Authentication

│   │   │   ├── tweet-collection/  # X API integration### Environment Variables

│   │   │   ├── raw-data-analysis/ # Manual CSV uploadSee `.env.example` for all configuration options.

│   │   │   └── analysis-history/  # Results tracking

│   │   └── environments/    # Environment configsKey variables:

│   ├── Dockerfile- `NODE_ENV` - production/development

│   └── nginx.conf- `DB_HOST` - MySQL host

│- `JWT_SECRET` - Authentication secret

├── Backend/                  # Node.js + Python backend- `LOG_LEVEL` - Logging verbosity

│   ├── routes/              # API endpoints

│   ├── middleware/          # Auth, rate limiting### Production Deployment

│   ├── utils/               # Helpers, loggingSee [Hosting Deployment Guide](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md) for provider-specific instructions.

│   ├── python/              # ML processing

│   ├── scripts/             # Database utilities## Performance

│   │   ├── setup/          # Initial setup

│   │   ├── migration/      # Database migrations- ⚡ **6 Worker Pool** - Parallel sentiment analysis

│   │   ├── maintenance/    # Maintenance tasks- 📦 **Batch Processing** - 300 tweets per batch

│   │   └── testing/        # Test scripts- ⏱️ **~20-25 minutes** for 23,000 tweets

│   ├── config/             # Database config- 🔄 **Auto-scaling Ready** - Kubernetes compatible

│   ├── docs/               # API documentation

│   ├── Dockerfile## Security Features

│   └── .env

│- 🔐 JWT authentication with refresh tokens

├── docs/                    # Documentation- 🛡️ Rate limiting on API endpoints

│   ├── deployment/         # Deployment guides- 🔒 Password hashing with bcrypt

│   │   ├── PRODUCTION_SECURITY.md- 🔑 Data encryption for sensitive fields

│   │   ├── CORS_CONFIGURATION.md- 📝 Audit logging for security events

│   │   ├── HOSTING_DEPLOYMENT_GUIDE.md- 🚫 CORS protection

│   │   └── ENVIRONMENT_CONFIG_GUIDE.md- 🔍 SQL injection prevention

│   └── development/        # Development guides

│       └── LOGGING_GUIDE.md## License

│

├── docker-compose.yml      # Docker orchestrationThis project is part of academic research. See LICENSE file for details.

├── .env                    # Environment config (gitignored)

├── .env.example           # Environment template## Support

├── .gitignore

├── PRODUCTION_CHECKLIST.mdFor issues and questions:

├── PRODUCTION_READY.md1. Check documentation in `docs/`

└── README.md2. Review logs: `docker logs sentiment-backend`

```3. See troubleshooting guides in documentation



## 🔧 Configuration## Contributors



### Environment Variables- [Your Name] - Initial work



Key variables in `.env`:---



```envMade with ❤️ for Indonesian NLP research

# Environment
NODE_ENV=development          # Set to 'production' for deployment

# Database
DB_NAME=sentiment_analysis
DB_USER=sentiment_user
DB_PASSWORD=your-password     # Change in production

# Security (CRITICAL: Change these!)
JWT_SECRET=your-jwt-secret    # Generate with crypto
ENCRYPTION_KEY=your-key       # Generate with crypto

# CORS
ALLOWED_ORIGINS=              # Empty = localhost (dev)
                             # Production: https://yourdomain.com
                             # Wildcard: *.yourdomain.com

# Logging
LOG_LEVEL=debug              # Options: error, warn, info, debug
```

### CORS Configuration

Supports flexible pattern matching:

```env
# Specific domains
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Wildcard subdomain (recommended)
ALLOWED_ORIGINS=*.yourdomain.com

# Multiple wildcards
ALLOWED_ORIGINS=*.production.com,*.staging.com
```

See [CORS Configuration Guide](docs/deployment/CORS_CONFIGURATION.md) for details.

## 📖 Usage

### Manual CSV Analysis

1. **Prepare CSV file** with columns: `timestamp`, `username`, `message`
2. Go to **Raw Data Analysis**
3. Select word library or create new one
4. Upload CSV file
5. View results and insights

### X/Twitter API Collection

1. Configure API credentials in Backend `.env`
2. Go to **Tweet Collection**
3. Enter search query and parameters
4. Select word library
5. Collect and analyze tweets

### Word Library Management

1. Go to **Admin** → **Word Libraries**
2. Create new library
3. Add positive words
4. Add negative words
5. Use in analyses

## 🔐 Security Features

- ✅ JWT Authentication
- ✅ Password hashing (bcrypt)
- ✅ AES-256-GCM encryption for sensitive data
- ✅ SQL injection protection (parameterized queries)
- ✅ Rate limiting on auth endpoints
- ✅ CORS with pattern matching
- ✅ Sanitized error messages in production
- ✅ Audit logging
- ✅ Session management
- ✅ Environment variable protection (.gitignore)

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Analysis
- `POST /api/raw-data/upload` - Upload CSV for analysis
- `POST /api/sentiment-analysis/analyze` - Start analysis
- `GET /api/sentiment-analysis/progress/:sessionId` - Check progress
- `GET /api/analysis-results/session/:sessionId` - Get results

### Word Libraries
- `GET /api/word-libraries` - List libraries
- `POST /api/word-libraries` - Create library
- `POST /api/word-libraries/:id/words` - Add words

### History
- `GET /api/analysis-history` - User's analysis history
- `GET /api/analysis-insights/:sessionId` - Detailed insights

See [API Documentation](Backend/views/index.html) for complete reference.

## 🚀 Deployment

### Development
```bash
docker-compose up -d
```

### Production

1. **Update configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Generate secrets**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Set production mode**:
   ```env
   NODE_ENV=production
   ALLOWED_ORIGINS=https://yourdomain.com
   LOG_LEVEL=info
   ```

4. **Deploy**:
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

5. **Verify**:
   ```bash
   curl http://localhost:5000/health
   ```

See [Production Checklist](PRODUCTION_CHECKLIST.md) for complete deployment guide.

### Hosting Providers

Compatible with:
- AWS (ECS, EC2, Lightsail)
- Google Cloud (Cloud Run, GKE, Compute Engine)
- Azure (Container Apps, AKS, VMs)
- DigitalOcean (App Platform, Droplets)
- Railway, Render, Heroku
- Any VPS with Docker support

See [Hosting Deployment Guide](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md) for provider-specific instructions.

## 🔍 Monitoring

### View Logs
```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Inside container (production logs)
docker exec sentiment-backend ls -la /app/logs/
docker exec sentiment-backend tail -f /app/logs/combined-*.log
```

### Health Check
```bash
curl http://localhost:5000/health
```

### Container Status
```bash
docker-compose ps
docker stats sentiment-backend sentiment-frontend sentiment-mysql
```

## 🛠️ Development

### Prerequisites
- Node.js 20+
- Python 3.12+
- MySQL 8.0

### Backend Development
```bash
cd Backend
npm install
pip install -r requirements.txt

# Configure database in .env
cp .env.example .env

# Run development server
npm run dev
```

### Frontend Development
```bash
cd Frontend
npm install

# Run dev server
ng serve

# Access at http://localhost:4200
```

### Database Setup
```bash
# Setup database
node Backend/scripts/setup/setup-database.js

# Run migrations
node Backend/scripts/migration/migrate-database.js
```

## 🧪 Testing

### Test Sentiment Analysis
```bash
# Inside Backend/
node scripts/testing/test_raw_data_analysis.js
```

### Test API
```bash
# Health check
curl http://localhost:5000/health

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123","fullName":"Test User"}'
```

## 📈 Performance Tuning

Current configuration (optimized):
- **Workers**: 6 parallel
- **Batch Size**: 300 tweets
- **Timeout**: 240 seconds

To adjust performance in `Backend/routes/sentimentAnalysis.js`:
```javascript
const NUM_WORKERS = 6;      // More workers = faster (uses more CPU)
const BATCH_SIZE = 300;     // Larger batches = faster (uses more memory)
const WORKER_TIMEOUT = 240; // Seconds before timeout
```

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose logs backend

# Common fixes:
# 1. Database not ready - wait for mysql healthy status
# 2. Port conflict - check if port 5000 is in use
# 3. Environment variables - verify .env file exists
```

### CORS errors
```bash
# Check allowed origins
cat .env | grep ALLOWED_ORIGINS

# View blocked origins
docker-compose logs backend | grep "CORS blocked"

# Fix: Add your domain to ALLOWED_ORIGINS
```

### Database connection failed
```bash
# Check MySQL status
docker-compose ps mysql

# Reset database (WARNING: deletes data)
docker-compose down -v
docker-compose up -d
```

### Frontend not loading
```bash
# Check if backend is running
curl http://localhost:5000/health

# Check nginx logs
docker-compose logs frontend
```

## 📚 Documentation

- [Production Checklist](PRODUCTION_CHECKLIST.md) - Pre-deployment checklist
- [Production Security](docs/deployment/PRODUCTION_SECURITY.md) - Security configuration
- [CORS Configuration](docs/deployment/CORS_CONFIGURATION.md) - CORS setup guide
- [Hosting Guide](docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md) - Provider-specific deployment
- [Environment Config](docs/deployment/ENVIRONMENT_CONFIG_GUIDE.md) - Environment variables
- [Logging Guide](docs/development/LOGGING_GUIDE.md) - Logging configuration

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 👥 Authors

- Mega-Zinyz - Initial work

## 🙏 Acknowledgments

- Sastrawi - Indonesian text stemming
- scikit-learn - Machine learning library
- Angular Team - Frontend framework
- Docker - Containerization platform

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check documentation in `/docs` folder
- Review [Troubleshooting](#-troubleshooting) section

## 🎯 Roadmap

- [ ] Add support for multiple languages
- [ ] Real-time sentiment tracking dashboard
- [ ] Export results to PDF/Excel
- [ ] Sentiment trend visualization
- [ ] API rate limiting per user
- [ ] Advanced analytics and reporting

---

**Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Last Updated**: November 12, 2025

Made with ❤️ for Indonesian sentiment analysis
