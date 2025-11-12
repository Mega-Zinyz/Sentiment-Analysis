# Automated Project Cleanup Script
# Run this from project root: powershell -ExecutionPolicy Bypass -File cleanup.ps1

Write-Host "`n=== Sentiment Analysis Project Cleanup ===" -ForegroundColor Cyan
Write-Host "This will reorganize files and remove unused code.`n" -ForegroundColor Yellow

# Confirm before proceeding
$confirmation = Read-Host "Continue? (yes/no)"
if ($confirmation -ne 'yes') {
    Write-Host "Cleanup cancelled." -ForegroundColor Red
    exit
}

Write-Host "`n[1/6] Creating new directory structure..." -ForegroundColor Green

# Create docs directories
New-Item -ItemType Directory -Force -Path "docs/deployment" | Out-Null
New-Item -ItemType Directory -Force -Path "docs/development" | Out-Null

# Create organized script directories
New-Item -ItemType Directory -Force -Path "Backend/scripts/setup" | Out-Null
New-Item -ItemType Directory -Force -Path "Backend/scripts/migration" | Out-Null
New-Item -ItemType Directory -Force -Path "Backend/scripts/maintenance" | Out-Null
New-Item -ItemType Directory -Force -Path "Backend/scripts/testing" | Out-Null

# Create logs directory with .gitkeep
New-Item -ItemType Directory -Force -Path "Backend/logs" | Out-Null
New-Item -ItemType File -Force -Path "Backend/logs/.gitkeep" | Out-Null

Write-Host "[2/6] Moving documentation files..." -ForegroundColor Green

# Move deployment docs
if (Test-Path "DOCKER_README.md") { Move-Item "DOCKER_README.md" "docs/deployment/" -Force }
if (Test-Path "DOCKER_INTEGRATION.md") { Move-Item "DOCKER_INTEGRATION.md" "docs/deployment/" -Force }
if (Test-Path "HOSTING_DEPLOYMENT_GUIDE.md") { Move-Item "HOSTING_DEPLOYMENT_GUIDE.md" "docs/deployment/" -Force }
if (Test-Path "ENVIRONMENT_CONFIG_GUIDE.md") { Move-Item "ENVIRONMENT_CONFIG_GUIDE.md" "docs/deployment/" -Force }

# Move development docs
if (Test-Path "LOGGING_GUIDE.md") { Move-Item "LOGGING_GUIDE.md" "docs/development/" -Force }
if (Test-Path "PRODUCTION_DEBUGGING.md") { Move-Item "PRODUCTION_DEBUGGING.md" "docs/development/" -Force }

# Move cleanup plan to docs
if (Test-Path "CLEANUP_PLAN.md") { Move-Item "CLEANUP_PLAN.md" "docs/" -Force }

Write-Host "[3/6] Organizing Backend scripts..." -ForegroundColor Green

# Move setup scripts
if (Test-Path "Backend/scripts/setup-database.js") { 
    Move-Item "Backend/scripts/setup-database.js" "Backend/scripts/setup/" -Force 
}
if (Test-Path "Backend/scripts/setup-tweet-tables.js") { 
    Move-Item "Backend/scripts/setup-tweet-tables.js" "Backend/scripts/setup/" -Force 
}

# Move migration scripts
if (Test-Path "Backend/scripts/migrate-database.js") { 
    Move-Item "Backend/scripts/migrate-database.js" "Backend/scripts/migration/" -Force 
}
if (Test-Path "Backend/scripts/migrate-word-libraries.js") { 
    Move-Item "Backend/scripts/migrate-word-libraries.js" "Backend/scripts/migration/" -Force 
}

# Move maintenance scripts
if (Test-Path "Backend/scripts/reset-database.js") { 
    Move-Item "Backend/scripts/reset-database.js" "Backend/scripts/maintenance/" -Force 
}
if (Test-Path "Backend/scripts/reset-raw-twitter-data.js") { 
    Move-Item "Backend/scripts/reset-raw-twitter-data.js" "Backend/scripts/maintenance/" -Force 
}
if (Test-Path "Backend/scripts/fix-word-library-user.js") { 
    Move-Item "Backend/scripts/fix-word-library-user.js" "Backend/scripts/maintenance/" -Force 
}
if (Test-Path "Backend/scripts/check-word-libraries.js") { 
    Move-Item "Backend/scripts/check-word-libraries.js" "Backend/scripts/maintenance/" -Force 
}
if (Test-Path "Backend/scripts/check-table.js") { 
    Move-Item "Backend/scripts/check-table.js" "Backend/scripts/maintenance/" -Force 
}

# Move testing scripts
if (Test-Path "Backend/scripts/test-profile-query.js") { 
    Move-Item "Backend/scripts/test-profile-query.js" "Backend/scripts/testing/" -Force 
}
if (Test-Path "Backend/scripts/test_raw_data_analysis.js") { 
    Move-Item "Backend/scripts/test_raw_data_analysis.js" "Backend/scripts/testing/" -Force 
}

# Keep utility scripts at root level
# - add-tweet-tables.js
# - get_fresh_token.js

Write-Host "[4/6] Removing unused files..." -ForegroundColor Green

# Remove SQLite config (now using MySQL)
if (Test-Path "Backend/config/database.js") { 
    Remove-Item "Backend/config/database.js" -Force
    Write-Host "  Removed: Backend/config/database.js (SQLite, unused)" -ForegroundColor DarkGray
}

# Remove unused Python wrapper
if (Test-Path "Backend/python/sentiment_nb_preprocess.js") { 
    Remove-Item "Backend/python/sentiment_nb_preprocess.js" -Force
    Write-Host "  Removed: Backend/python/sentiment_nb_preprocess.js (unused wrapper)" -ForegroundColor DarkGray
}

# Remove old migration script
if (Test-Path "Backend/run-migration.js") { 
    Remove-Item "Backend/run-migration.js" -Force
    Write-Host "  Removed: Backend/run-migration.js (replaced)" -ForegroundColor DarkGray
}

# Remove root .env.example if exists (Backend has one)
if (Test-Path ".env.example") { 
    Remove-Item ".env.example" -Force
    Write-Host "  Removed: .env.example (duplicate)" -ForegroundColor DarkGray
}

# Remove test data
if (Test-Path "test_data.csv") { 
    Remove-Item "test_data.csv" -Force
    Write-Host "  Removed: test_data.csv (sample data)" -ForegroundColor DarkGray
}

Write-Host "[5/6] Cleaning temp directories..." -ForegroundColor Green

# Clean temp/uploads but keep structure
if (Test-Path "Backend/temp/uploads") {
    Get-ChildItem "Backend/temp/uploads" -File | Remove-Item -Force
    New-Item -ItemType File -Force -Path "Backend/temp/uploads/.gitkeep" | Out-Null
    Write-Host "  Cleaned: Backend/temp/uploads/" -ForegroundColor DarkGray
}

Write-Host "[6/6] Creating project README..." -ForegroundColor Green

# Create main README if it doesn't exist
$readmeContent = @"
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

``````bash
# Clone repository
git clone <your-repo-url>
cd sentimen_analisis

# Start all services
docker-compose up -d

# Access application
# Frontend: http://localhost
# Backend API: http://localhost:5000
``````

### Default Login
- Username: ``admin``
- Password: ``admin123``

## Project Structure

``````
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
``````

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
``````bash
cd Backend
npm install
cp .env.example .env
npm run dev
``````

### Frontend Development
``````bash
cd Frontend
npm install
npm start
``````

## Configuration

### Environment Variables
See ``.env.example`` for all configuration options.

Key variables:
- ``NODE_ENV`` - production/development
- ``DB_HOST`` - MySQL host
- ``JWT_SECRET`` - Authentication secret
- ``LOG_LEVEL`` - Logging verbosity

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
1. Check documentation in ``docs/``
2. Review logs: ``docker logs sentiment-backend``
3. See troubleshooting guides in documentation

## Contributors

- [Your Name] - Initial work

---

Made with ❤️ for Indonesian NLP research
"@

if (-not (Test-Path "README.md")) {
    Set-Content -Path "README.md" -Value $readmeContent
    Write-Host "  Created: README.md" -ForegroundColor DarkGray
}

Write-Host "`n✅ Cleanup completed successfully!`n" -ForegroundColor Green

Write-Host "Summary of changes:" -ForegroundColor Cyan
Write-Host "  • Organized documentation in docs/ folder" -ForegroundColor White
Write-Host "  • Categorized Backend scripts by purpose" -ForegroundColor White
Write-Host "  • Removed unused SQLite and old code" -ForegroundColor White
Write-Host "  • Cleaned temporary files" -ForegroundColor White
Write-Host "  • Created project README" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Test the application: docker-compose up -d" -ForegroundColor White
Write-Host "  2. Commit changes: git add . && git commit -m 'Clean up project structure'" -ForegroundColor White
Write-Host "  3. Review docs/ folder for updated documentation" -ForegroundColor White

Write-Host "`nProject structure is now production-ready! 🚀`n" -ForegroundColor Green
