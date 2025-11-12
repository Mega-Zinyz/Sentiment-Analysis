#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Persistent sentiment analysis worker with Indonesian language support.

This worker uses:
- spaCy for advanced text processing
- Sastrawi for Indonesian stemming
- Indonesian stopwords
- TF-IDF with bigrams for better context

Protocol:
- Input: JSON line with {"type": "predict", "training_data": [...], "texts": [...]}
- Output: JSON line with {"type": "result", "predictions": [...]}
- Control: {"type": "shutdown"} to gracefully exit
"""

import sys
import json
import re
import warnings
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

# Suppress warnings
warnings.filterwarnings('ignore')

# Try to import spaCy
try:
    import spacy
    try:
        nlp = spacy.load("en_core_web_sm")
        spacy_available = True
    except OSError:
        spacy_available = False
        nlp = None
except ImportError:
    spacy_available = False
    nlp = None

# Try to import Sastrawi for Indonesian stemming
try:
    from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
    sastrawi_available = True
    factory = StemmerFactory()
    stemmer = factory.create_stemmer()
except ImportError:
    sastrawi_available = False
    stemmer = None

# Enhanced Indonesian stopwords
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

class IndonesianSentimentWorker:
    def __init__(self):
        self.pipeline = None
        self.is_trained = False
        self.use_spacy = spacy_available
        self.use_sastrawi = sastrawi_available
        self.ready_sent = False
        
        # Log capabilities to stderr (not stdout to avoid interfering with protocol)
        print(json.dumps({
            "spacy_available": spacy_available,
            "sastrawi_available": sastrawi_available
        }), file=sys.stderr, flush=True)
        
    def clean_text(self, text):
        """Basic text cleaning"""
        if not isinstance(text, str):
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove URLs
        text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
        
        # Remove mentions and hashtags (keep the text)
        text = re.sub(r'@\w+', '', text)
        text = re.sub(r'#(\w+)', r'\1', text)
        
        # Remove RT markers
        text = re.sub(r'\brt\b', '', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def spacy_process(self, text):
        """Process text using spaCy"""
        if not self.use_spacy or not text:
            return text
        
        try:
            doc = nlp(text)
            tokens = []
            
            for token in doc:
                # Skip punctuation, spaces, numbers
                if token.is_punct or token.is_space or token.like_num:
                    continue
                
                # Skip stopwords
                if token.is_stop or token.lemma_.lower() in INDONESIAN_STOPWORDS:
                    continue
                
                # Use lemma (root form)
                lemma = token.lemma_.lower() if token.lemma_ != "-PRON-" else token.text.lower()
                
                # Only include meaningful tokens
                if len(lemma) > 2:
                    tokens.append(lemma)
            
            return ' '.join(tokens)
        except Exception as e:
            print(json.dumps({"type": "warning", "message": f"spaCy error: {e}"}), file=sys.stderr, flush=True)
            return text
    
    def remove_stopwords(self, text):
        """Remove Indonesian stopwords (fallback if spaCy not available)"""
        words = text.split()
        filtered = [w for w in words if w.lower() not in INDONESIAN_STOPWORDS and len(w) > 2]
        return ' '.join(filtered)
    
    def stem_text(self, text):
        """Apply Indonesian stemming"""
        if self.use_sastrawi and text:
            try:
                return stemmer.stem(text)
            except Exception as e:
                print(json.dumps({"type": "warning", "message": f"Stemming error: {e}"}), file=sys.stderr, flush=True)
                return text
        return text
    
    def preprocess_text(self, text):
        """Complete preprocessing pipeline (balanced speed & accuracy)"""
        # Step 1: Basic cleaning
        text = self.clean_text(text)
        if not text:
            return ""
        
        # Step 2: Fast stopword removal (skip spaCy for speed, use basic removal)
        text = self.remove_stopwords(text)
        
        # Step 3: Indonesian stemming (KEEP - important for accuracy!)
        text = self.stem_text(text)
        
        # Step 4: Final cleanup
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def train_model(self, training_data):
        """Train the sentiment model"""
        try:
            if not training_data or len(training_data) < 3:
                raise ValueError(f"Insufficient training data: {len(training_data) if training_data else 0} samples")
            
            # Extract and preprocess
            texts = []
            labels = []
            
            for item in training_data:
                if not isinstance(item, dict) or 'text' not in item or 'label' not in item:
                    continue
                
                processed = self.preprocess_text(item['text'])
                if processed:
                    texts.append(processed)
                    labels.append(item['label'])
            
            if len(texts) < 3:
                raise ValueError(f"Insufficient valid texts: {len(texts)}")
            
            # Create pipeline with Indonesian-optimized settings (balanced)
            self.pipeline = Pipeline([
                ('tfidf', TfidfVectorizer(
                    max_features=3000,  # Balanced: 3000 features
                    ngram_range=(1, 2),  # Include bigrams for accuracy
                    min_df=1,
                    max_df=0.95,
                    sublinear_tf=True
                )),
                ('nb', MultinomialNB(alpha=0.1))
            ])
            
            # Train
            self.pipeline.fit(texts, labels)
            self.is_trained = True
            
            return True
            
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Training error: {str(e)}"}), file=sys.stderr, flush=True)
            raise
    
    def predict(self, texts):
        """Predict sentiment for texts"""
        if not self.is_trained:
            raise RuntimeError("Model not trained")
        
        # Preprocess all texts
        processed_texts = [self.preprocess_text(text) for text in texts]
        
        # Handle empty texts
        processed_texts = [text if text else "unknown" for text in processed_texts]
        
        # Predict
        predictions = self.pipeline.predict(processed_texts)
        probabilities = self.pipeline.predict_proba(processed_texts)
        
        # Format results
        results = []
        for pred, proba in zip(predictions, probabilities):
            confidence = float(max(proba))
            results.append({
                "label": str(pred),
                "confidence": round(confidence, 4)
            })
        
        return results
    
    def process_message(self, message):
        """Process a single message"""
        try:
            msg_type = message.get('type')
            
            if msg_type == 'predict':
                training_data = message.get('training_data', [])
                texts = message.get('texts', [])
                
                if not texts:
                    return {"type": "error", "message": "No texts provided"}
                
                # Train if not already trained or if training data changed
                if not self.is_trained:
                    self.train_model(training_data)
                
                # Predict
                predictions = self.predict(texts)
                
                return {
                    "type": "result",
                    "predictions": predictions
                }
            
            elif msg_type == 'shutdown':
                return {"type": "shutdown"}
            
            else:
                return {"type": "error", "message": f"Unknown message type: {msg_type}"}
        
        except Exception as e:
            return {"type": "error", "message": str(e)}
    
    def run(self):
        """Main worker loop"""
        # Send ready message only once at startup
        if not self.ready_sent:
            print(json.dumps({"type": "ready"}), flush=True)
            self.ready_sent = True
        
        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                
                try:
                    message = json.loads(line)
                    response = self.process_message(message)
                    print(json.dumps(response), flush=True)
                    
                    if response.get('type') == 'shutdown':
                        break
                
                except json.JSONDecodeError as e:
                    error_response = {"type": "error", "message": f"Invalid JSON: {str(e)}"}
                    print(json.dumps(error_response), flush=True)
                except Exception as e:
                    error_response = {"type": "error", "message": str(e)}
                    print(json.dumps(error_response), flush=True)
        
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    worker = IndonesianSentimentWorker()
    worker.run()
