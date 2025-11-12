# Welcome

Welcome to the comprehensive documentation for the Indonesian Sentiment Analysis System - a production-ready, full-stack application designed for analyzing sentiment in Indonesian text using advanced machine learning techniques.

## 🎯 What is This System?

This application provides a complete solution for sentiment analysis of Indonesian text, specifically designed to handle:

* **Manual Data Analysis** - Upload CSV files containing text data for batch sentiment analysis
* **Real-time Twitter/X Analysis** - Collect and analyze tweets directly from Twitter/X API
* **Custom Training Data** - Create and manage your own word libraries for improved accuracy
* **Historical Tracking** - Monitor sentiment trends over time with comprehensive history
* **Production-Ready Deployment** - Docker-based deployment with enterprise-grade security

## 🌟 Who is This For?

This system is perfect for:

* **Researchers** - Conducting sentiment analysis studies on Indonesian social media
* **Data Scientists** - Building sentiment analysis models for Indonesian text
* **Businesses** - Monitoring brand sentiment and customer feedback in Indonesian
* **Developers** - Learning about full-stack sentiment analysis application architecture
* **Students** - Academic projects involving Indonesian NLP and sentiment analysis

## ⚡ Key Capabilities

### Sentiment Analysis

* **Naive Bayes Classifier** optimized for Indonesian language
* **Sastrawi Stemming** for accurate word root extraction
* **Custom Word Libraries** for domain-specific analysis
* **Batch Processing** with 6 parallel workers for high-speed analysis
* **Real-time Progress Tracking** during analysis

### Data Management

* **CSV Upload** for bulk text analysis
* **Twitter/X Integration** for social media monitoring
* **Manual Labeling** for training data creation
* **Data Export** for further analysis
* **Analysis History** with detailed insights

### Security & Production Features

* **JWT Authentication** with refresh tokens
* **User Management** with role-based access
* **Rate Limiting** to prevent abuse
* **Comprehensive Logging** with Winston
* **Docker Deployment** for easy hosting
* **Environment-based Configuration** for flexibility

## 🚀 Quick Navigation

### New Users

1. [**Quick Start Guide**](docs/#-quick-start) - Get started in 5 minutes
2. [**Installation**](docs/#installation) - Setup instructions
3. [**First Time Usage**](docs/#-first-time-usage) - Your first analysis

### Deployment

1. [**Production Checklist**](docs/PRODUCTION_CHECKLIST.md) - Pre-deployment requirements
2. [**Docker Deployment**](docs/docs/deployment/DOCKER_README.md) - Container setup
3. [**Hosting Guide**](docs/docs/deployment/HOSTING_DEPLOYMENT_GUIDE.md) - Cloud deployment

### Development

1. [**System Architecture**](docs/docs/architecture/SYSTEM_ARCHITECTURE.md) - How it works
2. [**API Reference**](docs/introduction/docs/api-reference/RAW_DATA_ANALYSIS_API.md) - Endpoint documentation
3. [**Development Guide**](docs/#-deployment) - Local development setup

### Support

1. [**Troubleshooting**](docs/docs/troubleshooting/COMMON_ISSUES.md) - Common problems & solutions
2. [**FAQ**](docs/docs/reference/FAQ.md) - Frequently asked questions
3. [**GitHub Issues**](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues) - Report bugs

## 📊 Performance Overview

Our system is optimized for production use:

| Metric               | Value      | Description                     |
| -------------------- | ---------- | ------------------------------- |
| **Processing Speed** | 20-25 min  | For 23,000 tweets               |
| **Worker Pool**      | 6 workers  | Parallel processing             |
| **Batch Size**       | 300 tweets | Per batch                       |
| **Accuracy**         | Varies     | Depends on word library quality |
| **Uptime**           | 99%+       | Production-ready stability      |

## 🛠️ Technology Stack

Built with modern, production-ready technologies:

* **Frontend**: Angular 18+, TypeScript, Bootstrap, Nginx
* **Backend**: Node.js 20, Express.js, Python 3.12
* **Database**: MySQL 8.0
* **ML/NLP**: scikit-learn, Sastrawi, spaCy
* **DevOps**: Docker, Docker Compose
* **Security**: JWT, bcrypt, AES-256-GCM

## 📖 Documentation Structure

This documentation is organized into the following sections:

### **Getting Started**

Step-by-step guides for installation, configuration, and first-time usage.

### **Architecture & Design**

Technical documentation about system architecture, components, and design decisions.

### **User Guide**

Detailed instructions for using all features of the application.

### **API Reference**

Complete API documentation with request/response examples.

### **Deployment**

Production deployment guides for various hosting providers and configurations.

### **Security**

Security best practices, vulnerability management, and compliance information.

### **Development**

Guides for local development, testing, and contributing to the project.

### **Monitoring & Logging**

Production monitoring, logging configuration, and debugging techniques.

### **Troubleshooting**

Common issues, error messages, and their solutions.

### **Maintenance**

Database maintenance, backups, updates, and cleanup procedures.

## 🎓 Learning Path

We recommend following this learning path:

### Beginners

1. Read the **Overview** and **Quick Start**
2. Follow **Installation** instructions
3. Try **First Time Usage** tutorial
4. Explore **User Guide** sections

### Developers

1. Review **System Architecture**
2. Study **API Reference**
3. Set up **Local Development**
4. Read **Contributing Guidelines**

### DevOps/Administrators

1. Review **Production Checklist**
2. Study **Security Overview**
3. Follow **Deployment Guides**
4. Configure **Monitoring & Logging**

## 💡 Best Practices

To get the most out of this system:

1. **Start Small** - Test with small datasets before processing large volumes
2. **Customize Word Libraries** - Create domain-specific word libraries for better accuracy
3. **Monitor Performance** - Use logging and monitoring to track system health
4. **Regular Backups** - Back up your database and word libraries regularly
5. **Keep Updated** - Stay current with security patches and updates
6. **Read Docs First** - Most questions are answered in the documentation

## 🆘 Getting Help

If you need assistance:

1. **Search Documentation** - Use the search feature in GitBook
2. **Check FAQ** - Common questions are answered in the FAQ
3. **Review Troubleshooting** - Most issues have documented solutions
4. **GitHub Issues** - Report bugs or request features
5. **Community Discussions** - Join the conversation on GitHub Discussions

## 🤝 Contributing

This is an open-source project, and we welcome contributions! Whether you want to:

* Report bugs
* Suggest features
* Improve documentation
* Submit code changes

Please check our [Contributing Guidelines](docs/#-contributing) to get started.

## 📈 Project Status

* **Version**: 1.0.0
* **Status**: ✅ Production Ready
* **Last Updated**: November 12, 2025
* **Maintenance**: Active
* **License**: MIT

## 🎯 Next Steps

Ready to get started? Here are your next steps:

1. [**Install the System**](docs/#installation) - Set up on your machine
2. [**Configure Environment**](docs/#-configuration) - Customize settings
3. [**First Analysis**](docs/#-first-time-usage) - Run your first sentiment analysis
4. [**Explore Features**](docs/#-features) - Discover all capabilities

***

**Let's analyze some sentiment!** 🚀

[Get Started](docs/#-quick-start) | [View on GitHub](https://github.com/Mega-Zinyz/Sentiment-Analysis) | [Report Issue](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues)
