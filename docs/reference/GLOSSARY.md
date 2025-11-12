# Glossary

A comprehensive glossary of terms used in the Indonesian Sentiment Analysis System.

## A

**AES-256-GCM**  
Advanced Encryption Standard with 256-bit key in Galois/Counter Mode. Used for encrypting sensitive data at rest.

**API (Application Programming Interface)**  
Set of endpoints that allow the frontend to communicate with the backend server.

**Audit Log**  
Record of security-relevant events in the system, used for monitoring and compliance.

**Authentication**  
Process of verifying a user's identity through credentials (email/password).

**Authorization**  
Process of determining what resources an authenticated user can access.

## B

**Batch Processing**  
Processing data in groups (batches) rather than one item at a time. Default batch size is 300 tweets.

**bcrypt**  
Password hashing algorithm used to securely store user passwords.

**Bootstrap**  
CSS framework used for responsive UI design in the frontend.

## C

**CORS (Cross-Origin Resource Sharing)**  
Security feature that controls which domains can access the API.

**CSV (Comma-Separated Values)**  
File format used for uploading tweet data for analysis.

**Connection Pool**  
Pre-established database connections for improved performance.

## D

**Docker**  
Containerization platform used for packaging and deploying the application.

**Docker Compose**  
Tool for defining and running multi-container Docker applications.

**Dataset**  
Collection of tweets or text data uploaded for sentiment analysis.

## E

**Encryption**  
Process of encoding data to prevent unauthorized access.

**Environment Variables**  
Configuration values stored in `.env` file (API keys, database credentials, etc.).

**Express.js**  
Web application framework for Node.js used in the backend.

## F

**Frontend**  
Client-side application built with Angular that users interact with.

## H

**Health Check**  
Endpoint that reports system status and component health.

**HTTP (Hypertext Transfer Protocol)**  
Protocol used for communication between frontend and backend.

**HTTPS (HTTP Secure)**  
Encrypted version of HTTP using TLS/SSL.

## I

**Indonesian NLP**  
Natural Language Processing techniques specifically for Indonesian language.

## J

**JWT (JSON Web Token)**  
Token-based authentication method used for securing API requests.

## L

**Library (Word Library)**  
Collection of positive and negative words used for sentiment classification.

**Logging**  
Recording of system events, errors, and activities for monitoring and debugging.

## M

**Machine Learning (ML)**  
Algorithms that learn from data to make predictions or decisions.

**Middleware**  
Software layer that processes requests before they reach route handlers (auth, CORS, rate limiting).

**MySQL**  
Relational database management system used for data storage.

## N

**Naive Bayes**  
Probabilistic machine learning algorithm used for sentiment classification.

**Negative Sentiment**  
Classification indicating negative opinion or emotion in text.

**Nginx**  
Web server used to serve the frontend application in production.

**NLP (Natural Language Processing)**  
Field of AI focused on interaction between computers and human language.

**Node.js**  
JavaScript runtime used for the backend server.

## P

**Parameterized Query**  
SQL query that uses placeholders to prevent SQL injection attacks.

**Positive Sentiment**  
Classification indicating positive opinion or emotion in text.

**Progress Tracking**  
Real-time monitoring of analysis completion status.

**Python Worker**  
Separate Python process that performs sentiment analysis on a batch of tweets.

## R

**Rate Limiting**  
Restriction on the number of API requests allowed per time period.

**Refresh Token**  
Long-lived token used to obtain new access tokens without re-authentication.

**REST API (Representational State Transfer)**  
Architectural style for designing networked applications using HTTP methods.

## S

**Sastrawi**  
Indonesian language stemming library that reduces words to their root form.

**scikit-learn**  
Python machine learning library used for implementing Naive Bayes classifier.

**Sentiment Analysis**  
Process of determining emotional tone (positive/negative) in text.

**Session**  
Analysis instance with associated results and metadata.

**SQL Injection**  
Security vulnerability where malicious SQL code is inserted into queries.

**Stemming**  
Process of reducing words to their root form (e.g., "mencintai" → "cinta").

## T

**TF-IDF (Term Frequency-Inverse Document Frequency)**  
Statistical measure used to evaluate word importance in documents.

**Token**  
Authentication credential (JWT) sent with API requests.

**Training Data**  
Word libraries used to train the sentiment classifier.

**Tweet**  
Social media post, or more generally, any text message being analyzed.

**TypeScript**  
Typed superset of JavaScript used in the Angular frontend.

## U

**User Management**  
System for registering, authenticating, and managing user accounts.

## V

**Vectorization**  
Converting text into numerical vectors for machine learning algorithms.

**Volume (Docker)**  
Persistent storage for container data (database, logs, uploads).

## W

**Winston**  
Logging library used in Node.js backend for structured logging.

**Worker Pool**  
Set of Python processes running in parallel to process analysis batches.

**Word Library**  
See **Library (Word Library)**

## Acronyms Quick Reference

| Acronym | Full Form |
|---------|-----------|
| AES | Advanced Encryption Standard |
| API | Application Programming Interface |
| CORS | Cross-Origin Resource Sharing |
| CSV | Comma-Separated Values |
| GCM | Galois/Counter Mode |
| HTTP | Hypertext Transfer Protocol |
| HTTPS | HTTP Secure |
| JWT | JSON Web Token |
| ML | Machine Learning |
| NLP | Natural Language Processing |
| REST | Representational State Transfer |
| SQL | Structured Query Language |
| SSL | Secure Sockets Layer |
| TF-IDF | Term Frequency-Inverse Document Frequency |
| TLS | Transport Layer Security |
| UI | User Interface |

## Technical Terms in Indonesian

| English | Indonesian | Description |
|---------|-----------|-------------|
| Positive | Positif | Favorable sentiment |
| Negative | Negatif | Unfavorable sentiment |
| Analysis | Analisis | Examination of data |
| Library | Perpustakaan | Collection of words |
| Stemming | Stemming/Pencarian Akar Kata | Finding root words |
| Tweet | Cuitan | Social media post |

## Related Concepts

**Confusion Matrix**  
Table showing classifier performance (true positives, false positives, etc.).

**Precision**  
Percentage of positive predictions that are actually positive.

**Recall**  
Percentage of actual positives that were correctly identified.

**F1 Score**  
Harmonic mean of precision and recall, measuring classifier accuracy.

**Training Set**  
Data used to train the machine learning model (word libraries).

**Test Set**  
Data used to evaluate model performance (tweets being analyzed).

**Classification**  
Process of categorizing text into predefined classes (positive/negative).

**Feature Extraction**  
Converting text into numerical features for machine learning (TF-IDF).

**Stop Words**  
Common words filtered out during preprocessing (e.g., "yang", "dan").

## See Also

- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [API Documentation](../api-reference/RAW_DATA_ANALYSIS_API.md)
- [FAQ](FAQ.md)

---

**Last Updated**: November 12, 2025
