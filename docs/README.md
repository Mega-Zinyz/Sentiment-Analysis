# Documentation

This directory contains all project documentation, organized by category.

## 📁 Directory Structure

```
docs/
├── api/                      # API endpoint documentation
│   ├── AUTHENTICATION.md     # API overview and auth endpoints
│   ├── ANALYSIS.md          # Analysis endpoints (to be created)
│   ├── WORD_LIBRARIES.md    # Word library endpoints (to be created)
│   └── SYSTEM.md            # System endpoints (to be created)
│
├── api-reference/           # Technical API documentation
│   ├── RAW_DATA_ANALYSIS_API.md    # Complete API reference
│   ├── SECURITY_ANALYSIS.md         # Security implementation details
│   ├── database_schema.sql          # Database schema
│   └── word_libraries_schema.sql    # Word libraries schema
│
├── architecture/            # System architecture
│   └── SYSTEM_ARCHITECTURE.md       # Complete architecture docs
│
├── deployment/              # Deployment guides
│   ├── CORS_CONFIGURATION.md        # CORS setup
│   ├── DOCKER_INTEGRATION.md        # Docker integration
│   ├── DOCKER_README.md             # Docker deployment
│   ├── ENVIRONMENT_CONFIG_GUIDE.md  # Environment variables
│   ├── HOSTING_DEPLOYMENT_GUIDE.md  # Hosting providers
│   └── PRODUCTION_SECURITY.md       # Production security
│
├── development/             # Development guides
│   ├── LOGGING_GUIDE.md             # Logging configuration
│   └── PRODUCTION_DEBUGGING.md      # Debugging in production
│
├── introduction/            # Getting started
│   └── WELCOME.md                   # Welcome page
│
├── reference/               # Reference materials
│   ├── FAQ.md                       # Frequently asked questions
│   └── GLOSSARY.md                  # Technical terms
│
├── troubleshooting/         # Problem solving
│   └── COMMON_ISSUES.md             # Common issues and solutions
│
├── user-guide/              # User documentation (to be created)
│   ├── CSV_ANALYSIS.md              # CSV upload guide
│   ├── TWITTER_INTEGRATION.md       # Twitter/X integration
│   ├── WORD_LIBRARIES.md            # Word library management
│   └── ANALYSIS_HISTORY.md          # Analysis history
│
├── CLEANUP_PLAN.md          # Project cleanup documentation
└── GITHUB_PAGES_SETUP.md    # GitHub Pages deployment guide
```

## 📖 Documentation Categories

### API Documentation

Complete reference for all API endpoints, authentication, and security.

**Location**: `docs/api/` and `docs/api-reference/`

### Architecture

System design, component structure, and technical architecture.

**Location**: `docs/architecture/`

### Deployment

Guides for deploying to various hosting providers and environments.

**Location**: `docs/deployment/`

### Development

Documentation for developers working on the project.

**Location**: `docs/development/`

### Troubleshooting

Solutions to common problems and error messages.

**Location**: `docs/troubleshooting/`

### User Guides

Step-by-step guides for end users.

**Location**: `docs/user-guide/`

### Reference

Glossary, FAQ, and other reference materials.

**Location**: `docs/reference/`

## 🔍 Finding Documentation

### By Topic

**Getting Started**

* [Welcome](../)
* [Quick Start](<../README (1).md#-quick-start>)

**API**

* [API Overview](api/AUTHENTICATION.md)
* [Complete API Reference](api-reference/RAW_DATA_ANALYSIS_API.md)

**Deployment**

* [Docker Deployment](deployment/DOCKER_README.md)
* [Hosting Guide](deployment/HOSTING_DEPLOYMENT_GUIDE.md)

**Security**

* [Production Security](deployment/PRODUCTION_SECURITY.md)
* [Security Analysis](api-reference/SECURITY_ANALYSIS.md)

**Troubleshooting**

* [Common Issues](troubleshooting/COMMON_ISSUES.md)
* [FAQ](reference/FAQ.md)

### By File Type

**Markdown Files (.md)** Human-readable documentation in Markdown format

**SQL Files (.sql)** Database schemas and migrations

## 📝 Documentation Standards

### File Naming

* Use `UPPERCASE_SNAKE_CASE.md` for main documents
* Use lowercase-with-dashes for subdocuments
* Be descriptive and specific

### Structure

Each documentation file should include:

1. Clear title (# heading)
2. Brief description
3. Table of contents (for long docs)
4. Main content with proper headings
5. Examples and code blocks
6. Related links
7. Last updated date

### Links

* Use relative paths: `../other-doc.md`
* Link to specific sections: `README.md#section-name`
* Always test links before committing

## 🔄 Keeping Documentation Updated

### When to Update

* New features added
* Configuration changes
* API changes
* Bug fixes that affect usage
* Security updates

### How to Update

1. Edit the relevant `.md` file
2. Update `SUMMARY.md` if structure changes
3. Check all internal links still work
4. Commit with descriptive message: `docs: update X guide`
5. Push to trigger automatic deployment

## 🌐 Published Documentation

* **GitHub Pages**: https://mega-zinyz.github.io/Sentiment-Analysis
* **Repository**: https://github.com/Mega-Zinyz/Sentiment-Analysis

## 🤝 Contributing to Documentation

See [Contributing Guidelines](<../README (1).md#-contributing>) for how to improve documentation.

***

**Last Updated**: November 12, 2025
