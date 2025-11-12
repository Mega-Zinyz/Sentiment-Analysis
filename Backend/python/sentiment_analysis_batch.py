#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import argparse
import os
import numpy as np

# Set UTF-8 encoding for stdout/stderr on Windows
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import cross_val_score
import re
import spacy

# Load spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
    spacy_available = True
except OSError:
    spacy_available = False
    nlp = None

# Sastrawi for Indonesian stemming
try:
    from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
    sastrawi_available = True
    factory = StemmerFactory()
    stemmer = factory.create_stemmer()
except ImportError:
    sastrawi_available = False
    stemmer = None

# Enhanced Indonesian stopwords (same as in main script)
INDONESIAN_STOPWORDS = set([
    'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'untuk', 'dengan', 'pada', 
    'adalah', 'atau', 'juga', 'tidak', 'sudah', 'karena', 'jadi', 'oleh', 'sebagai', 
    'akan', 'dalam', 'bagi', 'lebih', 'lagi', 'agar', 'supaya', 'sehingga', 
    'sebelum', 'sesudah', 'setelah', 'tanpa', 'selama', 'seluruh', 'semua', 'saja', 
    'masih', 'telah', 'bahwa', 'atas', 'antara', 'mereka', 'kami', 'kita', 'anda', 
    'saya', 'aku', 'dia', 'ia', 'kau', 'mu', 'ku', 'nya', 'pun', 'lah', 'punya', 
    'apa', 'siapa', 'bagaimana', 'mengapa', 'dimana', 'kapan', 'berapa', 'dapat', 
    'bisa', 'harus', 'boleh', 'mau', 'ingin', 'perlu', 'ada', 'buat', 'guna', 
    'terhadap', 'kepada', 'tentang', 'seperti', 'hingga', 'sebab', 'dg', 'dgn', 
    'rt', 'via', 'amp', 'co', 'id', 'com', 'www', 'http', 'https'
])

class BatchSentimentAnalyzer:
    def __init__(self):
        self.use_spacy = spacy_available
        self.use_sastrawi = sastrawi_available
        
        # Create pipeline with TfidfVectorizer and MultinomialNB
        self.pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(
                max_features=5000,
                stop_words=list(INDONESIAN_STOPWORDS),
                ngram_range=(1, 2),
                lowercase=True,
                strip_accents='unicode',
                token_pattern=r'\b[a-zA-Z][a-zA-Z0-9]*\b'
            )),
            ('classifier', MultinomialNB(alpha=1.0))
        ])
        
    def spacy_process(self, text):
        """Process text using spaCy for advanced preprocessing"""
        if not self.use_spacy or not text:
            return text
        
        try:
            doc = nlp(text)
            
            # Extract tokens, filtering out punctuation, spaces, and stop words
            tokens = []
            for token in doc:
                # Skip punctuation, spaces, and numbers
                if token.is_punct or token.is_space or token.like_num:
                    continue
                    
                # Skip if it's a stop word (English) or in our Indonesian stopwords
                if token.is_stop or token.lemma_.lower() in INDONESIAN_STOPWORDS:
                    continue
                    
                # Use lemma (root form) if available, otherwise use token text
                lemma = token.lemma_.lower() if token.lemma_ != "-PRON-" else token.text.lower()
                
                # Only include meaningful tokens (length > 2)
                if len(lemma) > 2:
                    tokens.append(lemma)
            
            return ' '.join(tokens)
            
        except Exception as e:
            print(f"spaCy processing error: {e}", file=sys.stderr)
            return text
    
    def stem_text(self, text):
        """Apply Indonesian stemming using Sastrawi"""
        if self.use_sastrawi and text:
            try:
                return stemmer.stem(text)
            except Exception as e:
                print(f"Stemming error: {e}", file=sys.stderr)
                return text
        return text
    
    def preprocess_text(self, text):
        """Enhanced preprocessing with spaCy and Sastrawi"""
        if not text:
            return ""
        
        # Step 1: Basic cleaning
        text = text.lower()
        
        # Remove URLs
        text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
        
        # Remove mentions and hashtags
        text = re.sub(r'@\w+|#\w+', '', text)
        
        # Remove RT markers
        text = re.sub(r'\brt\b', '', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Step 2: spaCy advanced processing (if available)
        if self.use_spacy:
            text = self.spacy_process(text)
        else:
            # Fallback: manual stopword removal
            words = text.split()
            filtered_words = [word for word in words if word.lower() not in INDONESIAN_STOPWORDS]
            text = ' '.join(filtered_words)
        
        # Step 3: Indonesian stemming
        text = self.stem_text(text)
        
        # Step 4: Final cleanup
        text = re.sub(r'[^a-zA-Z\s]', '', text)  # Remove non-alphabetic chars
        text = re.sub(r'\s+', ' ', text).strip()  # Normalize whitespace
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def train(self, training_data):
        """Train the model on labeled data"""
        try:
            if not training_data or len(training_data) == 0:
                raise ValueError("No training data provided")
            
            # Extract texts and labels
            texts = []
            labels = []
            
            for item in training_data:
                if 'text' not in item or 'label' not in item:
                    continue
                
                text = self.preprocess_text(item['text'])
                if len(text) > 0:
                    texts.append(text)
                    labels.append(item['label'])
            
            if len(texts) == 0:
                raise ValueError("No valid training texts found")
            
            print(f"Training on {len(texts)} samples")
            print(f"Label distribution: {dict(zip(*np.unique(labels, return_counts=True)))}")
            
            # Train the pipeline
            self.pipeline.fit(texts, labels)
            
            # Calculate training accuracy
            train_predictions = self.pipeline.predict(texts)
            train_accuracy = accuracy_score(labels, train_predictions)
            
            # Perform cross-validation
            try:
                cv_scores = cross_val_score(self.pipeline, texts, labels, cv=min(3, len(texts)//2))
                cv_mean = np.mean(cv_scores)
                cv_std = np.std(cv_scores)
            except:
                cv_mean = cv_std = 0
            
            # Generate classification report
            try:
                class_report = classification_report(labels, train_predictions, output_dict=True)
            except:
                class_report = {}
            
            metrics = {
                'training_accuracy': float(train_accuracy),
                'cross_validation_mean': float(cv_mean),
                'cross_validation_std': float(cv_std),
                'training_samples': len(texts),
                'classification_report': class_report
            }
            
            print(f"Training completed. Accuracy: {train_accuracy:.4f}")
            print(f"Cross-validation: {cv_mean:.4f} (+/- {cv_std * 2:.4f})")
            
            return metrics
            
        except Exception as e:
            print(f"Error during training: {str(e)}", file=sys.stderr)
            raise
    
    def predict(self, texts):
        """Predict sentiment for a list of texts"""
        try:
            if not hasattr(self.pipeline, 'predict'):
                raise ValueError("Model not trained. Call train() first.")
            
            # Preprocess texts
            processed_texts = [self.preprocess_text(text) for text in texts]
            
            # Filter out empty texts
            valid_indices = [i for i, text in enumerate(processed_texts) if len(text) > 0]
            valid_texts = [processed_texts[i] for i in valid_indices]
            
            if len(valid_texts) == 0:
                print("Warning: No valid texts for prediction", file=sys.stderr)
                return []
            
            print(f"Predicting sentiment for {len(valid_texts)} texts")
            
            # Get predictions and probabilities
            predictions = self.pipeline.predict(valid_texts)
            probabilities = self.pipeline.predict_proba(valid_texts)
            
            # Combine results
            results = []
            valid_idx = 0
            
            for i, text in enumerate(processed_texts):
                if len(text) > 0:
                    pred = predictions[valid_idx]
                    proba = probabilities[valid_idx]
                    confidence = float(max(proba))
                    
                    results.append({
                        'text': texts[i],
                        'label': pred,
                        'confidence': confidence,
                        'probabilities': {
                            label: float(prob) 
                            for label, prob in zip(self.pipeline.classes_, proba)
                        }
                    })
                    valid_idx += 1
                else:
                    # Return neutral for empty texts
                    results.append({
                        'text': texts[i],
                        'label': 'neutral',
                        'confidence': 0.33,
                        'probabilities': {'positive': 0.33, 'negative': 0.33, 'neutral': 0.34}
                    })
            
            print(f"Prediction completed for {len(results)} items")
            return results
            
        except Exception as e:
            print(f"Error during prediction: {str(e)}", file=sys.stderr)
            raise

def main():
    parser = argparse.ArgumentParser(description='Batch Sentiment Analysis')
    parser.add_argument('--train-file', required=True, help='JSON file with training data')
    parser.add_argument('--predict-file', required=True, help='JSON file with texts to predict')
    parser.add_argument('--output-file', required=True, help='Output JSON file for results')
    
    args = parser.parse_args()
    
    try:
        # Check if files exist
        if not os.path.exists(args.train_file):
            raise FileNotFoundError(f"Training file not found: {args.train_file}")
        
        if not os.path.exists(args.predict_file):
            raise FileNotFoundError(f"Prediction file not found: {args.predict_file}")
        
        # Load training data
        print(f"Loading training data from {args.train_file}")
        with open(args.train_file, 'r', encoding='utf-8') as f:
            training_data = json.load(f)
        
        # Load prediction texts
        print(f"Loading prediction texts from {args.predict_file}")
        with open(args.predict_file, 'r', encoding='utf-8') as f:
            prediction_texts = json.load(f)
        
        # Validate inputs
        if not isinstance(training_data, list) or len(training_data) == 0:
            raise ValueError("Training data must be a non-empty list")
        
        if not isinstance(prediction_texts, list) or len(prediction_texts) == 0:
            raise ValueError("Prediction texts must be a non-empty list")
        
        print(f"Loaded {len(training_data)} training samples and {len(prediction_texts)} texts for prediction")
        
        # Create analyzer and train
        analyzer = BatchSentimentAnalyzer()
        print(f"🔧 spaCy available: {analyzer.use_spacy}")
        print(f"🔧 Sastrawi available: {analyzer.use_sastrawi}")
        metrics = analyzer.train(training_data)
        
        # Make predictions
        predictions = analyzer.predict(prediction_texts)
        
        # Prepare results
        results = {
            'metrics': metrics,
            'predictions': predictions,
            'summary': {
                'total_predictions': len(predictions),
                'sentiment_distribution': {}
            }
        }
        
        # Calculate sentiment distribution
        sentiment_counts = {}
        for pred in predictions:
            label = pred['label']
            sentiment_counts[label] = sentiment_counts.get(label, 0) + 1
        
        results['summary']['sentiment_distribution'] = sentiment_counts
        
        # Save results
        print(f"Saving results to {args.output_file}")
        with open(args.output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print("Analysis completed successfully!")
        print(f"Sentiment distribution: {sentiment_counts}")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)