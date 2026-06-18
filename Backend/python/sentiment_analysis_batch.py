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
from sklearn.naive_bayes import MultinomialNB, ComplementNB
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score, classification_report,
    confusion_matrix
)
from sklearn.model_selection import cross_val_score, train_test_split
import re
import spacy
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

# Combined stopword set used for TF-IDF and preprocessing
INDONESIAN_STOPWORDS = _BASE_STOPWORDS | _EXTRA_STOPWORDS

# Label display order expected by the frontend HTML template
LABEL_DISPLAY_ORDER = ['Positive', 'Negative', 'Neutral']


class BatchSentimentAnalyzer:
    def __init__(self):
        # Placeholder — replaced in train() with ComplementNB
        self.pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(
                max_features=5000,
                stop_words=list(INDONESIAN_STOPWORDS),
                ngram_range=(1, 2),
                lowercase=True,
                strip_accents='unicode',
                token_pattern=r'\b[a-zA-Z][a-zA-Z0-9]*\b'
            )),
            ('classifier', ComplementNB(alpha=1.0))
        ])

    # ── Preprocessing ────────────────────────────────────────────────────────

    def spacy_process(self, text):
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
        if not text:
            return text
        try:
            return stemmer.stem(text)
        except Exception as e:
            print(f"Stemming error: {e}", file=sys.stderr)
            return text

    def preprocess_text(self, text):
        if not text:
            return ""
        text = text.lower()
        text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
        text = re.sub(r'@\w+|#\w+', '', text)
        text = re.sub(r'\brt\b', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = self.spacy_process(text)
        text = self.stem_text(text)
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _tfidf_kwargs(self):
        return dict(
            max_features=5000,
            stop_words=list(INDONESIAN_STOPWORDS),
            ngram_range=(1, 2),
            lowercase=True,
            strip_accents='unicode',
            token_pattern=r'\b[a-zA-Z][a-zA-Z0-9]*\b'
        )

    def _build_metrics_dict(self, accuracy, report, cm, all_labels, cv_scores, train_n, test_n):
        """
        Convert sklearn outputs to the format expected by the frontend HTML template.

        Confusion matrix rows/cols ordered as LABEL_DISPLAY_ORDER
        = ['Positive', 'Negative', 'Neutral'].
        sklearn confusion_matrix() orders labels alphabetically,
        so we remap accordingly.
        """
        sorted_labels = sorted(set(all_labels))  # alphabetical

        # Remap confusion matrix to display order
        ordered_cm = []
        for row_lbl in LABEL_DISPLAY_ORDER:
            if row_lbl not in sorted_labels:
                ordered_cm.append([0, 0, 0])
                continue
            ri = sorted_labels.index(row_lbl)
            row = []
            for col_lbl in LABEL_DISPLAY_ORDER:
                if col_lbl not in sorted_labels:
                    row.append(0)
                else:
                    ci = sorted_labels.index(col_lbl)
                    row.append(int(cm[ri][ci]))
            ordered_cm.append(row)

        per_class = {}
        for cls in LABEL_DISPLAY_ORDER:
            if cls in report:
                per_class[cls] = {
                    'precision': float(report[cls]['precision']),
                    'recall':    float(report[cls]['recall']),
                    'f1':        float(report[cls]['f1-score']),
                    'support':   int(report[cls]['support'])
                }

        macro    = report.get('macro avg', {})
        weighted = report.get('weighted avg', {})

        cv_arr  = np.array(cv_scores) if len(cv_scores) > 0 else np.array([])
        cv_mean = float(np.mean(cv_arr)) if cv_arr.size > 0 else 0.0
        cv_std  = float(np.std(cv_arr))  if cv_arr.size > 0 else 0.0

        return {
            'accuracy':              float(accuracy),
            'cross_validation_mean': cv_mean,
            'cross_validation_std':  cv_std,
            'train_samples':         int(train_n),
            'test_samples':          int(test_n),
            'total_test_samples':    int(test_n),
            'per_class':             per_class,
            'macro_avg': {
                'precision': float(macro.get('precision', 0)),
                'recall':    float(macro.get('recall', 0)),
                'f1':        float(macro.get('f1-score', 0))
            },
            'weighted_avg': {
                'f1': float(weighted.get('f1-score', 0))
            },
            'confusion_matrix': ordered_cm,
            'f1_weighted':      float(weighted.get('f1-score', 0)),
            'f1_macro':         float(macro.get('f1-score', 0))
        }

    # ── Training ─────────────────────────────────────────────────────────────

    def train(self, training_data, test_split=0.2):
        """
        Train the model with two strategies on the same train/test split:
          1. Baseline: MultinomialNB without balancing
          2. Primary:  ComplementNB + class-balanced sample_weight

        Returns:
          training_metrics       – metrics on the full training set (primary model)
          test_metrics           – ComplementNB metrics on held-out test set (PRIMARY)
          baseline_test_metrics  – MultinomialNB metrics on the same test set (for comparison)
        """
        try:
            if not training_data or len(training_data) == 0:
                raise ValueError("No training data provided")

            # Preprocess all texts
            texts, labels = [], []
            for item in training_data:
                if 'text' not in item or 'label' not in item:
                    continue
                text = self.preprocess_text(item['text'])
                if len(text) > 0:
                    texts.append(text)
                    # Normalize to Title case so labels always match LABEL_DISPLAY_ORDER
                    labels.append(item['label'].strip().capitalize())

            if len(texts) == 0:
                raise ValueError("No valid training texts found")

            unique_labels = sorted(set(labels))
            num_classes = len(unique_labels)

            print(f"Total labeled samples: {len(texts)}")
            label_dist = dict(zip(*np.unique(labels, return_counts=True)))
            print(f"Label distribution: {label_dist}")

            # ── Train/Test Split ─────────────────────────────────────────────
            test_metrics          = None
            baseline_test_metrics = None

            min_for_split = int(np.ceil(num_classes / test_split)) if test_split > 0 else 0

            if test_split > 0 and len(texts) >= min_for_split:
                try:
                    X_train, X_test, y_train, y_test = train_test_split(
                        texts, labels,
                        test_size=test_split,
                        random_state=42,
                        stratify=labels
                    )
                    print(f"Split → train: {len(X_train)} | test: {len(X_test)} ({int(test_split*100)}%)")

                    # ── Shared TF-IDF: fit ONLY on train, transform both ─────
                    tfidf_eval    = TfidfVectorizer(**self._tfidf_kwargs())
                    X_train_tfidf = tfidf_eval.fit_transform(X_train)
                    X_test_tfidf  = tfidf_eval.transform(X_test)   # test set NEVER seen by TF-IDF

                    cv_folds = max(2, min(5, len(X_train) // max(num_classes * 2, 1)))

                    # ── 1. BASELINE: MultinomialNB (no balancing) ────────────
                    print("\n[Baseline] MultinomialNB (no class balancing)...")
                    mnb = MultinomialNB(alpha=1.0)
                    mnb.fit(X_train_tfidf, y_train)
                    mnb_preds = mnb.predict(X_test_tfidf)
                    mnb_acc   = accuracy_score(y_test, mnb_preds)
                    mnb_rep   = classification_report(
                        y_test, mnb_preds, output_dict=True, zero_division=0
                    )
                    mnb_cm    = confusion_matrix(y_test, mnb_preds, labels=unique_labels)

                    try:
                        mnb_cv_pipe   = Pipeline([
                            ('tfidf', TfidfVectorizer(**self._tfidf_kwargs())),
                            ('clf',   MultinomialNB(alpha=1.0))
                        ])
                        mnb_cv_scores = cross_val_score(mnb_cv_pipe, X_train, y_train, cv=cv_folds)
                    except Exception:
                        mnb_cv_scores = np.array([])

                    baseline_test_metrics = self._build_metrics_dict(
                        mnb_acc, mnb_rep, mnb_cm, unique_labels,
                        mnb_cv_scores, len(X_train), len(X_test)
                    )
                    print(f"  Baseline accuracy : {mnb_acc:.4f}")
                    neutral_recall_mnb = mnb_rep.get('Neutral', {}).get('recall', 0)
                    print(f"  Neutral recall    : {neutral_recall_mnb:.4f}")

                    # ── 2. PRIMARY: ComplementNB + balanced sample_weight ────
                    print("\n[Primary] ComplementNB + balanced sample_weight...")
                    classes_tr, counts_tr = np.unique(y_train, return_counts=True)
                    weight_map = dict(
                        zip(classes_tr, len(y_train) / (len(classes_tr) * counts_tr))
                    )
                    sw_train = np.array([weight_map[y] for y in y_train])

                    cnb = ComplementNB(alpha=1.0)
                    cnb.fit(X_train_tfidf, y_train, sample_weight=sw_train)
                    cnb_preds = cnb.predict(X_test_tfidf)
                    cnb_acc   = accuracy_score(y_test, cnb_preds)
                    cnb_rep   = classification_report(
                        y_test, cnb_preds, output_dict=True, zero_division=0
                    )
                    cnb_cm    = confusion_matrix(y_test, cnb_preds, labels=unique_labels)

                    # CV without sample_weight (approximation for reporting)
                    try:
                        cnb_cv_pipe   = Pipeline([
                            ('tfidf', TfidfVectorizer(**self._tfidf_kwargs())),
                            ('clf',   ComplementNB(alpha=1.0))
                        ])
                        cnb_cv_scores = cross_val_score(cnb_cv_pipe, X_train, y_train, cv=cv_folds)
                    except Exception:
                        cnb_cv_scores = np.array([])

                    test_metrics = self._build_metrics_dict(
                        cnb_acc, cnb_rep, cnb_cm, unique_labels,
                        cnb_cv_scores, len(X_train), len(X_test)
                    )
                    print(f"  ComplementNB accuracy : {cnb_acc:.4f}")
                    neutral_recall_cnb = cnb_rep.get('Neutral', {}).get('recall', 0)
                    print(f"  Neutral recall        : {neutral_recall_cnb:.4f}")
                    print(f"  Neutral recall DELTA  : {neutral_recall_cnb - neutral_recall_mnb:+.4f}")

                except Exception as split_err:
                    print(
                        f"Warning: split evaluation failed ({split_err}), skipping",
                        file=sys.stderr
                    )
            else:
                print(
                    f"Dataset too small for {int(test_split*100)}% split, "
                    "skipping test evaluation"
                )

            # ── Final model: ComplementNB + sample_weight on ALL data ────────
            print("\nTraining final ComplementNB model on all data...")
            classes_all, counts_all = np.unique(labels, return_counts=True)
            weight_map_all = dict(
                zip(classes_all, len(labels) / (len(classes_all) * counts_all))
            )
            sw_all = np.array([weight_map_all[y] for y in labels])

            self.pipeline = Pipeline([
                ('tfidf',      TfidfVectorizer(**self._tfidf_kwargs())),
                ('classifier', ComplementNB(alpha=1.0))
            ])
            # Pass sample_weight via Pipeline's step-namespaced fit_params
            self.pipeline.fit(texts, labels, classifier__sample_weight=sw_all)

            train_preds    = self.pipeline.predict(texts)
            train_accuracy = accuracy_score(labels, train_preds)

            try:
                train_report = classification_report(
                    labels, train_preds, output_dict=True, zero_division=0
                )
            except Exception:
                train_report = {}

            training_metrics = {
                'training_accuracy':     float(train_accuracy),
                'training_samples':      len(texts),
                'model':                 'ComplementNB+balanced_weight',
                'classification_report': train_report
            }
            print(f"Final model training accuracy: {train_accuracy:.4f}")

            return {
                'training_metrics':      training_metrics,
                'test_metrics':          test_metrics,           # ComplementNB (PRIMARY)
                'baseline_test_metrics': baseline_test_metrics,  # MultinomialNB (comparison)
            }

        except Exception as e:
            print(f"Error during training: {str(e)}", file=sys.stderr)
            raise

    # ── Prediction ───────────────────────────────────────────────────────────

    def predict(self, texts):
        """Predict sentiment for a list of texts using the trained final model."""
        try:
            if not hasattr(self.pipeline, 'predict'):
                raise ValueError("Model not trained. Call train() first.")

            processed_texts = [self.preprocess_text(text) for text in texts]
            valid_indices   = [i for i, t in enumerate(processed_texts) if len(t) > 0]
            valid_texts     = [processed_texts[i] for i in valid_indices]

            if len(valid_texts) == 0:
                print("Warning: No valid texts for prediction", file=sys.stderr)
                return []

            print(f"Predicting sentiment for {len(valid_texts)} texts")

            predictions  = self.pipeline.predict(valid_texts)
            probabilities = self.pipeline.predict_proba(valid_texts)

            results   = []
            valid_idx = 0

            for i, text in enumerate(processed_texts):
                if len(text) > 0:
                    pred       = predictions[valid_idx]
                    proba      = probabilities[valid_idx]
                    confidence = float(max(proba))

                    results.append({
                        'text':       texts[i],
                        'label':      pred,
                        'confidence': confidence,
                        'probabilities': {
                            label: float(prob)
                            for label, prob in zip(self.pipeline.classes_, proba)
                        }
                    })
                    valid_idx += 1
                else:
                    results.append({
                        'text':       texts[i],
                        'label':      'neutral',
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
    parser.add_argument('--train-file',   required=True, help='JSON file with training data')
    parser.add_argument('--predict-file', required=True, help='JSON file with texts to predict')
    parser.add_argument('--output-file',  required=True, help='Output JSON file for results')
    parser.add_argument('--test-split',   type=float, default=0.2,
                        help='Fraction of labeled data to hold out for test evaluation (0=skip, default 0.2)')

    args = parser.parse_args()

    try:
        if not os.path.exists(args.train_file):
            raise FileNotFoundError(f"Training file not found: {args.train_file}")
        if not os.path.exists(args.predict_file):
            raise FileNotFoundError(f"Prediction file not found: {args.predict_file}")

        print(f"Loading training data from {args.train_file}")
        with open(args.train_file, 'r', encoding='utf-8') as f:
            training_data = json.load(f)

        print(f"Loading prediction texts from {args.predict_file}")
        with open(args.predict_file, 'r', encoding='utf-8') as f:
            prediction_texts = json.load(f)

        if not isinstance(training_data, list) or len(training_data) == 0:
            raise ValueError("Training data must be a non-empty list")
        if not isinstance(prediction_texts, list):
            raise ValueError("Prediction texts must be a list")

        print(f"Loaded {len(training_data)} training samples and {len(prediction_texts)} texts for prediction")

        analyzer = BatchSentimentAnalyzer()
        print("Preprocessing: spaCy (xx_ent_wiki_sm) + Sastrawi aktif")
        train_result = analyzer.train(training_data, test_split=args.test_split)

        predictions = analyzer.predict(prediction_texts) if prediction_texts else []

        results = {
            # Backward-compat keys
            'metrics':         train_result['training_metrics'],
            'training_metrics': train_result['training_metrics'],
            # PRIMARY test metrics (ComplementNB + balanced weight)
            'test_metrics':          train_result['test_metrics'],
            # BASELINE metrics (MultinomialNB, no balancing) — for thesis comparison
            'baseline_test_metrics': train_result['baseline_test_metrics'],
            'test_split':            args.test_split,
            'predictions':           predictions,
            'summary': {
                'total_predictions':    len(predictions),
                'sentiment_distribution': {}
            }
        }

        sentiment_counts = {}
        for pred in predictions:
            label = pred['label']
            sentiment_counts[label] = sentiment_counts.get(label, 0) + 1

        results['summary']['sentiment_distribution'] = sentiment_counts

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
