# System Architecture

This document provides a comprehensive overview of the Indonesian Sentiment Analysis System architecture, components, and data flow.

## 🏗️ Architecture Overview

The system follows a **3-tier architecture** pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Angular 18 Frontend (Port 80/443)              │ │
│  │  - TypeScript Components                               │ │
│  │  - Bootstrap UI                                        │ │
│  │  - JWT Token Management                                │ │
│  │  - Nginx Web Server (Production)                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/HTTPS
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        Node.js + Express Backend (Port 5000)           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │  API Routes  │  │  Middleware  │  │   Utils     │ │ │
│  │  │  - Auth      │  │  - JWT Auth  │  │  - Logger   │ │ │
│  │  │  - Analysis  │  │  - CORS      │  │  - Crypto   │ │ │
│  │  │  - Libraries │  │  - Rate Lim  │  │  - Error    │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  │                                                        │ │
│  │  ┌────────────────────────────────────────────────┐   │ │
│  │  │     Python Worker Pool (6 Workers)             │   │ │
│  │  │  - Sentiment Analysis Engine                   │   │ │
│  │  │  - Sastrawi Stemmer                           │   │ │
│  │  │  - Naive Bayes Classifier                     │   │ │
│  │  │  - Batch Processing (300 tweets/batch)        │   │ │
│  │  └────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ SQL
┌─────────────────────────────────────────────────────────────┐
│                        DATA LAYER                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │             MySQL 8.0 Database (Port 3306)             │ │
│  │  - User Management                                     │ │
│  │  - Word Libraries                                      │ │
│  │  - Analysis Results                                    │ │
│  │  - Twitter Data                                        │ │
│  │  - Audit Logs                                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Component Architecture

### Frontend (Angular 18)

#### Core Modules

* **Authentication Module** - Login, registration, JWT management
* **Admin Module** - User management, system configuration
* **Analysis Module** - CSV upload, Twitter collection, results viewing
* **Library Module** - Word library CRUD operations
* **History Module** - Analysis history and insights

#### Key Features

* **Reactive Forms** - Form validation and handling
* **HTTP Interceptors** - Automatic JWT token attachment
* **Route Guards** - Authentication and authorization
* **Error Handling** - Global error interceptor
* **State Management** - Service-based state

#### Production Build

* **Nginx** - High-performance web server
* **Static Assets** - Pre-compiled and minified
* **Gzip Compression** - Reduced bandwidth
* **Caching Headers** - Improved performance

### Backend (Node.js + Express)

#### Layered Architecture

```
┌─────────────────────────────────────┐
│         Routes Layer                │
│  - Define endpoints                 │
│  - Request validation               │
│  - Response formatting              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Middleware Layer               │
│  - Authentication (JWT)             │
│  - Authorization (Roles)            │
│  - CORS validation                  │
│  - Rate limiting                    │
│  - Error handling                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       Business Logic Layer          │
│  - Data processing                  │
│  - Business rules                   │
│  - Validation logic                 │
│  - Integration with Python workers  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│        Data Access Layer            │
│  - Database queries                 │
│  - Connection pooling               │
│  - Transaction management           │
│  - Query optimization               │
└─────────────────────────────────────┘
```

#### Core Components

**Authentication System**

* JWT token generation and validation
* Refresh token mechanism
* Password hashing with bcrypt
* Session management

**Analysis Engine**

* Worker pool management (6 Python workers)
* Batch processing (300 tweets per batch)
* Progress tracking
* Error handling and retry logic
* Result aggregation

**Data Processing**

* CSV parsing and validation
* Text preprocessing
* Data normalization
* Result formatting

**Logging System**

* Winston logger with rotation
* Multiple log levels (error, warn, info, debug)
* Separate error logs
* Production-ready log management

### Machine Learning Layer (Python)

#### Sentiment Analysis Pipeline

```
Input Text
    ↓
┌─────────────────────────┐
│  Text Preprocessing     │
│  - Lowercase            │
│  - Remove punctuation   │
│  - Remove numbers       │
│  - Remove URLs          │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│  Sastrawi Stemming      │
│  - Indonesian stemmer   │
│  - Root word extraction │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│  Feature Extraction     │
│  - TF-IDF vectorization │
│  - Word frequency       │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│  Naive Bayes Classifier │
│  - Training/Prediction  │
│  - Probability scores   │
└─────────────────────────┘
    ↓
Sentiment Result
(Positive/Negative)
```

#### Worker Pool Architecture

```
┌──────────────────────────────────────────────┐
│           SentimentWorkerPool                │
│  ┌────────────────────────────────────────┐  │
│  │  Worker 1  │  Worker 2  │  Worker 3   │  │
│  │  (Batch 1) │  (Batch 2) │  (Batch 3)  │  │
│  ├────────────┼────────────┼─────────────┤  │
│  │  Worker 4  │  Worker 5  │  Worker 6   │  │
│  │  (Batch 4) │  (Batch 5) │  (Batch 6)  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  - Load balancing                            │
│  - Error handling                            │
│  - Progress tracking                         │
│  - Timeout management (240s)                 │
└──────────────────────────────────────────────┘
```

### Database Layer (MySQL 8.0)

#### Database Schema

**Core Tables**

* `users` - User accounts and authentication
* `word_libraries` - Custom word dictionaries
* `positive_words` - Positive sentiment words
* `negative_words` - Negative sentiment words
* `analysis_sessions` - Analysis metadata
* `analysis_results` - Sentiment analysis results
* `raw_twitter_data` - Collected tweets
* `audit_logs` - Security and activity logs

**Relationships**

```
users (1) ──────────> (N) word_libraries
              creates

word_libraries (1) ──> (N) positive_words
                   ──> (N) negative_words

users (1) ──────────> (N) analysis_sessions
              performs

analysis_sessions (1)─> (N) analysis_results
                   contains
```

#### Indexes & Optimization

* Primary keys on all tables
* Foreign key constraints
* Indexes on frequently queried columns
* Connection pooling for performance
* Query optimization for large datasets

## 🔄 Data Flow

### User Authentication Flow

```
1. User → Frontend: Login credentials
2. Frontend → Backend: POST /api/auth/login
3. Backend → Database: Validate credentials
4. Database → Backend: User data (if valid)
5. Backend: Generate JWT + Refresh Token
6. Backend → Frontend: Tokens + User info
7. Frontend: Store tokens (sessionStorage)
8. Frontend → Backend: Subsequent requests with JWT
9. Backend: Validate JWT on each request
```

### Sentiment Analysis Flow

```
1. User uploads CSV/collects tweets
2. Frontend → Backend: POST /api/raw-data/upload
3. Backend: Validate and store data
4. Frontend → Backend: POST /api/sentiment-analysis/analyze
5. Backend: Create analysis session
6. Backend: Split data into batches (300/batch)
7. Backend: Distribute to worker pool (6 workers)
8. Python Workers: Process batches in parallel
   - Preprocess text
   - Apply stemming
   - Classify sentiment
9. Workers → Backend: Return results
10. Backend: Aggregate results
11. Backend → Database: Store results
12. Backend → Frontend: Analysis complete
13. User views results in History
```

### Real-time Progress Tracking

```
Frontend (Polling every 2s)
    ↓
GET /api/sentiment-analysis/progress/:sessionId
    ↓
Backend calculates:
- Total tweets processed
- Current batch progress
- Estimated time remaining
- Worker status
    ↓
Return progress JSON
    ↓
Frontend updates progress bar
```

## 🔐 Security Architecture

### Authentication & Authorization

```
┌────────────────────────────────────┐
│      JWT Authentication            │
│  - Access Token (24h)              │
│  - Refresh Token (7d)              │
│  - Secure HTTP-only cookies        │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│   Authorization Middleware         │
│  - Verify JWT signature            │
│  - Check token expiration          │
│  - Validate user permissions       │
└────────────────────────────────────┘
         ↓
┌────────────────────────────────────┐
│      Protected Resources           │
│  - User-specific data              │
│  - Admin-only endpoints            │
└────────────────────────────────────┘
```

### Data Protection Layers

1. **Transport Layer** - HTTPS/TLS encryption
2. **Authentication** - JWT with strong secrets
3. **Authorization** - Role-based access control
4. **Data Encryption** - AES-256-GCM for sensitive data
5. **Password Security** - bcrypt hashing (10 rounds)
6. **SQL Injection** - Parameterized queries
7. **CORS** - Pattern-based origin validation
8. **Rate Limiting** - Prevent brute force attacks

## 📊 Performance Architecture

### Optimization Strategies

**Frontend**

* Code splitting
* Lazy loading modules
* AOT compilation
* Tree shaking
* Minification
* Gzip compression

**Backend**

* Connection pooling
* Query optimization
* Caching strategies
* Async/await patterns
* Worker pool parallelization

**Database**

* Indexed columns
* Query optimization
* Connection limits
* Transaction management

### Scalability

**Horizontal Scaling**

* Stateless backend (scales easily)
* Load balancer ready
* Database read replicas
* Shared session storage

**Vertical Scaling**

* Increase worker count
* Larger batch sizes
* More database connections
* Higher resource limits

## 🐳 Docker Architecture

### Container Structure

```
┌─────────────────────────────────────────────────┐
│              Docker Network (bridge)            │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────┐│
│  │   Frontend   │  │   Backend    │  │ MySQL ││
│  │  Container   │  │  Container   │  │Container││
│  │ (Angular +   │  │ (Node.js +   │  │       ││
│  │  Nginx)      │  │  Python)     │  │       ││
│  │              │  │              │  │       ││
│  │ Port: 80     │  │ Port: 5000   │  │ Port: ││
│  │              │  │              │  │ 3306  ││
│  └──────────────┘  └──────────────┘  └───────┘│
│         ↓                  ↓              ↓    │
│  ┌──────────────────────────────────────────┐ │
│  │        Shared Volumes                    │ │
│  │  - Backend logs                          │ │
│  │  - MySQL data (persistent)               │ │
│  │  - Upload temp files                     │ │
│  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Container Communication

* **Frontend → Backend**: HTTP on internal network
* **Backend → MySQL**: TCP on port 3306
* **External → Frontend**: Port 80 (HTTP) / 443 (HTTPS)
* **External → Backend**: Port 5000 (API)

## 🔧 Configuration Management

### Environment-based Configuration

```
┌──────────────────────────────┐
│      .env File               │
│  - NODE_ENV                  │
│  - Database credentials      │
│  - JWT secrets               │
│  - API keys                  │
│  - CORS origins              │
│  - Logging level             │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│   Application Runtime        │
│  - Development mode          │
│  - Production mode           │
│  - Testing mode              │
└──────────────────────────────┘
```

## 📈 Monitoring Architecture

### Logging Pipeline

```
Application Logs
    ↓
Winston Logger
    ↓
┌─────────────────────┐
│  Log Transports     │
│  - Console (dev)    │
│  - File (prod)      │
│  - Error file       │
└─────────────────────┘
    ↓
Log Files (Rotated)
- combined-YYYY-MM-DD.log
- error-YYYY-MM-DD.log
```

### Health Check System

```
/health endpoint
    ↓
Check Components:
- Database connection
- Python workers status
- Disk space
- Memory usage
    ↓
Return Status:
- healthy / unhealthy
- Component details
- Timestamp
```

## 🚀 Deployment Architecture

### Production Deployment

```
┌───────────────────────────────────────┐
│         Load Balancer / CDN           │
│         (Optional)                    │
└───────────────────────────────────────┘
              ↓ HTTPS
┌───────────────────────────────────────┐
│         Docker Host / VM              │
│  ┌────────────────────────────────┐   │
│  │   Docker Compose               │   │
│  │  - Frontend container          │   │
│  │  - Backend container           │   │
│  │  - MySQL container             │   │
│  └────────────────────────────────┘   │
└───────────────────────────────────────┘
              ↓
┌───────────────────────────────────────┐
│      Persistent Storage               │
│  - MySQL data volume                  │
│  - Application logs                   │
│  - User uploads                       │
└───────────────────────────────────────┘
```

## 🔍 Technology Decisions

### Why These Technologies?

**Angular**

* Strong TypeScript support
* Comprehensive framework
* Enterprise-ready
* Great tooling

**Node.js + Express**

* JavaScript everywhere
* High performance
* Large ecosystem
* Easy Python integration

**Python**

* Rich ML/NLP libraries
* Sastrawi for Indonesian
* scikit-learn ecosystem
* Easy to maintain

**MySQL**

* ACID compliance
* Reliable and stable
* Good performance
* Wide hosting support

**Docker**

* Consistent environments
* Easy deployment
* Isolation
* Portability

## 📚 Further Reading

* [API Documentation](../api-reference/RAW_DATA_ANALYSIS_API.md)
* [Security Guide](../deployment/PRODUCTION_SECURITY.md)
* [Performance Tuning](<../../README (1).md#-performance-tuning>)
* [Database Schema](../api-reference/database_schema.sql)

***

**Last Updated**: November 12, 2025
