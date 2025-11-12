const { getDb } = require('../config/mysql-database');

/**
 * Get comprehensive analysis insights including charts, word clouds, and statistics
 * GET /api/analysis-history/:analysisId/insights
 */
async function getAnalysisInsightsHandler(req, res) {
  try {
    const userId = req.user.userId;
    const { analysisId } = req.params;
    
    const db = getDb();
    
    // Get analysis info
    const [analysisInfo] = await db.execute(`
      SELECT 
        id, user_id, session_id, session_name, analysis_type,
        source_description, total_items, processed_items, 
        training_samples, results, status, processing_time_ms,
        created_at, completed_at
      FROM analysis_history 
      WHERE id = ? AND user_id = ?
    `, [analysisId, userId]);
    
    if (analysisInfo.length === 0) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }
    
    const analysis = analysisInfo[0];
    
    // Get all raw data for this analysis
    const [rawDataResults] = await db.execute(`
      SELECT 
        clean_text, predicted_sentiment, prediction_confidence,
        is_training_sample, raw_data
      FROM raw_twitter_data 
      WHERE session_id = ?
      ORDER BY id
    `, [analysis.session_id]);
    
    // Parse results to get sentiment distribution
    let sentimentDistribution = { positive: 0, negative: 0, neutral: 0 };
    try {
      const results = JSON.parse(analysis.results || '{}');
      if (results.sentimentDistribution) {
        // Handle nested sentimentDistribution (library analysis)
        const dist = results.sentimentDistribution;
        sentimentDistribution = {
          positive: parseInt(dist.positive || dist.Positive || 0),
          negative: parseInt(dist.negative || dist.Negative || 0),
          neutral: parseInt(dist.neutral || dist.Neutral || 0)
        };
      } else if (results.positive !== undefined || results.Positive !== undefined) {
        // Handle direct sentiment counts format (both lowercase and capitalized)
        sentimentDistribution = {
          positive: parseInt(results.positive || results.Positive || 0),
          negative: parseInt(results.negative || results.Negative || 0),
          neutral: parseInt(results.neutral || results.Neutral || 0)
        };
      }
      
      console.log('📊 Sentiment distribution parsed:', sentimentDistribution);
    } catch (error) {
      console.error('Error parsing analysis results:', error);
    }
    
    // Generate comprehensive insights
    const insights = await generateAnalysisInsights(rawDataResults, sentimentDistribution, analysis);
    
    res.json({
      success: true,
      analysis: {
        id: analysis.id,
        session_id: analysis.session_id,
        session_name: analysis.session_name,
        analysis_type: analysis.analysis_type,
        source_description: analysis.source_description,
        total_items: analysis.total_items,
        processed_items: analysis.processed_items,
        training_samples: analysis.training_samples,
        status: analysis.status,
        processing_time_ms: analysis.processing_time_ms,
        created_at: analysis.created_at,
        completed_at: analysis.completed_at
      },
      insights
    });
    
  } catch (error) {
    console.error('Error in getAnalysisInsightsHandler:', error);
    res.status(500).json({ 
      error: 'Failed to load analysis insights',
      details: error.message 
    });
  }
}

/**
 * Generate comprehensive analysis insights
 */
async function generateAnalysisInsights(rawData, sentimentDistribution, analysis) {
  const insights = {
    // Basic statistics
    statistics: {
      total_items: rawData.length,
      sentiment_distribution: sentimentDistribution,
      accuracy_metrics: calculateAccuracyMetrics(rawData),
      confidence_stats: calculateConfidenceStats(rawData),
      text_length_stats: calculateTextLengthStats(rawData)
    },
    
    // Chart data
    charts: {
      sentiment_pie: generateSentimentPieChart(sentimentDistribution),
      confidence_histogram: generateConfidenceHistogram(rawData),
      text_length_distribution: generateTextLengthDistribution(rawData),
      sentiment_over_time: generateSentimentOverTime(rawData),
      training_vs_prediction: generateTrainingVsPredictionChart(rawData)
    },
    
    // Word analysis
    word_analysis: {
      word_counts: generateWordCounts(rawData),
      word_cloud_data: generateWordCloudData(rawData),
      sentiment_keywords: generateSentimentKeywords(rawData),
      ngram_analysis: generateNgramAnalysis(rawData)
    },
    
    // Advanced insights
    advanced_insights: {
      sentiment_patterns: analyzeSentimentPatterns(rawData),
      text_complexity: analyzeTextComplexity(rawData),
      prediction_quality: analyzePredictionQuality(rawData)
    }
  };
  
  return insights;
}

// Statistics calculation functions
function calculateAccuracyMetrics(rawData) {
  const trainingData = rawData.filter(item => item.is_training_sample);
  if (trainingData.length === 0) {
    return { message: 'No training data available for accuracy calculation' };
  }
  
  // For training data, we could compare manual labels with predictions
  return {
    training_samples: trainingData.length,
    prediction_samples: rawData.length - trainingData.length,
    average_confidence: rawData.reduce((sum, item) => sum + (item.prediction_confidence || 0), 0) / rawData.length
  };
}

function calculateConfidenceStats(rawData) {
  const confidenceScores = rawData
    .map(item => item.prediction_confidence || 0)
    .filter(score => score > 0);
  
  console.log(`📊 Confidence calculation: ${confidenceScores.length} items with confidence > 0 out of ${rawData.length} total`);
  if (confidenceScores.length > 0) {
    console.log(`   Sample confidences: ${confidenceScores.slice(0, 5).join(', ')}`);
    console.log(`   Types: ${confidenceScores.slice(0, 3).map(s => typeof s).join(', ')}`);
  }
  
  if (confidenceScores.length === 0) {
    return { message: 'No confidence scores available' };
  }
  
  // Convert to numbers in case they're strings
  const numericScores = confidenceScores.map(score => parseFloat(score));
  numericScores.sort((a, b) => a - b);
  
  const sum = numericScores.reduce((acc, score) => acc + score, 0);
  const mean = sum / numericScores.length;
  
  console.log(`   Sum: ${sum}, Count: ${numericScores.length}, Mean: ${mean}`);
  
  return {
    min: numericScores[0],
    max: numericScores[numericScores.length - 1],
    mean: mean,
    median: numericScores[Math.floor(numericScores.length / 2)],
    std_dev: calculateStandardDeviation(numericScores)
  };
}

function calculateTextLengthStats(rawData) {
  const lengths = rawData.map(item => (item.clean_text || '').length);
  lengths.sort((a, b) => a - b);
  
  return {
    min: lengths[0] || 0,
    max: lengths[lengths.length - 1] || 0,
    mean: lengths.reduce((sum, len) => sum + len, 0) / lengths.length,
    median: lengths[Math.floor(lengths.length / 2)] || 0
  };
}

// Chart generation functions
function generateSentimentPieChart(sentimentDistribution) {
  return {
    type: 'pie',
    labels: ['Positive', 'Negative', 'Neutral'],
    datasets: [{
      data: [
        sentimentDistribution.positive,
        sentimentDistribution.negative,
        sentimentDistribution.neutral
      ],
      backgroundColor: ['#4CAF50', '#F44336', '#FFC107'],
      borderWidth: 2
    }]
  };
}

function generateConfidenceHistogram(rawData) {
  const confidenceScores = rawData
    .map(item => item.prediction_confidence || 0)
    .filter(score => score > 0);
  
  // Create bins for histogram
  const bins = Array(10).fill(0);
  confidenceScores.forEach(score => {
    const binIndex = Math.min(Math.floor(score * 10), 9);
    bins[binIndex]++;
  });
  
  return {
    type: 'bar',
    labels: ['0.0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', 
             '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'],
    datasets: [{
      label: 'Number of Predictions',
      data: bins,
      backgroundColor: '#2196F3',
      borderColor: '#1976D2',
      borderWidth: 1
    }]
  };
}

function generateTextLengthDistribution(rawData) {
  const lengths = rawData.map(item => (item.clean_text || '').length);
  
  // Create bins for text length distribution
  const maxLength = Math.max(...lengths);
  const binSize = Math.ceil(maxLength / 20);
  const bins = Array(20).fill(0);
  
  lengths.forEach(length => {
    const binIndex = Math.min(Math.floor(length / binSize), 19);
    bins[binIndex]++;
  });
  
  const labels = bins.map((_, index) => {
    const start = index * binSize;
    const end = (index + 1) * binSize;
    return `${start}-${end}`;
  });
  
  return {
    type: 'bar',
    labels,
    datasets: [{
      label: 'Number of Texts',
      data: bins,
      backgroundColor: '#9C27B0',
      borderColor: '#7B1FA2',
      borderWidth: 1
    }]
  };
}

function generateSentimentOverTime(rawData) {
  // Group by batches of 1000 for trend analysis
  const batchSize = 1000;
  const batches = [];
  
  for (let i = 0; i < rawData.length; i += batchSize) {
    const batch = rawData.slice(i, i + batchSize);
    const sentiments = { positive: 0, negative: 0, neutral: 0 };
    
    batch.forEach(item => {
      if (item.predicted_sentiment) {
        const sentimentKey = item.predicted_sentiment.toLowerCase();
        if (sentiments[sentimentKey] !== undefined) {
          sentiments[sentimentKey]++;
        }
      }
    });
    
    batches.push({
      batch: Math.floor(i / batchSize) + 1,
      ...sentiments
    });
  }
  
  return {
    type: 'line',
    labels: batches.map(b => `Batch ${b.batch}`),
    datasets: [
      {
        label: 'Positive',
        data: batches.map(b => b.positive),
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        tension: 0.4
      },
      {
        label: 'Negative', 
        data: batches.map(b => b.negative),
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        tension: 0.4
      },
      {
        label: 'Neutral',
        data: batches.map(b => b.neutral),
        borderColor: '#FFC107',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        tension: 0.4
      }
    ]
  };
}

function generateTrainingVsPredictionChart(rawData) {
  const training = rawData.filter(item => item.is_training_sample);
  const predictions = rawData.filter(item => !item.is_training_sample);
  
  const trainingCounts = { positive: 0, negative: 0, neutral: 0 };
  const predictionCounts = { positive: 0, negative: 0, neutral: 0 };
  
  training.forEach(item => {
    if (item.predicted_sentiment) {
      const sentimentKey = item.predicted_sentiment.toLowerCase();
      if (trainingCounts[sentimentKey] !== undefined) {
        trainingCounts[sentimentKey]++;
      }
    }
  });
  
  predictions.forEach(item => {
    if (item.predicted_sentiment) {
      const sentimentKey = item.predicted_sentiment.toLowerCase();
      if (predictionCounts[sentimentKey] !== undefined) {
        predictionCounts[sentimentKey]++;
      }
    }
  });
  
  return {
    type: 'bar',
    labels: ['Positive', 'Negative', 'Neutral'],
    datasets: [
      {
        label: 'Training Data',
        data: [trainingCounts.positive, trainingCounts.negative, trainingCounts.neutral],
        backgroundColor: '#673AB7',
        borderColor: '#512DA8',
        borderWidth: 1
      },
      {
        label: 'Predictions',
        data: [predictionCounts.positive, predictionCounts.negative, predictionCounts.neutral],
        backgroundColor: '#03A9F4',
        borderColor: '#0288D1',
        borderWidth: 1
      }
    ]
  };
}

// Word analysis functions
function generateWordCounts(rawData) {
  const wordCounts = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their']);
  
  rawData.forEach(item => {
    const text = (item.clean_text || '').toLowerCase();
    const words = text.match(/\b\w+\b/g) || [];
    
    words.forEach(word => {
      if (word.length > 2 && !stopWords.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });
  });
  
  // Return top 50 words
  return Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));
}

function generateWordCloudData(rawData) {
  const wordCounts = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their']);
  
  rawData.forEach(item => {
    const text = (item.clean_text || '').toLowerCase();
    const words = text.match(/\b\w+\b/g) || [];
    
    words.forEach(word => {
      if (word.length > 2 && !stopWords.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });
  });
  
  // Return top 100 words with size based on frequency
  const maxCount = Math.max(...Object.values(wordCounts));
  return Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 100)
    .map(([text, count]) => ({
      text,
      size: Math.max(12, Math.min(48, (count / maxCount) * 48))
    }));
}

function generateSentimentKeywords(rawData) {
  const sentimentWords = {
    positive: {},
    negative: {},
    neutral: {}
  };
  
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  
  rawData.forEach(item => {
    const sentiment = item.predicted_sentiment;
    if (!sentiment) return;
    
    // Convert database sentiment values to lowercase keys
    const sentimentKey = sentiment.toLowerCase();
    if (!sentimentWords[sentimentKey]) return; // Skip if invalid sentiment
    
    const text = (item.clean_text || '').toLowerCase();
    const words = text.match(/\b\w+\b/g) || [];
    
    words.forEach(word => {
      if (word.length > 2 && !stopWords.has(word)) {
        sentimentWords[sentimentKey][word] = (sentimentWords[sentimentKey][word] || 0) + 1;
      }
    });
  });
  
  // Get top 20 words for each sentiment
  const result = {};
  Object.keys(sentimentWords).forEach(sentiment => {
    result[sentiment] = Object.entries(sentimentWords[sentiment])
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
  });
  
  return result;
}

function generateNgramAnalysis(rawData) {
  const bigrams = {};
  const trigrams = {};
  
  rawData.slice(0, 1000).forEach(item => { // Limit for performance
    const text = (item.clean_text || '').toLowerCase();
    const words = text.match(/\b\w+\b/g) || [];
    
    // Generate bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
    
    // Generate trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      trigrams[trigram] = (trigrams[trigram] || 0) + 1;
    }
  });
  
  return {
    bigrams: Object.entries(bigrams)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([ngram, count]) => ({ ngram, count })),
    trigrams: Object.entries(trigrams)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([ngram, count]) => ({ ngram, count }))
  };
}

// Advanced analysis functions
function analyzeSentimentPatterns(rawData) {
  // Analyze patterns in sentiment predictions
  const patterns = {
    consecutive_sentiments: analyzeConsecutiveSentiments(rawData),
    sentiment_transitions: analyzeSentimentTransitions(rawData),
    confidence_by_sentiment: analyzeConfidenceBySentiment(rawData)
  };
  
  return patterns;
}

function analyzeConsecutiveSentiments(rawData) {
  const sequences = {};
  let currentSentiment = null;
  let currentCount = 0;
  
  rawData.forEach(item => {
    if (item.predicted_sentiment === currentSentiment) {
      currentCount++;
    } else {
      if (currentSentiment && currentCount > 1) {
        const key = `${currentSentiment}_${currentCount}`;
        sequences[key] = (sequences[key] || 0) + 1;
      }
      currentSentiment = item.predicted_sentiment;
      currentCount = 1;
    }
  });
  
  return sequences;
}

function analyzeSentimentTransitions(rawData) {
  const transitions = {};
  
  for (let i = 0; i < rawData.length - 1; i++) {
    const from = rawData[i].predicted_sentiment;
    const to = rawData[i + 1].predicted_sentiment;
    
    if (from && to) {
      const transition = `${from}_to_${to}`;
      transitions[transition] = (transitions[transition] || 0) + 1;
    }
  }
  
  return transitions;
}

function analyzeConfidenceBySentiment(rawData) {
  const confidenceBySentiment = {
    positive: [],
    negative: [],
    neutral: []
  };
  
  rawData.forEach(item => {
    if (item.predicted_sentiment && item.prediction_confidence) {
      const sentimentKey = item.predicted_sentiment.toLowerCase();
      if (confidenceBySentiment[sentimentKey]) {
        confidenceBySentiment[sentimentKey].push(item.prediction_confidence);
      }
    }
  });
  
  // Calculate stats for each sentiment
  Object.keys(confidenceBySentiment).forEach(sentiment => {
    const scores = confidenceBySentiment[sentiment];
    if (scores.length > 0) {
      scores.sort((a, b) => a - b);
      confidenceBySentiment[sentiment] = {
        count: scores.length,
        mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        median: scores[Math.floor(scores.length / 2)],
        min: scores[0],
        max: scores[scores.length - 1]
      };
    }
  });
  
  return confidenceBySentiment;
}

function analyzeTextComplexity(rawData) {
  const complexity = {
    avg_word_length: 0,
    avg_sentence_length: 0,
    vocabulary_richness: 0
  };
  
  let totalWords = 0;
  let totalChars = 0;
  let totalSentences = 0;
  const uniqueWords = new Set();
  
  rawData.forEach(item => {
    const text = item.clean_text || '';
    const words = text.match(/\b\w+\b/g) || [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    totalWords += words.length;
    totalChars += words.join('').length;
    totalSentences += sentences.length;
    
    words.forEach(word => uniqueWords.add(word.toLowerCase()));
  });
  
  if (totalWords > 0) {
    complexity.avg_word_length = totalChars / totalWords;
    complexity.avg_sentence_length = totalWords / Math.max(totalSentences, 1);
    complexity.vocabulary_richness = uniqueWords.size / totalWords;
  }
  
  return complexity;
}

function analyzePredictionQuality(rawData) {
  const confidenceScores = rawData
    .map(item => item.prediction_confidence || 0)
    .filter(score => score > 0);
  
  if (confidenceScores.length === 0) {
    return { message: 'No confidence scores available' };
  }
  
  const highConfidence = confidenceScores.filter(score => score > 0.8).length;
  const mediumConfidence = confidenceScores.filter(score => score > 0.6 && score <= 0.8).length;
  const lowConfidence = confidenceScores.filter(score => score <= 0.6).length;
  
  return {
    high_confidence_predictions: highConfidence,
    medium_confidence_predictions: mediumConfidence,
    low_confidence_predictions: lowConfidence,
    confidence_distribution: {
      high: (highConfidence / confidenceScores.length) * 100,
      medium: (mediumConfidence / confidenceScores.length) * 100,
      low: (lowConfidence / confidenceScores.length) * 100
    }
  };
}

// Utility functions
function calculateStandardDeviation(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
  const avgSquaredDiff = squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

module.exports = {
  getAnalysisInsightsHandler
};