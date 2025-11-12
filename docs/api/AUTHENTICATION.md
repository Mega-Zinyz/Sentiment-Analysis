# API Overview

Complete reference for the Indonesian Sentiment Analysis System REST API.

## 📋 Base Information

- **Base URL**: `http://localhost:5000/api`
- **Production**: `https://yourdomain.com/api`
- **Authentication**: JWT Bearer Token
- **Content-Type**: `application/json`
- **Rate Limiting**: 100 requests per 15 minutes per IP

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### How to Get a Token

1. **Register** or **Login** to get tokens
2. **Store** the access token (24h validity)
3. **Include** in every protected request
4. **Refresh** when expired using refresh token

## 📚 API Categories

### 🔑 Authentication
- User registration and login
- Token management
- Session handling

### 📊 Analysis
- Upload data for analysis
- Start sentiment analysis
- Track progress
- Get results

### 📚 Word Libraries
- Create and manage libraries
- Add positive/negative words
- CRUD operations

### 📈 History & Insights
- View analysis history
- Get detailed insights
- Export data

### 🛡️ Admin
- User management
- System configuration
- Error logs

### ⚙️ System
- Health checks
- Status monitoring

## 🔐 Authentication Endpoints

### Register New User

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "fullName": "John Doe"
}
```

**Response:**
```json
{
  "message": "Registration successful",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "fullName": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "fullName": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Refresh Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

## 📊 Analysis Endpoints

### Upload CSV Data

```http
POST /api/raw-data/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <csv-file>
```

**CSV Format:**
```csv
timestamp,username,message
2024-01-01 10:00:00,user123,Saya sangat senang dengan produk ini
2024-01-01 10:05:00,user456,Kualitas buruk dan mengecewakan
```

**Response:**
```json
{
  "message": "File uploaded successfully",
  "datasetId": "dataset_1234567890",
  "rowCount": 1000,
  "filename": "tweets.csv"
}
```

### Start Sentiment Analysis

```http
POST /api/sentiment-analysis/analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "datasetId": "dataset_1234567890",
  "libraryId": 5,
  "sessionName": "Product Feedback Analysis Q1"
}
```

**Response:**
```json
{
  "message": "Analysis started",
  "sessionId": "session_1234567890",
  "totalTweets": 1000,
  "estimatedTime": "5 minutes"
}
```

### Check Analysis Progress

```http
GET /api/sentiment-analysis/progress/:sessionId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "sessionId": "session_1234567890",
  "status": "processing",
  "progress": {
    "processed": 600,
    "total": 1000,
    "percentage": 60,
    "currentBatch": 2,
    "totalBatches": 4
  },
  "estimatedTimeRemaining": "2 minutes"
}
```

### Get Analysis Results

```http
GET /api/analysis-results/session/:sessionId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "sessionId": "session_1234567890",
  "sessionName": "Product Feedback Analysis Q1",
  "summary": {
    "totalTweets": 1000,
    "positive": 650,
    "negative": 350,
    "positivePercentage": 65,
    "negativePercentage": 35
  },
  "results": [
    {
      "id": 1,
      "message": "Saya sangat senang dengan produk ini",
      "sentiment": "positive",
      "confidence": 0.89,
      "timestamp": "2024-01-01T10:00:00Z"
    }
  ],
  "completedAt": "2024-01-01T10:25:00Z"
}
```

## 📚 Word Library Endpoints

### List User's Libraries

```http
GET /api/word-libraries
Authorization: Bearer <token>
```

**Response:**
```json
{
  "libraries": [
    {
      "id": 5,
      "name": "Product Review Library",
      "description": "Words for product sentiment analysis",
      "positiveWordCount": 150,
      "negativeWordCount": 120,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create New Library

```http
POST /api/word-libraries
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Review Library",
  "description": "Words for product sentiment analysis",
  "positiveWords": ["bagus", "senang", "suka", "mantap"],
  "negativeWords": ["buruk", "sedih", "benci", "jelek"]
}
```

**Response:**
```json
{
  "message": "Library created successfully",
  "library": {
    "id": 5,
    "name": "Product Review Library",
    "description": "Words for product sentiment analysis",
    "positiveWordCount": 4,
    "negativeWordCount": 4
  }
}
```

### Get Library Details

```http
GET /api/word-libraries/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "library": {
    "id": 5,
    "name": "Product Review Library",
    "description": "Words for product sentiment analysis",
    "positiveWords": ["bagus", "senang", "suka", "mantap"],
    "negativeWords": ["buruk", "sedih", "benci", "jelek"],
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Update Library

```http
PUT /api/word-libraries/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Library Name",
  "description": "Updated description"
}
```

### Delete Library

```http
DELETE /api/word-libraries/:id
Authorization: Bearer <token>
```

### Add Words to Library

```http
POST /api/word-libraries/:id/words
Authorization: Bearer <token>
Content-Type: application/json

{
  "positiveWords": ["hebat", "luar biasa"],
  "negativeWords": ["kecewa", "gagal"]
}
```

## 📈 History & Insights Endpoints

### Get Analysis History

```http
GET /api/analysis-history
Authorization: Bearer <token>
Query Parameters:
  - page: 1 (default)
  - limit: 20 (default)
  - sortBy: createdAt (default)
  - order: desc (default)
```

**Response:**
```json
{
  "history": [
    {
      "sessionId": "session_1234567890",
      "sessionName": "Product Feedback Analysis Q1",
      "status": "completed",
      "totalTweets": 1000,
      "positiveCount": 650,
      "negativeCount": 350,
      "libraryName": "Product Review Library",
      "createdAt": "2024-01-01T10:00:00Z",
      "completedAt": "2024-01-01T10:25:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalRecords": 100,
    "limit": 20
  }
}
```

### Get Detailed Insights

```http
GET /api/analysis-insights/:sessionId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "sessionId": "session_1234567890",
  "insights": {
    "sentimentDistribution": {
      "positive": 65,
      "negative": 35
    },
    "topPositiveWords": [
      { "word": "bagus", "count": 120 },
      { "word": "senang", "count": 95 }
    ],
    "topNegativeWords": [
      { "word": "buruk", "count": 80 },
      { "word": "kecewa", "count": 60 }
    ],
    "timelineData": [
      {
        "date": "2024-01-01",
        "positive": 30,
        "negative": 15
      }
    ],
    "averageConfidence": 0.87
  }
}
```

## ⚙️ System Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T10:00:00Z",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "workers": "healthy"
  }
}
```

### Error Logs (Admin Only)

```http
GET /api/error-log
Authorization: Bearer <admin-token>
Query Parameters:
  - limit: 50 (default)
  - level: error (default)
```

## 📝 Response Formats

### Success Response

```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": "More specific information",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

## ⚠️ Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## 🔒 Security Best Practices

1. **Always use HTTPS** in production
2. **Never expose tokens** in URLs or logs
3. **Validate input** on client side
4. **Handle errors gracefully** without exposing sensitive info
5. **Implement rate limiting** on client side
6. **Store tokens securely** (not in localStorage for sensitive apps)
7. **Refresh tokens** before expiration
8. **Logout** to invalidate tokens

## 📚 Example Usage

### JavaScript/TypeScript (Angular)

```typescript
// Service example
import { HttpClient, HttpHeaders } from '@angular/common/http';

const apiUrl = 'http://localhost:5000/api';
const token = sessionStorage.getItem('token');

const headers = new HttpHeaders({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});

// Login
this.http.post(`${apiUrl}/auth/login`, { email, password })
  .subscribe(response => {
    sessionStorage.setItem('token', response.token);
  });

// Start analysis
this.http.post(`${apiUrl}/sentiment-analysis/analyze`, 
  { datasetId, libraryId, sessionName },
  { headers }
).subscribe(response => {
  console.log('Analysis started:', response.sessionId);
});
```

### cURL

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get analysis history
curl -X GET http://localhost:5000/api/analysis-history \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Python

```python
import requests

api_url = "http://localhost:5000/api"

# Login
response = requests.post(f"{api_url}/auth/login", json={
    "email": "user@example.com",
    "password": "password123"
})
token = response.json()["token"]

# Get libraries
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(f"{api_url}/word-libraries", headers=headers)
libraries = response.json()["libraries"]
```

## 📖 Further Reading

- [Raw Data Analysis API](../api-reference/RAW_DATA_ANALYSIS_API.md) - Detailed API documentation
- [Security Analysis](../api-reference/SECURITY_ANALYSIS.md) - Security implementation
- [Authentication Guide](../security/AUTH_GUIDE.md) - Auth best practices

---

**API Version**: 1.0.0  
**Last Updated**: November 12, 2025
