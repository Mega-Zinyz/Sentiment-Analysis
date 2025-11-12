# Raw Twitter Data Sentiment Analysis

This system allows you to analyze sentiment from raw Twitter data by automatically cleaning it, manually labeling training samples, and then predicting sentiment for the remaining data.

## Workflow Overview

1. **Upload Raw Data** - Input raw Twitter data in the specified format
2. **Data Cleaning** - System automatically extracts and cleans the message text
3. **Manual Labeling** - Label 15 samples (5 positive, 5 negative, 5 neutral) for training
4. **Sentiment Analysis** - Train model and predict sentiment for remaining data
5. **View Results** - Display analysis results with predictions

## API Endpoints

### 1. Upload Raw Data

**POST** `/api/raw-data/upload`

Upload and process raw Twitter data.

**Request Body:**
```json
{
  "rawDataArray": [
    "2022-03-31 14:32:04+00:00 pikobar_jabar Ketahui informasi pembagian #PPKM di wilayah Jabar berdasarkan level 3, 2 dan 1 di #PikoData https://t.co/o2RnI7eDue 1",
    "2022-03-31 09:26:00+00:00 inewsdotid \"Tempat Ibadah di Wilayah PPKM Level 1 Boleh Berkapasitas 100 Persen. Baca Selengkapnya di https://t.co/JfIG6nIimN\" #Ramadhan #PPKM #inews https://t.co/ky1G5xYLQB\" 1"
  ],
  "sessionName": "ppkm_analysis_session"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully processed 20 items",
  "sessionId": "ppkm_analysis_session_1698765432",
  "stats": {
    "totalInput": 25,
    "validAfterProcessing": 20,
    "filtered": 5,
    "readyForLabeling": true
  },
  "nextStep": "Label 15 training samples (5 positive, 5 negative, 5 neutral)"
}
```

### 2. Get Sessions

**GET** `/api/raw-data/sessions`

Get all sessions for the current user.

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "ppkm_analysis_session_1698765432",
      "total_items": 20,
      "labeled_items": 15,
      "predicted_items": 5,
      "status": "ready_for_analysis",
      "can_analyze": true,
      "created_at": "2024-10-30T10:00:00Z"
    }
  ]
}
```

### 3. Get Labeling Data

**GET** `/api/raw-data/labeling/:sessionId`

Get unlabeled data for manual labeling.

**Response:**
```json
{
  "success": true,
  "sessionId": "ppkm_analysis_session_1698765432",
  "unlabeledData": [
    {
      "id": 1,
      "clean_text": "ketahui informasi pembagian ppkm wilayah jabar berdasarkan level",
      "raw_data": "2022-03-31 14:32:04+00:00 pikobar_jabar Ketahui informasi...",
      "timestamp_extracted": "2022-03-31T14:32:04.000Z",
      "username_extracted": "pikobar_jabar"
    }
  ],
  "currentLabels": {
    "Positive": 0,
    "Negative": 0,
    "Neutral": 0
  },
  "needsLabeling": {
    "Positive": 5,
    "Negative": 5,
    "Neutral": 5
  },
  "totalNeeded": 15
}
```

### 4. Submit Labels

**POST** `/api/raw-data/labeling/:sessionId`

Submit manual labels for training data.

**Request Body:**
```json
{
  "labels": [
    {"id": 1, "sentiment_label": "Neutral"},
    {"id": 2, "sentiment_label": "Positive"},
    {"id": 3, "sentiment_label": "Negative"}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully labeled 3 items",
  "currentLabels": {
    "Positive": 1,
    "Negative": 1,
    "Neutral": 1
  },
  "totalLabeled": 3,
  "isComplete": false,
  "nextStep": "Continue labeling remaining samples"
}
```

### 5. Analyze Sentiment

**POST** `/api/raw-data/analyze/:sessionId`

Train model and predict sentiment for remaining data.

**Response:**
```json
{
  "success": true,
  "message": "Sentiment analysis completed successfully",
  "sessionId": "ppkm_analysis_session_1698765432",
  "modelMetrics": {
    "training_accuracy": 0.9333,
    "cross_validation_mean": 0.8667,
    "training_samples": 15
  },
  "analysisStats": {
    "totalItems": 20,
    "trainingSamples": 15,
    "predictedItems": 5,
    "sentimentDistribution": {
      "positive": 2,
      "negative": 1,
      "neutral": 2
    },
    "averageConfidence": "0.7245"
  }
}
```

### 6. Get Analysis Results

**GET** `/api/raw-data/results/:sessionId`

Get analysis results with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sentiment_filter` - Filter by sentiment (Positive, Negative, Neutral)
- `confidence_min` - Minimum confidence threshold

**Response:**
```json
{
  "success": true,
  "sessionId": "ppkm_analysis_session_1698765432",
  "data": [
    {
      "id": 1,
      "clean_text": "ketahui informasi pembagian ppkm wilayah jabar",
      "sentiment_label": "Neutral",
      "is_training_sample": true,
      "predicted_sentiment": null,
      "prediction_confidence": null
    },
    {
      "id": 16,
      "clean_text": "tempat ibadah wilayah ppkm level boleh berkapasitas persen",
      "sentiment_label": null,
      "is_training_sample": false,
      "predicted_sentiment": "Positive",
      "prediction_confidence": 0.7234
    }
  ],
  "statistics": {
    "total": 20,
    "trainingSamples": 15,
    "predictedItems": 5,
    "sentimentDistribution": {
      "positive": 2,
      "negative": 1,
      "neutral": 2
    }
  }
}
```

### 7. Export Results

**GET** `/api/raw-data/export/:sessionId`

Export analysis results as CSV file.

**Response:** CSV file download

## Raw Data Format

The system expects raw Twitter data in this format:
```
"YYYY-MM-DD HH:MM:SS+TZ username message_text number"
```

**Example:**
```
"2022-03-31 14:32:04+00:00 pikobar_jabar Ketahui informasi pembagian #PPKM di wilayah Jabar berdasarkan level 3, 2 dan 1 di #PikoData https://t.co/o2RnI7eDue 1"
```

## Data Processing

The system automatically:
1. **Parses** timestamp, username, and message from raw data
2. **Cleans** message text by removing:
   - URLs (http/https links, t.co links)
   - @mentions
   - Hashtag symbols (keeps text)
   - Extra quotes and whitespace
   - Retweet indicators (RT)
3. **Applies** Indonesian text preprocessing
4. **Filters** out empty or very short content

## Training Requirements

- **Minimum 20 data points** total (15 for training + 5 for prediction)
- **Exactly 15 training samples** required:
  - 5 Positive samples
  - 5 Negative samples  
  - 5 Neutral samples

## Error Handling

The system provides detailed error messages for:
- Invalid data format
- Insufficient data points
- Incomplete labeling
- Processing failures

## Usage Example

1. **Prepare your raw Twitter data** in the correct format
2. **Upload** using `/api/raw-data/upload`
3. **Get unlabeled data** using `/api/raw-data/labeling/:sessionId`
4. **Label 15 samples** using `/api/raw-data/labeling/:sessionId`
5. **Run analysis** using `/api/raw-data/analyze/:sessionId`
6. **View results** using `/api/raw-data/results/:sessionId`
7. **Export** using `/api/raw-data/export/:sessionId`

## Frontend Integration

The system is designed to work with your existing Angular frontend. You can create new components for:
- Raw data upload form
- Manual labeling interface
- Results visualization
- Progress tracking

## Authentication

All endpoints require authentication using JWT tokens through the existing auth system.