#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Persistent sentiment analysis worker.

This script loads the ML model once at startup and then processes
batches via JSON messages on stdin/stdout. No file I/O overhead.

Protocol:
- Input: JSON line with {"type": "predict", "training_data": [...], "texts": [...]}
- Output: JSON line with {"type": "result", "predictions": [...]} or {"type": "error", "message": "..."}
- Control: {"type": "shutdown"} to gracefully exit
"""

import sys
import json
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import re
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

class SentimentWorker:
    def __init__(self):
        self.pipeline = None
        self.is_trained = False
        
    def preprocess_text(self, text):
        """Clean and preprocess text for analysis."""
        if not text or not isinstance(text, str):
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove URLs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Remove user mentions and hashtags but keep the text
        text = re.sub(r'@\w+', '', text)
        text = re.sub(r'#(\w+)', r'\1', text)
        
        # Remove special characters but keep letters, numbers, and spaces
        text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
        
        # Remove extra whitespaces
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def train_model(self, training_data):
        """Train the sentiment model with provided training data."""
        try:
            if not training_data or len(training_data) < 10:
                raise ValueError(f"Insufficient training data: {len(training_data) if training_data else 0} samples")
            
            # Extract texts and labels
            texts = []
            labels = []
            
            for item in training_data:
                if not isinstance(item, dict) or 'text' not in item or 'label' not in item:
                    continue
                
                text = self.preprocess_text(item['text'])
                if text:  # Only include non-empty texts
                    texts.append(text)
                    labels.append(item['label'])
            
            if len(texts) < 10:
                raise ValueError(f"Insufficient valid training texts: {len(texts)}")
            
            # Create and train pipeline
            self.pipeline = Pipeline([
                ('tfidf', TfidfVectorizer(
                    max_features=10000,
                    ngram_range=(1, 2),
                    stop_words='english',
                    min_df=2,
                    max_df=0.8
                )),
                ('classifier', MultinomialNB(alpha=1.0))
            ])
            
            self.pipeline.fit(texts, labels)
            self.is_trained = True
            
            return True
            
        except Exception as e:
            raise Exception(f"Training failed: {str(e)}")
    
    def predict_batch(self, texts):
        """Predict sentiment for a batch of texts."""
        if not self.is_trained:
            raise Exception("Model not trained yet")
        
        if not texts:
            return []
        
        try:
            # Preprocess all texts
            processed_texts = [self.preprocess_text(text) for text in texts]
            
            # Handle empty texts
            valid_indices = []
            valid_texts = []
            for i, text in enumerate(processed_texts):
                if text:
                    valid_indices.append(i)
                    valid_texts.append(text)
            
            # Predict for valid texts
            if valid_texts:
                predictions_valid = self.pipeline.predict(valid_texts)
            else:
                predictions_valid = []
            
            # Map back to original order
            predictions = []
            valid_idx = 0
            for i in range(len(texts)):
                if i in valid_indices:
                    predictions.append(predictions_valid[valid_idx])
                    valid_idx += 1
                else:
                    predictions.append('neutral')  # Default for empty/invalid texts
            
            return predictions
            
        except Exception as e:
            raise Exception(f"Prediction failed: {str(e)}")
    
    def process_message(self, message):
        """Process a single message and return response."""
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'predict':
                training_data = data.get('training_data', [])
                texts = data.get('texts', [])
                
                # Train model if not already trained or if new training data provided
                if not self.is_trained or training_data:
                    self.train_model(training_data)
                
                # Predict
                predictions = self.predict_batch(texts)
                
                return json.dumps({
                    'type': 'result',
                    'predictions': predictions
                })
                
            elif msg_type == 'shutdown':
                return json.dumps({'type': 'shutdown_ack'})
                
            else:
                return json.dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {msg_type}'
                })
                
        except json.JSONDecodeError as e:
            return json.dumps({
                'type': 'error',
                'message': f'Invalid JSON: {str(e)}'
            })
        except Exception as e:
            return json.dumps({
                'type': 'error',
                'message': str(e)
            })
    
    def run(self):
        """Main worker loop - read from stdin, process, write to stdout."""
        try:
            # Signal ready
            print(json.dumps({'type': 'ready'}), flush=True)
            
            # Process messages
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                
                response = self.process_message(line)
                print(response, flush=True)
                
                # Check for shutdown
                try:
                    resp_data = json.loads(response)
                    if resp_data.get('type') == 'shutdown_ack':
                        break
                except:
                    pass
                    
        except KeyboardInterrupt:
            print(json.dumps({'type': 'shutdown_ack'}), flush=True)
        except Exception as e:
            print(json.dumps({'type': 'error', 'message': f'Worker error: {str(e)}'}), flush=True)

if __name__ == '__main__':
    worker = SentimentWorker()
    worker.run()