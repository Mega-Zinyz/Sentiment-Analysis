# Indonesian Sentiment Analysis System

Production-ready sentiment analysis application for Indonesian text using Naive Bayes and Sastrawi stemming.

## Features

- **CSV Analysis** - Batch process Indonesian text data
- **Twitter/X Integration** - Real-time social media sentiment analysis
- **Custom Word Libraries** - Build domain-specific models
- **Multi-worker Processing** - Fast parallel analysis (6 workers)
- **Docker Deployment** - Easy production deployment

## Quick Start

```bash
# Clone repository
git clone https://github.com/Mega-Zinyz/Sentiment-Analysis.git
cd Sentiment-Analysis

# Start with Docker
docker-compose up -d

# Access application
# Frontend: http://localhost:4200
# Backend: http://localhost:5000
```

**Default credentials**: admin / admin123

## Tech Stack

- **Frontend**: Angular 18, TypeScript, Bootstrap
- **Backend**: Node.js 20, Express, Python 3.12
- **Database**: MySQL 8.0
- **ML/NLP**: scikit-learn, Sastrawi, spaCy

## Documentation

📖 Full documentation: https://mega-zinyz.github.io/Sentiment-Analysis

- [Installation Guide](docs/GITHUB_PAGES_SETUP.md)
- [Production Checklist](PRODUCTION_CHECKLIST.md)
- [API Reference](docs/api-reference/RAW_DATA_ANALYSIS_API.md)
- [Security Guide](SECURITY_FIXES.md)
- [Troubleshooting](docs/troubleshooting/COMMON_ISSUES.md)

## Project Status

✅ **Production Ready** | Version 1.0.0 | Last Updated: November 12, 2025

## License

MIT License - see [LICENSE](LICENSE) for details
