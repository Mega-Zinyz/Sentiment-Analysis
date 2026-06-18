#!/usr/bin/env python3

import sys
import json
import os
import csv
import re
import spacy
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report
import numpy as np
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory

# Load spaCy multilingual model (required)
try:
    nlp = spacy.load("xx_ent_wiki_sm")
except OSError:
    raise OSError(
        "spaCy model 'xx_ent_wiki_sm' tidak ditemukan. "
        "Jalankan: python -m spacy download xx_ent_wiki_sm"
    )

# Sastrawi Indonesian stemmer (required)
factory = StemmerFactory()
stemmer = factory.create_stemmer()

# Base Indonesian stopwords (Sastrawi-compatible)
_BASE_STOPWORDS = set([
    'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'untuk', 'dengan', 'pada',
    'adalah', 'atau', 'juga', 'tidak', 'sudah', 'karena', 'jadi', 'oleh', 'sebagai',
    'akan', 'dalam', 'bagi', 'lebih', 'lagi', 'agar', 'supaya', 'sehingga',
    'sebelum', 'sesudah', 'setelah', 'tanpa', 'selama', 'seluruh', 'semua', 'saja',
    'masih', 'telah', 'bahwa', 'atas', 'antara', 'mereka', 'kami', 'kita', 'anda',
    'saya', 'aku', 'dia', 'ia', 'kau', 'mu', 'ku', 'nya', 'pun', 'lah', 'punya',
    'apa', 'siapa', 'bagaimana', 'mengapa', 'dimana', 'kapan', 'berapa', 'dapat',
    'bisa', 'harus', 'boleh', 'mau', 'ingin', 'perlu', 'ada', 'buat', 'guna',
    'terhadap', 'kepada', 'tentang', 'seperti', 'hingga', 'sebab', 'dg', 'dgn',
    'rt', 'via', 'amp', 'co', 'id', 'com', 'www', 'http', 'https',
])

# Extra stopwords — URL fragments, abbreviations, and informal slang
_EXTRA_STOPWORDS = set([
    # URL & tracker fragments
    'com', 'http', 'https', 'www', 'dlvr', 'utm', 'bit', 'ly', 'goo', 'gl',
    'tco', 'pic', 'net', 'org', 'io',
    # Social-media noise
    'rt', 'amp', 'via',
    # Common informal abbreviations
    'yg', 'ga', 'gak', 'ngga', 'nggak', 'nya', 'dgn', 'dr', 'utk',
    'tdk', 'jd', 'aja', 'dpt', 'krn', 'spy', 'udh', 'udah', 'blm',
    'sm', 'jgn', 'klo', 'kl', 'tp', 'tpi', 'ttg', 'org',
    # Filler / interjections
    'sih', 'nih', 'deh', 'dong', 'kah', 'lho', 'loh', 'wah', 'nah',
    'hmm', 'hah', 'yah', 'ya', 'iya', 'oke',
    # Domain-specific noise (adjust per dataset)
    'ika', 'undip',
])

INDONESIAN_STOPWORDS = _BASE_STOPWORDS | _EXTRA_STOPWORDS

class IndonesianTextProcessor:
    def clean_text(self, text):
        if not isinstance(text, str):
            return ""
        text = text.lower()
        text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
        text = re.sub(r'@\w+|#\w+', '', text)
        text = re.sub(r'\brt\b', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def spacy_process(self, text):
        """Tokenisasi dan filtering menggunakan spaCy (xx_ent_wiki_sm)."""
        if not text:
            return text
        doc = nlp(text)
        tokens = []
        for token in doc:
            if token.is_punct or token.is_space or token.like_num:
                continue
            word = token.text.lower()
            if word in INDONESIAN_STOPWORDS:
                continue
            if len(word) > 2:
                tokens.append(word)
        return ' '.join(tokens)

    def stem_text(self, text):
        """Stemming bahasa Indonesia menggunakan Sastrawi."""
        if not text:
            return text
        try:
            return stemmer.stem(text)
        except Exception as e:
            print(f"Stemming error: {e}", file=sys.stderr)
            return text

    def preprocess(self, text):
        """Pipeline preprocessing: cleaning → spaCy tokenisasi → Sastrawi stemming."""
        # Tahap 1: Cleaning dasar
        text = self.clean_text(text)
        # Tahap 2: Tokenisasi & filter stopword dengan spaCy
        text = self.spacy_process(text)
        # Tahap 3: Stemming bahasa Indonesia dengan Sastrawi
        text = self.stem_text(text)
        # Tahap 4: Normalisasi akhir
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

class SentimentAnalyzer:
    def __init__(self):
        self.processor = IndonesianTextProcessor()
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),  # Include bigrams for better context
            min_df=2,  # Ignore terms that appear in less than 2 documents
            max_df=0.95  # Ignore terms that appear in more than 95% of documents
        )
        self.model = MultinomialNB(alpha=0.1)  # Smoothing parameter
        self.is_trained = False
        
    def load_training_data(self):
        """Load training data from CSV files"""
        train_texts = []
        train_labels = []
        
        # Try to load user training data first
        user_csv_path = os.path.join(os.path.dirname(__file__), 'train_data.csv')
        if os.path.exists(user_csv_path):
            try:
                with open(user_csv_path, encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        tweet = row.get('Tweet', '').strip()
                        label = row.get('Sentiment', '').strip().lower()
                        if tweet and label in ['positive', 'negative', 'neutral']:
                            train_texts.append(tweet)
                            train_labels.append(label)
                print(f"Loaded {len(train_texts)} samples from user training data", file=sys.stderr)
            except Exception as e:
                print(f"Error loading user training data: {e}", file=sys.stderr)
        
        # Load original dataset as backup/additional training data
        original_csv_path = os.path.join(os.path.dirname(__file__), 'dataset', 'INA_TweetsPPKM_Raw.csv')
        if os.path.exists(original_csv_path):
            try:
                with open(original_csv_path, encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        tweet = row.get('Tweet', '').strip()
                        # Check for sentiment column (might be added by add_sentiment_column.py)
                        label = row.get('Sentiment', '').strip().lower()
                        if tweet and label in ['positive', 'negative', 'neutral']:
                            train_texts.append(tweet)
                            train_labels.append(label)
                print(f"Loaded additional {len(train_texts) - len([t for t in train_labels if t])} samples from original dataset", file=sys.stderr)
            except Exception as e:
                print(f"Error loading original dataset: {e}", file=sys.stderr)
        
        # Fallback training data if no CSV data available
        if not train_texts:
            train_texts = [
                'saya sangat suka produk ini, kualitasnya luar biasa',
                'pelayanan yang memuaskan, terima kasih',
                'pengalaman berbelanja yang menyenangkan',
                'rekomendasi terbaik untuk semua orang',
                'saya kecewa dengan layanan ini',
                'produk tidak sesuai ekspektasi, mengecewakan',
                'pelayanan buruk dan tidak profesional',
                'pengalaman yang tidak menyenangkan',
                'produk standar, tidak ada yang istimewa',
                'layanan biasa saja, cukup memuaskan',
                'tidak buruk tapi juga tidak bagus',
                'sesuai dengan harga yang dibayar'
            ]
            train_labels = [
                'positive', 'positive', 'positive', 'positive',
                'negative', 'negative', 'negative', 'negative',
                'neutral', 'neutral', 'neutral', 'neutral'
            ]
            print("Using fallback training data", file=sys.stderr)
        
        return train_texts, train_labels
    
    def train(self):
        """Train the sentiment analysis model"""
        train_texts, train_labels = self.load_training_data()
        
        if not train_texts:
            raise ValueError("No training data available")
        
        # Preprocess training texts
        print("Preprocessing training data...", file=sys.stderr)
        processed_texts = [self.processor.preprocess(text) for text in train_texts]
        
        # Remove empty texts
        valid_data = [(text, label) for text, label in zip(processed_texts, train_labels) if text.strip()]
        processed_texts, train_labels = zip(*valid_data) if valid_data else ([], [])
        
        if not processed_texts:
            raise ValueError("No valid training data after preprocessing")
        
        # Train vectorizer and model
        print(f"Training model with {len(processed_texts)} samples...", file=sys.stderr)
        X_train = self.vectorizer.fit_transform(processed_texts)
        self.model.fit(X_train, train_labels)
        
        self.is_trained = True
        print("Model training completed", file=sys.stderr)
        
        # Print feature statistics
        print(f"Vocabulary size: {len(self.vectorizer.vocabulary_)}", file=sys.stderr)
        print(f"Training samples by sentiment: {dict(zip(*np.unique(train_labels, return_counts=True)))}", file=sys.stderr)
    
    def train_with_custom_data(self, custom_dataset):
        """Train the sentiment analysis model with custom user dataset"""
        train_texts = []
        train_labels = []
        
        # Parse custom dataset
        for item in custom_dataset:
            if isinstance(item, dict):
                tweet = item.get('Tweet', '').strip()
                label = item.get('Sentiment', '').strip().lower()
                if tweet and label in ['positive', 'negative', 'neutral']:
                    train_texts.append(tweet)
                    train_labels.append(label)
        
        # Add fallback data if custom dataset is too small
        if len(train_texts) < 10:
            print("Custom dataset too small, adding fallback data", file=sys.stderr)
            fallback_texts, fallback_labels = self.load_training_data()
            train_texts.extend(fallback_texts)
            train_labels.extend(fallback_labels)
        
        if not train_texts:
            raise ValueError("No valid training data available")
        
        # Preprocess training texts
        print(f"Preprocessing {len(train_texts)} training samples...", file=sys.stderr)
        processed_texts = [self.processor.preprocess(text) for text in train_texts]
        
        # Remove empty texts
        valid_data = [(text, label) for text, label in zip(processed_texts, train_labels) if text.strip()]
        processed_texts, train_labels = zip(*valid_data) if valid_data else ([], [])
        
        if not processed_texts:
            raise ValueError("No valid training data after preprocessing")
        
        # Train vectorizer and model
        print(f"Training model with {len(processed_texts)} samples...", file=sys.stderr)
        X_train = self.vectorizer.fit_transform(processed_texts)
        self.model.fit(X_train, train_labels)
        
        self.is_trained = True
        print("Custom model training completed", file=sys.stderr)
        
        # Print feature statistics
        print(f"Vocabulary size: {len(self.vectorizer.vocabulary_)}", file=sys.stderr)
        print(f"Training samples by sentiment: {dict(zip(*np.unique(train_labels, return_counts=True)))}", file=sys.stderr)
    
    def predict_sentiment(self, text):
        """Predict sentiment for a single text"""
        if not self.is_trained:
            self.train()
        
        if not text or not isinstance(text, str):
            return 'neutral'
        
        # Preprocess the text
        processed_text = self.processor.preprocess(text)
        
        if not processed_text.strip():
            return 'neutral'
        
        try:
            # Vectorize and predict
            X_test = self.vectorizer.transform([processed_text])
            prediction = self.model.predict(X_test)[0]
            
            # Get prediction probabilities for confidence
            probabilities = self.model.predict_proba(X_test)[0]
            confidence = float(max(probabilities))
            
            print(f"Prediction: {prediction}, Confidence: {confidence:.3f}", file=sys.stderr)
            
            # Return both prediction and confidence
            return {
                'label': prediction,
                'confidence': confidence
            }
            
        except Exception as e:
            print(f"Prediction error: {e}", file=sys.stderr)
            return {
                'label': 'neutral',
                'confidence': 0.33
            }

# Global analyzer instance
analyzer = SentimentAnalyzer()

def predict_sentiment(text):
    """Main prediction function for external use"""
    return analyzer.predict_sentiment(text)

def preprocess_text(text):
    """Text preprocessing function for external use"""
    processor = IndonesianTextProcessor()
    return processor.preprocess(text)

# For Node.js import
if __name__ != '__main__':
    import builtins
    builtins.predict_sentiment = predict_sentiment
    builtins.preprocess_text = preprocess_text

if __name__ == '__main__':
    # Support command line arguments
    if len(sys.argv) >= 3 and sys.argv[1] == '--preprocess':
        text = sys.argv[2]
        cleaned = preprocess_text(text)
        print(cleaned)
        sys.exit(0)
    
    if len(sys.argv) >= 3 and sys.argv[1] == '--train':
        try:
            analyzer.train()
            print(json.dumps({'status': 'success', 'message': 'Model trained successfully'}))
        except Exception as e:
            print(json.dumps({'status': 'error', 'message': str(e)}))
        sys.exit(0)
    
    # Default: stdin for sentiment prediction
    try:
        input_data = sys.stdin.read()
        data = json.loads(input_data)
        text = data.get('text', '')
        user_id = data.get('userId')
        user_dataset = data.get('dataset')
        dataset_name = data.get('datasetName', 'default')
        
        # Create analyzer instance with user-specific dataset
        analyzer = SentimentAnalyzer()
        
        # If user has custom dataset, use it for training
        if user_dataset and isinstance(user_dataset, list):
            print(f"Training with user dataset: {len(user_dataset)} samples", file=sys.stderr)
            analyzer.train_with_custom_data(user_dataset)
        else:
            print("Training with default dataset", file=sys.stderr)
            analyzer.train()
        
        prediction_result = analyzer.predict(text)
        
        # Handle both old format (string) and new format (dict with label and confidence)
        if isinstance(prediction_result, dict):
            sentiment = prediction_result['label']
            confidence = prediction_result['confidence']
        else:
            sentiment = prediction_result
            confidence = 0.0
        
        result = {
            'sentiment': sentiment,
            'confidence': confidence,
            'text': text,
            'processed': preprocess_text(text),
            'dataset_used': dataset_name,
            'user_id': user_id
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'sentiment': 'neutral',
            'text': data.get('text', '') if 'data' in locals() else ''
        }
        print(json.dumps(error_result))