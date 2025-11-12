# Project Cleanup & Reorganization

## Files to Remove (Unused)

### Backend/config/database.js
- **Why:** Old SQLite config, now using MySQL (mysql-database.js)
- **Action:** Delete

### Backend/python/sentiment_nb_preprocess.js  
- **Why:** Unused wrapper file, Python scripts called directly
- **Action:** Delete

### Backend/run-migration.js
- **Why:** Old migration script, database setup handled by mysql-database.js
- **Action:** Delete

### Root/.env.example
- **Why:** Duplicate, Backend already has .env.example
- **Action:** Delete

### Root/test_data.csv
- **Why:** Sample data, not needed in production
- **Action:** Move to Backend/scripts/sample_data/ or delete

## Files to Move/Reorganize

### Documentation Files (Root → docs/)
Move all root-level .md files to organized docs folder:
```
docs/
├── deployment/
│   ├── DOCKER_README.md
│   ├── DOCKER_INTEGRATION.md
│   ├── HOSTING_DEPLOYMENT_GUIDE.md
│   └── ENVIRONMENT_CONFIG_GUIDE.md
└── development/
    ├── LOGGING_GUIDE.md
    └── PRODUCTION_DEBUGGING.md
```

### Script Files
Organize Backend/scripts/ by purpose:
```
Backend/scripts/
├── setup/
│   ├── setup-database.js
│   └── setup-tweet-tables.js
├── migration/
│   ├── migrate-database.js
│   └── migrate-word-libraries.js
├── maintenance/
│   ├── reset-database.js
│   └── reset-raw-twitter-data.js
└── testing/
    ├── test-profile-query.js
    └── test_raw_data_analysis.js
```

### Temp Files
Clean up Backend/temp/uploads/:
```
Backend/temp/
└── uploads/
    └── .gitkeep  (keep folder structure)
```

## Proposed Final Structure

```
sentimen_analisis/
├── docs/                          # ✨ NEW: All documentation
│   ├── README.md                  # Main project docs
│   ├── deployment/
│   │   ├── DOCKER_README.md
│   │   ├── DOCKER_INTEGRATION.md
│   │   ├── HOSTING_DEPLOYMENT_GUIDE.md
│   │   └── ENVIRONMENT_CONFIG_GUIDE.md
│   └── development/
│       ├── LOGGING_GUIDE.md
│       ├── PRODUCTION_DEBUGGING.md
│       └── API_DOCUMENTATION.md
│
├── Backend/
│   ├── config/
│   │   └── mysql-database.js      # ✅ Only MySQL config
│   ├── docs/                      # Backend-specific docs
│   │   ├── database_schema.sql
│   │   ├── word_libraries_schema.sql
│   │   ├── RAW_DATA_ANALYSIS_API.md
│   │   └── SECURITY_ANALYSIS.md
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimiter.js
│   ├── python/
│   │   ├── sentiment_analysis_batch.py
│   │   ├── sentiment_nb_spacy.py
│   │   └── sentiment_worker.py
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── sentimentAnalysis.js
│   │   └── ... (all route files)
│   ├── scripts/
│   │   ├── setup/
│   │   │   ├── setup-database.js
│   │   │   └── setup-tweet-tables.js
│   │   ├── migration/
│   │   │   ├── migrate-database.js
│   │   │   └── migrate-word-libraries.js
│   │   ├── maintenance/
│   │   │   ├── reset-database.js
│   │   │   └── reset-raw-twitter-data.js
│   │   └── testing/
│   │       ├── test-profile-query.js
│   │       └── test_raw_data_analysis.js
│   ├── utils/
│   │   ├── auditLogger.js
│   │   ├── encryption.js
│   │   ├── logger.js              # ✨ NEW: Winston logger
│   │   ├── rawDataProcessor.js
│   │   ├── SentimentWorkerPool.js
│   │   └── sessionManager.js
│   ├── temp/
│   │   └── uploads/
│   │       └── .gitkeep
│   ├── .env                       # Environment config
│   ├── .env.example
│   ├── Dockerfile
│   ├── index.js
│   ├── package.json
│   ├── requirements.txt
│   └── routes.js
│
├── Frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── environments/
│   │   │   ├── environment.ts
│   │   │   └── environment.prod.ts
│   │   └── ...
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docker-compose.yml
├── .gitignore
└── README.md                      # Main project README
```

## Cleanup Commands

### Step 1: Remove Unused Files
```powershell
# Remove SQLite config (now using MySQL)
Remove-Item Backend/config/database.js

# Remove unused wrapper
Remove-Item Backend/python/sentiment_nb_preprocess.js

# Remove old migration script
Remove-Item Backend/run-migration.js

# Remove root .env.example (duplicate)
Remove-Item .env.example

# Remove test data
Remove-Item test_data.csv
```

### Step 2: Create New Directory Structure
```powershell
# Create docs directories
New-Item -ItemType Directory -Path docs/deployment
New-Item -ItemType Directory -Path docs/development

# Create organized script directories
New-Item -ItemType Directory -Path Backend/scripts/setup
New-Item -ItemType Directory -Path Backend/scripts/migration
New-Item -ItemType Directory -Path Backend/scripts/maintenance
New-Item -ItemType Directory -Path Backend/scripts/testing
```

### Step 3: Move Documentation Files
```powershell
# Move deployment docs
Move-Item DOCKER_README.md docs/deployment/
Move-Item DOCKER_INTEGRATION.md docs/deployment/
Move-Item HOSTING_DEPLOYMENT_GUIDE.md docs/deployment/
Move-Item ENVIRONMENT_CONFIG_GUIDE.md docs/deployment/

# Move development docs
Move-Item LOGGING_GUIDE.md docs/development/
Move-Item PRODUCTION_DEBUGGING.md docs/development/
```

### Step 4: Organize Scripts
```powershell
# Move setup scripts
Move-Item Backend/scripts/setup-database.js Backend/scripts/setup/
Move-Item Backend/scripts/setup-tweet-tables.js Backend/scripts/setup/

# Move migration scripts
Move-Item Backend/scripts/migrate-database.js Backend/scripts/migration/
Move-Item Backend/scripts/migrate-word-libraries.js Backend/scripts/migration/

# Move maintenance scripts
Move-Item Backend/scripts/reset-database.js Backend/scripts/maintenance/
Move-Item Backend/scripts/reset-raw-twitter-data.js Backend/scripts/maintenance/

# Move testing scripts
Move-Item Backend/scripts/test-profile-query.js Backend/scripts/testing/
Move-Item Backend/scripts/test_raw_data_analysis.js Backend/scripts/testing/
```

### Step 5: Clean Temp Directory
```powershell
# Remove uploaded files (keep structure)
Remove-Item Backend/temp/uploads/* -Force
New-Item -ItemType File -Path Backend/temp/uploads/.gitkeep
```

### Step 6: Update .gitignore
```gitignore
# Add to Backend/.gitignore
temp/uploads/*
!temp/uploads/.gitkeep
logs/*
!logs/.gitkeep
*.log
```

## Files Analysis

### ✅ Keep - Essential Files
- `Backend/index.js` - Main server entry point
- `Backend/routes.js` - Route configuration
- `Backend/config/mysql-database.js` - Database connection
- All files in `routes/`, `middleware/`, `utils/`
- All Python files in `python/`
- Frontend source files

### ❌ Remove - Unused Files  
- `Backend/config/database.js` - Old SQLite config
- `Backend/python/sentiment_nb_preprocess.js` - Unused wrapper
- `Backend/run-migration.js` - Replaced by mysql-database.js
- `.env.example` (root) - Duplicate
- `test_data.csv` - Sample data

### 📦 Move - Misplaced Files
- Root documentation files → `docs/`
- Backend scripts → organized subdirectories
- Temp uploads → clean and add .gitkeep

## Updated README.md Structure

Create comprehensive `README.md`:
```markdown
# Sentiment Analysis Application

## Quick Start
- See `docs/deployment/DOCKER_README.md`

## Documentation
- **Deployment**: `docs/deployment/`
- **Development**: `docs/development/`
- **API**: `docs/api-reference/`

## Project Structure
- `Backend/` - Node.js API server
- `Frontend/` - Angular web application
- `docs/` - Project documentation
```

## Verification Checklist

After cleanup:
- [ ] Application still runs: `docker-compose up -d`
- [ ] No import errors in code
- [ ] Documentation links work
- [ ] Scripts can be found and executed
- [ ] Git status shows only intended changes
- [ ] .gitignore properly excludes temp files

## Benefits of This Cleanup

1. **Better Organization**: Docs in one place, scripts categorized
2. **Less Clutter**: Remove unused SQLite and old migration code
3. **Clear Structure**: Easy to find files by purpose
4. **Production Ready**: Clean structure for deployment
5. **Maintainable**: New developers can navigate easily
