# FAQ - Frequently Asked Questions

## General Questions

### What is this system for?

This system performs sentiment analysis on Indonesian text, specifically designed to analyze social media content, customer feedback, product reviews, and other text data to determine positive or negative sentiment.

### Who can use this system?

- Researchers studying Indonesian social media
- Businesses monitoring brand sentiment
- Data scientists building NLP models
- Students working on sentiment analysis projects
- Anyone needing to analyze Indonesian text sentiment

### Is this system free to use?

Yes, this is an open-source project under the MIT License. You can use, modify, and distribute it freely.

## Technical Questions

### What programming languages does it use?

- **Frontend**: TypeScript/Angular
- **Backend**: JavaScript/Node.js
- **ML Engine**: Python
- **Database**: MySQL

### Can I use this for languages other than Indonesian?

The current implementation is optimized for Indonesian using Sastrawi stemmer. To support other languages, you would need to:
1. Replace the stemmer with language-appropriate tools
2. Update the word libraries
3. Adjust preprocessing logic

### What machine learning algorithm is used?

Naive Bayes classifier with TF-IDF vectorization. It's chosen for:
- High accuracy with proper training data
- Fast processing speed
- Low computational requirements
- Good interpretability

### How accurate is the sentiment analysis?

Accuracy depends heavily on:
- **Word library quality** - More comprehensive = better accuracy
- **Domain specificity** - Domain-specific libraries perform better
- **Text quality** - Clean, well-written text = better results
- Typically 75-90% accuracy with good word libraries

## Installation & Setup

### What are the system requirements?

**Minimum:**
- 2 CPU cores
- 4GB RAM
- 10GB disk space
- Docker Desktop

**Recommended:**
- 4+ CPU cores
- 8GB RAM
- 20GB disk space

### How long does installation take?

- **Docker installation**: 10-15 minutes (first time, includes downloading images)
- **Local development**: 20-30 minutes (includes npm/pip installs)

### Can I run this without Docker?

Yes, but Docker is recommended. For local development:
1. Install Node.js 20+, Python 3.12+, MySQL 8.0
2. Configure each component manually
3. Run backend and frontend separately

See [Development Setup](../README.md#-deployment) for details.

### Why isn't the database initializing?

MySQL takes 30-60 seconds to initialize on first run. Wait for "ready for connections" in logs:

```bash
docker-compose logs mysql | grep "ready for connections"
```

## Usage Questions

### How do I create a word library?

1. Login to the system
2. Navigate to **Admin** → **Word Libraries**
3. Click "Create New Library"
4. Add positive words (e.g., bagus, senang, suka)
5. Add negative words (e.g., buruk, sedih, benci)
6. Save the library

### What CSV format is required?

CSV must have these exact columns:
```text
timestamp,username,message
2024-01-01 10:00:00,user123,Tweet text here
```

- **timestamp**: Date and time (YYYY-MM-DD HH:MM:SS)
- **username**: User identifier
- **message**: Text to analyze

### How long does analysis take?

Depends on dataset size:
- 1,000 tweets: ~2 minutes
- 10,000 tweets: ~8 minutes  
- 25,000 tweets: ~22 minutes
- 50,000 tweets: ~40 minutes

### Can I analyze real-time data?

Yes, through Twitter/X API integration. Configure API credentials and collect tweets directly from the platform.

### What's the maximum dataset size?

No hard limit, but practical limits:
- **Memory**: Each worker uses ~500MB
- **Processing**: Very large datasets (100k+) take considerable time
- **Storage**: Database size considerations

For very large datasets, consider processing in batches.

## Performance Questions

### Why is analysis slow?

Common causes:
1. **Limited resources** - Increase Docker memory allocation
2. **Too many workers** - Reduce if system is overloaded
3. **Large batches** - Reduce batch size
4. **System overhead** - Close unnecessary applications

### How can I speed up analysis?

1. **Increase workers** (if you have CPU cores available)
2. **Increase batch size** (if you have RAM available)
3. **Use SSD storage**
4. **Allocate more Docker resources**

Edit `Backend/routes/sentimentAnalysis.js`:
```javascript
const NUM_WORKERS = 8;      // More workers (if CPUs available)
const BATCH_SIZE = 500;     // Larger batches (if RAM available)
```

### Why is memory usage high?

This is normal:
- 6 Python workers running simultaneously
- Each worker loads ML models
- Batch processing requires memory

To reduce:
- Decrease worker count
- Reduce batch size
- Use smaller datasets

## Troubleshooting

### Backend won't start - what should I check?

1. **Is Docker running?** `docker --version`
2. **Are ports free?** Check ports 80, 5000, 3306
3. **Is .env configured?** Check JWT_SECRET, DB_PASSWORD
4. **Are containers healthy?** `docker-compose ps`
5. **Check logs**: `docker-compose logs backend`

### I'm getting CORS errors

Update `.env` file:
```bash
# Development
ALLOWED_ORIGINS=http://localhost,http://localhost:4200

# Production
ALLOWED_ORIGINS=https://yourdomain.com

# Wildcard
ALLOWED_ORIGINS=*.yourdomain.com
```

Then restart: `docker-compose restart backend`

### Analysis results show 0% or 100%

Your word library likely needs improvement:
1. Add more diverse words
2. Ensure BOTH positive AND negative words exist
3. Use domain-specific vocabulary
4. Test with known positive/negative samples

### Frontend shows blank page

1. **Hard refresh**: Ctrl + Shift + R
2. **Check backend**: `curl http://localhost:5000/health`
3. **Rebuild frontend**: `docker-compose up -d --build frontend`
4. **Check logs**: `docker-compose logs frontend`

## Security Questions

### How secure is this system?

Security features:
- ✅ JWT authentication
- ✅ Password hashing (bcrypt)
- ✅ Data encryption (AES-256-GCM)
- ✅ SQL injection protection
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Audit logging

See [Security Guide](../deployment/PRODUCTION_SECURITY.md) for details.

### Should I change default credentials?

**YES!** Change immediately:
1. Change admin password after first login
2. Generate new JWT_SECRET
3. Generate new ENCRYPTION_KEY
4. Update database password

### How do I generate secure secrets?

```bash
# JWT_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Is data encrypted?

- **In transit**: HTTPS/TLS (production)
- **At rest**: Sensitive fields use AES-256-GCM
- **Passwords**: bcrypt hashing (never stored plain)
- **Tokens**: JWT with strong secrets

## Deployment Questions

### Can I deploy to production?

Yes! The system is production-ready. Follow:
1. [Production Checklist](../PRODUCTION_CHECKLIST.md)
2. [Hosting Guide](../docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md)
3. [Security Guide](../docs/deployment/PRODUCTION_SECURITY.md)

### What hosting providers are supported?

Compatible with all major providers:
- AWS (ECS, EC2, Lightsail)
- Google Cloud (Cloud Run, GKE)
- Azure (Container Apps, AKS)
- DigitalOcean (App Platform)
- Railway, Render, Heroku

Any platform with Docker support works.

### How much does hosting cost?

Varies by provider and usage:
- **Small scale** (VPS): $5-20/month
- **Medium scale** (Container service): $20-100/month
- **Large scale** (Kubernetes): $100+/month

### Do I need a domain name?

Not required, but recommended for production:
- Better security (HTTPS)
- Professional appearance
- Easier to remember
- Required for some features (OAuth, etc.)

## Development Questions

### Can I contribute to this project?

Yes! Contributions welcome:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [Contributing Guidelines](../README.md#-contributing).

### How do I report bugs?

1. Check [existing issues](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues)
2. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - System information
   - Relevant logs

### Where can I get help?

1. **Documentation** - Check `/docs` folder
2. **GitHub Issues** - Report bugs
3. **GitHub Discussions** - Ask questions
4. **FAQ** - This page

### Can I use this for commercial purposes?

Yes, under MIT License you can:
- Use commercially
- Modify the code
- Distribute
- Sublicense

Attribution appreciated but not required.

## Still have questions?

- 📖 [Check Documentation](../README.md)
- 💬 [GitHub Discussions](https://github.com/Mega-Zinyz/Sentiment-Analysis/discussions)
- 🐛 [Report Issues](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues)
- 📧 Contact the maintainer

---

**Last Updated**: November 12, 2025
