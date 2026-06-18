import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartData, ChartOptions, registerables } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';

// Chart.js registration
Chart.register(...registerables);

interface AnalysisInsights {
  analysis: {
    id: number;
    session_id: string;
    session_name: string;
    analysis_type: string;
    source_description: string;
    total_items: number;
    processed_items: number;
    training_samples: number;
    status: string;
    processing_time_ms: number;
    created_at: string;
    completed_at: string;
  };
  modelMetrics: {
    source: 'test_set' | 'training_set';
    test_accuracy?: number;
    training_accuracy?: number;
    cross_validation_mean?: number;
    cross_validation_std?: number;
    train_samples?: number;
    test_samples?: number;
    training_samples?: number;
    testSplit?: number;
    classification_report?: {
      positive?: { precision: number; recall: number; 'f1-score': number; support: number };
      negative?: { precision: number; recall: number; 'f1-score': number; support: number };
      neutral?:  { precision: number; recall: number; 'f1-score': number; support: number };
      'macro avg'?:    { precision: number; recall: number; 'f1-score': number; support: number };
      'weighted avg'?: { precision: number; recall: number; 'f1-score': number; support: number };
    };
  } | null;
  insights: {
    statistics: any;
    charts: any;
    word_analysis: any;
    advanced_insights: any;
  };
}

interface WordCloudItem {
  text: string;
  size: number;
  color: string;
}

@Component({
  selector: 'app-analysis-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="insights-container">
      <!-- Header -->
      <div class="insights-header">
        <button class="back-btn" (click)="goBack()">
          <i class="fas fa-arrow-left"></i> Kembali ke Riwayat
        </button>
        <div class="analysis-info" *ngIf="insights">
          <h1>{{ insights.analysis.session_name }}</h1>
          <div class="analysis-meta">
            <span class="meta-item">
              <i class="fas fa-calendar"></i>
              {{ formatDate(insights.analysis.created_at) }}
            </span>
            <span class="meta-item">
              <i class="fas fa-chart-bar"></i>
              {{ insights.analysis.total_items | number }} data
            </span>
            <span class="meta-item">
              <i class="fas fa-clock"></i>
              {{ formatDuration(insights.analysis.processing_time_ms) }}
            </span>
            <span class="meta-item" [class]="'status-' + insights.analysis.status">
              <i class="fas fa-circle"></i>
              {{ insights.analysis.status }}
            </span>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading" *ngIf="loading">
        <div class="spinner"></div>
        <p>Memuat insight analisis...</p>
      </div>

      <!-- Error State -->
      <div class="error" *ngIf="error">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Gagal Memuat Insights</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadInsights()">
          <i class="fas fa-redo"></i> Coba Lagi
        </button>
      </div>

      <!-- Main Content -->
      <div class="insights-content" *ngIf="insights && !loading && !error">
        
        <!-- Summary Cards -->
        <div class="summary-cards">
          <div class="summary-card positive">
            <div class="card-icon">
              <i class="fas fa-smile"></i>
            </div>
            <div class="card-content">
              <h3>{{ insights.insights.statistics.sentiment_distribution.positive | number }}</h3>
              <p>Positive</p>
              <small>{{ getPercentage(insights.insights.statistics.sentiment_distribution.positive, insights.analysis.total_items) }}%</small>
            </div>
          </div>
          
          <div class="summary-card negative">
            <div class="card-icon">
              <i class="fas fa-frown"></i>
            </div>
            <div class="card-content">
              <h3>{{ insights.insights.statistics.sentiment_distribution.negative | number }}</h3>
              <p>Negative</p>
              <small>{{ getPercentage(insights.insights.statistics.sentiment_distribution.negative, insights.analysis.total_items) }}%</small>
            </div>
          </div>
          
          <div class="summary-card neutral">
            <div class="card-icon">
              <i class="fas fa-meh"></i>
            </div>
            <div class="card-content">
              <h3>{{ insights.insights.statistics.sentiment_distribution.neutral | number }}</h3>
              <p>Neutral</p>
              <small>{{ getPercentage(insights.insights.statistics.sentiment_distribution.neutral, insights.analysis.total_items) }}%</small>
            </div>
          </div>
          
          <div class="summary-card confidence">
            <div class="card-icon">
              <i class="fas fa-certificate"></i>
            </div>
            <div class="card-content">
              <h3>{{ (insights.insights.statistics.confidence_stats?.mean * 100 || 0).toFixed(1) }}%</h3>
              <p>Rata-rata Kepercayaan</p>
              <small>Keyakinan model</small>
            </div>
          </div>
        </div>

        <!-- Tabs Navigation -->
        <div class="tabs-nav">
          <button 
            *ngFor="let tab of tabs" 
            [class]="'tab-btn ' + (activeTab === tab.id ? 'active' : '')"
            (click)="setActiveTab(tab.id)">
            <i [class]="tab.icon"></i>
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          
          <!-- Charts Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'charts'">
            <div class="charts-grid">
              
              <!-- Sentiment Distribution Pie Chart -->
              <div class="chart-card">
                <div class="chart-header">
                  <h3><i class="fas fa-chart-pie"></i> Distribusi Sentimen</h3>
                  <p>Ringkasan klasifikasi sentimen keseluruhan</p>
                </div>
                <div class="chart-container">
                  <canvas 
                    baseChart
                    [data]="insights.insights.charts.sentiment_pie"
                    [type]="'pie'"
                    [options]="pieChartOptions">
                  </canvas>
                </div>
              </div>

              <!-- Confidence Histogram -->
              <div class="chart-card">
                <div class="chart-header">
                  <h3><i class="fas fa-chart-bar"></i> Distribusi Kepercayaan</h3>
                  <p>Distribusi skor kepercayaan model</p>
                </div>
                <div class="chart-container">
                  <canvas 
                    baseChart
                    [data]="insights.insights.charts.confidence_histogram"
                    [type]="'bar'"
                    [options]="barChartOptions">
                  </canvas>
                </div>
              </div>

              <!-- Sentiment Over Time -->
              <div class="chart-card wide">
                <div class="chart-header">
                  <h3><i class="fas fa-chart-line"></i> Tren Sentimen</h3>
                  <p>Pola sentimen di setiap batch data</p>
                </div>
                <div class="chart-container">
                  <canvas 
                    baseChart
                    [data]="insights.insights.charts.sentiment_over_time"
                    [type]="'line'"
                    [options]="lineChartOptions">
                  </canvas>
                </div>
              </div>

              <!-- Text Length Distribution -->
              <div class="chart-card">
                <div class="chart-header">
                  <h3><i class="fas fa-text-width"></i> Distribusi Panjang Teks</h3>
                  <p>Distribusi panjang teks dalam karakter</p>
                </div>
                <div class="chart-container">
                  <canvas 
                    baseChart
                    [data]="insights.insights.charts.text_length_distribution"
                    [type]="'bar'"
                    [options]="barChartOptions">
                  </canvas>
                </div>
              </div>

              <!-- Training vs Prediction Comparison -->
              <div class="chart-card">
                <div class="chart-header">
                  <h3><i class="fas fa-balance-scale"></i> Training vs Prediksi</h3>
                  <p>Perbandingan data training dan hasil prediksi</p>
                </div>
                <div class="chart-container">
                  <canvas 
                    baseChart
                    [data]="insights.insights.charts.training_vs_prediction"
                    [type]="'bar'"
                    [options]="barChartOptions">
                  </canvas>
                </div>
              </div>

            </div>
          </div>

          <!-- Word Analysis Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'words'">
            
            <!-- Word Cloud Simulation -->
            <div class="word-cloud-card">
              <div class="chart-header">
                <h3><i class="fas fa-cloud"></i> Word Cloud</h3>
                <p>Kata paling sering muncul berdasarkan frekuensi</p>
                <button class="btn-download-wc" (click)="downloadWordCloud()" title="Download sebagai PNG">
                  <i class="fas fa-download"></i> Download PNG
                </button>
              </div>
              <div class="word-cloud-container">
                <div class="word-cloud" #wordCloudRef>
                  <span
                    *ngFor="let word of wordCloudData"
                    class="word-cloud-item"
                    [style.font-size.px]="word.size"
                    [style.color]="word.color">
                    {{ word.text }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Word Frequency Tables -->
            <div class="word-tables">
              
              <!-- Top Words Overall -->
              <div class="word-table-card">
                <div class="chart-header">
                  <h3><i class="fas fa-list-ol"></i> Kata Teratas</h3>
                  <p>Kata yang paling sering digunakan</p>
                </div>
                <div class="word-table">
                  <div class="word-table-header">
                    <span>Kata</span>
                    <span>Jumlah</span>
                    <span>Frekuensi</span>
                  </div>
                  <div 
                    *ngFor="let word of insights.insights.word_analysis.word_counts.slice(0, 20)" 
                    class="word-table-row">
                    <span class="word">{{ word.word }}</span>
                    <span class="count">{{ word.count }}</span>
                    <span class="frequency">
                      <div class="frequency-bar">
                        <div 
                          class="frequency-fill" 
                          [style.width.%]="(word.count / insights.insights.word_analysis.word_counts[0].count) * 100">
                        </div>
                      </div>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Sentiment Keywords -->
              <div class="sentiment-keywords">
                <div class="sentiment-keyword-card positive">
                  <h4><i class="fas fa-smile"></i> Kata Kunci Positif</h4>
                  <div class="keyword-list">
                    <span 
                      *ngFor="let word of insights.insights.word_analysis.sentiment_keywords.positive.slice(0, 15)" 
                      class="keyword-tag">
                      {{ word.word }} ({{ word.count }})
                    </span>
                  </div>
                </div>
                
                <div class="sentiment-keyword-card negative">
                  <h4><i class="fas fa-frown"></i> Kata Kunci Negatif</h4>
                  <div class="keyword-list">
                    <span 
                      *ngFor="let word of insights.insights.word_analysis.sentiment_keywords.negative.slice(0, 15)" 
                      class="keyword-tag">
                      {{ word.word }} ({{ word.count }})
                    </span>
                  </div>
                </div>
                
                <div class="sentiment-keyword-card neutral">
                  <h4><i class="fas fa-meh"></i> Kata Kunci Netral</h4>
                  <div class="keyword-list">
                    <span 
                      *ngFor="let word of insights.insights.word_analysis.sentiment_keywords.neutral.slice(0, 15)" 
                      class="keyword-tag">
                      {{ word.word }} ({{ word.count }})
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Statistics Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'stats'">
            <div class="stats-grid">

              <!-- Basic Statistics -->
              <div class="stats-card">
                <div class="chart-header">
                  <h3><i class="fas fa-calculator"></i> Statistik Dasar</h3>
                  <p>Metrik analisis utama</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Total Data:</span>
                    <span class="stat-value">{{ insights.insights.statistics.total_items | number }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Sampel Training:</span>
                    <span class="stat-value">{{ insights.analysis.training_samples | number }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Waktu Proses:</span>
                    <span class="stat-value">{{ formatDuration(insights.analysis.processing_time_ms) }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Data per Detik:</span>
                    <span class="stat-value">{{ calculateItemsPerSecond() | number:'1.0-0' }}</span>
                  </div>
                </div>
              </div>

              <!-- Confidence Statistics -->
              <div class="stats-card" *ngIf="insights.insights.statistics.confidence_stats?.mean">
                <div class="chart-header">
                  <h3><i class="fas fa-certificate"></i> Statistik Kepercayaan</h3>
                  <p>Analisis kepercayaan prediksi model</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Rata-rata Kepercayaan:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.mean * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Median Kepercayaan:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.median * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Kepercayaan Min:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.min * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Kepercayaan Maks:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.max * 100).toFixed(2) }}%</span>
                  </div>
                </div>
              </div>

              <!-- Text Complexity -->
              <div class="stats-card">
                <div class="chart-header">
                  <h3><i class="fas fa-font"></i> Kompleksitas Teks</h3>
                  <p>Analisis karakteristik teks</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Rata-rata Panjang Kata:</span>
                    <span class="stat-value">{{ insights.insights.advanced_insights.text_complexity.avg_word_length?.toFixed(2) || 'N/A' }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Rata-rata Panjang Kalimat:</span>
                    <span class="stat-value">{{ insights.insights.advanced_insights.text_complexity.avg_sentence_length?.toFixed(2) || 'N/A' }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Kekayaan Kosakata:</span>
                    <span class="stat-value">{{ (insights.insights.advanced_insights.text_complexity.vocabulary_richness * 100)?.toFixed(2) || 'N/A' }}%</span>
                  </div>
                </div>
              </div>

              <!-- Prediction Quality -->
              <div class="stats-card" *ngIf="insights.insights.advanced_insights.prediction_quality?.high_confidence_predictions">
                <div class="chart-header">
                  <h3><i class="fas fa-quality"></i> Kualitas Prediksi</h3>
                  <p>Penilaian kualitas prediksi model</p>
                </div>
                <div class="prediction-quality">
                  <div class="quality-item high">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.high"></div>
                    </div>
                    <span class="quality-label">Kepercayaan Tinggi (>80%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.high_confidence_predictions }}</span>
                  </div>
                  <div class="quality-item medium">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.medium"></div>
                    </div>
                    <span class="quality-label">Kepercayaan Sedang (60-80%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.medium_confidence_predictions }}</span>
                  </div>
                  <div class="quality-item low">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.low"></div>
                    </div>
                    <span class="quality-label">Kepercayaan Rendah (<60%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.low_confidence_predictions }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Validation Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'validation'">
            <div class="validation-container">

              <!-- Loading -->
              <div class="val-loading" *ngIf="validationLoading">
                <div class="spinner"></div><p>Memuat data validasi...</p>
              </div>

              <!-- Error -->
              <div class="val-error" *ngIf="validationError && !validationLoading">
                <i class="fas fa-exclamation-triangle"></i> {{ validationError }}
              </div>

              <!-- NOT STARTED (only shown after explicit reset via skipAutoCreate=true) -->
              <div class="val-start-card" *ngIf="!validationLoading && !validationExists">
                <div class="val-start-icon"><i class="fas fa-redo"></i></div>
                <h3>Validasi Dihapus</h3>
                <p>Semua data validasi sebelumnya telah dihapus. Klik tombol di bawah untuk memulai ulang.</p>
                <div class="val-info-grid">
                  <div class="val-info-item">
                    <span class="val-info-num">{{ insights?.analysis?.total_items || 'Semua' }}</span>
                    <span class="val-info-label">Tweet<br>diklasifikasi</span>
                  </div>
                  <div class="val-info-item">
                    <span class="val-info-num">Label</span>
                    <span class="val-info-label">Kapanpun<br>bisa berhenti</span>
                  </div>
                  <div class="val-info-item">
                    <span class="val-info-num">F1</span>
                    <span class="val-info-label">Precision<br>Recall</span>
                  </div>
                </div>
                <p class="val-note">Semua tweet hasil klasifikasi akan dimuat ulang. Label sebelumnya tidak bisa dikembalikan.</p>
                <button class="btn-val-start" (click)="startValidation()" [disabled]="validationLoading">
                  <i class="fas fa-play"></i> Mulai Ulang Validasi
                </button>
              </div>

              <!-- IN PROGRESS / COMPLETE -->
              <div *ngIf="!validationLoading && validationExists && validationProgress">

                <!-- Progress header -->
                <div class="val-progress-header">
                  <div class="val-progress-info">
                    <h3>
                      <i class="fas fa-tasks"></i> Validasi Eksternal
                      <span class="val-badge" *ngIf="validationProgress.isComplete">✅ Selesai</span>
                      <span class="val-badge in-progress" *ngIf="!validationProgress.isComplete">⏳ Berlangsung</span>
                    </h3>
                    <p>{{ validationProgress.labeled }}/{{ validationProgress.total }} tweet dilabeli</p>
                  </div>
                  <button class="btn-val-reset" (click)="resetValidation()" title="Hapus semua data validasi dan mulai ulang">
                    <i class="fas fa-trash"></i> Hapus &amp; Mulai Ulang
                  </button>
                </div>

                <!-- Progress bar -->
                <div class="val-progress-bar-wrap">
                  <div class="val-progress-bar">
                    <div class="val-progress-fill"
                         [style.width.%]="validationProgress.total > 0 ? (validationProgress.labeled / validationProgress.total * 100) : 0">
                    </div>
                  </div>
                  <span class="val-progress-pct">
                    {{ validationProgress.total > 0 ? (validationProgress.labeled / validationProgress.total * 100).toFixed(0) : 0 }}%
                  </span>
                </div>

                <!-- Per-class progress chips -->
                <div class="val-class-chips">
                  <div class="val-chip pos">
                    <span class="chip-label">Positif</span>
                    <span class="chip-val">{{ getValidationClassProgress('Positive').labeled }}/{{ getValidationClassProgress('Positive').total }}</span>
                  </div>
                  <div class="val-chip neg">
                    <span class="chip-label">Negatif</span>
                    <span class="chip-val">{{ getValidationClassProgress('Negative').labeled }}/{{ getValidationClassProgress('Negative').total }}</span>
                  </div>
                  <div class="val-chip neu">
                    <span class="chip-label">Netral</span>
                    <span class="chip-val">{{ getValidationClassProgress('Neutral').labeled }}/{{ getValidationClassProgress('Neutral').total }}</span>
                  </div>
                </div>

                <!-- Labeling interface (while in progress) -->
                <div class="val-label-card" *ngIf="!validationProgress.isComplete && validationProgress.nextItem">
                  <div class="val-tweet-meta" *ngIf="validationProgress.nextItem.username_extracted || validationProgress.nextItem.timestamp_extracted">
                    <span *ngIf="validationProgress.nextItem.username_extracted">
                      <i class="fas fa-user"></i> {{ validationProgress.nextItem.username_extracted }}
                    </span>
                    <span *ngIf="validationProgress.nextItem.timestamp_extracted">
                      <i class="fas fa-calendar"></i> {{ formatDate(validationProgress.nextItem.timestamp_extracted) }}
                    </span>
                    <span class="val-pred-badge" [class]="'pred-' + validationProgress.nextItem.predicted_sentiment?.toLowerCase()">
                      Model: {{ validationProgress.nextItem.predicted_sentiment }}
                      ({{ validationProgress.nextItem.prediction_confidence ? (validationProgress.nextItem.prediction_confidence * 100).toFixed(0) + '%' : 'N/A' }})
                    </span>
                  </div>
                  <div class="val-tweet-text">{{ validationProgress.nextItem.clean_text }}</div>
                  <p class="val-question">Menurut Anda, sentimen tweet ini adalah:</p>
                  <div class="val-label-btns">
                    <button class="val-btn pos" (click)="submitValidationLabel('Positive')" [disabled]="validationLabelLoading">
                      <i class="fas fa-smile"></i> Positif
                    </button>
                    <button class="val-btn neg" (click)="submitValidationLabel('Negative')" [disabled]="validationLabelLoading">
                      <i class="fas fa-frown"></i> Negatif
                    </button>
                    <button class="val-btn neu" (click)="submitValidationLabel('Neutral')" [disabled]="validationLabelLoading">
                      <i class="fas fa-meh"></i> Netral
                    </button>
                  </div>
                  <div class="val-btn-loading" *ngIf="validationLabelLoading">
                    <div class="spinner small"></div>
                  </div>
                </div>

                <!-- METRICS (shown as soon as >=10 are labeled) -->
                <div class="val-metrics-section" *ngIf="validationProgress.labeled >= 10 && validationMetrics">

                  <h4 class="val-section-title"><i class="fas fa-chart-bar"></i> Hasil Validasi Eksternal</h4>

                  <!-- Summary row -->
                  <div class="val-summary-row">
                    <div class="val-summary-card">
                      <div class="vscard-val">{{ fmt4(validationMetrics.accuracy) }}</div>
                      <div class="vscard-label">Akurasi</div>
                      <div class="vscard-sub">{{ validationMetrics.correct }}/{{ validationMetrics.total }} benar</div>
                    </div>
                    <div class="val-summary-card">
                      <div class="vscard-val">{{ fmt2(validationMetrics.weighted_avg?.['f1-score']) }}</div>
                      <div class="vscard-label">F1 Weighted</div>
                    </div>
                    <div class="val-summary-card">
                      <div class="vscard-val">{{ fmt2(validationMetrics.weighted_avg?.precision) }}</div>
                      <div class="vscard-label">Precision</div>
                    </div>
                    <div class="val-summary-card">
                      <div class="vscard-val">{{ fmt2(validationMetrics.weighted_avg?.recall) }}</div>
                      <div class="vscard-label">Recall</div>
                    </div>
                  </div>

                  <!-- Per-class table -->
                  <table class="val-metrics-table">
                    <thead>
                      <tr><th>Kelas</th><th>Precision</th><th>Recall</th><th>F1-Score</th><th>Support</th></tr>
                    </thead>
                    <tbody>
                      <tr *ngIf="validationMetrics.class_metrics?.positive as c">
                        <td><span class="cls-badge pos">Positive</span></td>
                        <td>{{ fmt2(c.precision) }}</td><td>{{ fmt2(c.recall) }}</td>
                        <td>{{ fmt2(c['f1-score']) }}</td><td>{{ c.support }}</td>
                      </tr>
                      <tr *ngIf="validationMetrics.class_metrics?.negative as c">
                        <td><span class="cls-badge neg">Negative</span></td>
                        <td>{{ fmt2(c.precision) }}</td><td>{{ fmt2(c.recall) }}</td>
                        <td>{{ fmt2(c['f1-score']) }}</td><td>{{ c.support }}</td>
                      </tr>
                      <tr *ngIf="validationMetrics.class_metrics?.neutral as c">
                        <td><span class="cls-badge neu">Neutral</span></td>
                        <td>{{ fmt2(c.precision) }}</td><td>{{ fmt2(c.recall) }}</td>
                        <td>{{ fmt2(c['f1-score']) }}</td><td>{{ c.support }}</td>
                      </tr>
                      <tr class="avg-row" *ngIf="validationMetrics.weighted_avg as wa">
                        <td><span class="cls-badge avg">Weighted Avg</span></td>
                        <td>{{ fmt2(wa.precision) }}</td><td>{{ fmt2(wa.recall) }}</td>
                        <td>{{ fmt2(wa['f1-score']) }}</td><td>{{ wa.support }}</td>
                      </tr>
                    </tbody>
                  </table>

                  <!-- Confusion Matrix -->
                  <h4 class="val-section-title" style="margin-top:24px"><i class="fas fa-table"></i> Confusion Matrix</h4>
                  <div class="confusion-wrap">
                    <table class="confusion-matrix">
                      <thead>
                        <tr>
                          <th class="cm-corner">Aktual \ Prediksi</th>
                          <th class="cm-pred pos">Positive</th>
                          <th class="cm-pred neg">Negative</th>
                          <th class="cm-pred neu">Neutral</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td class="cm-actual pos">Positive</td>
                          <td class="cm-cell" [class.cm-correct]="getConfusionCell(validationMetrics.confusion_matrix,'Positive','Positive') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Positive','Positive') }}</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Positive','Negative') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Positive','Negative') }}</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Positive','Neutral') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Positive','Neutral') }}</td>
                        </tr>
                        <tr>
                          <td class="cm-actual neg">Negative</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Negative','Positive') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Negative','Positive') }}</td>
                          <td class="cm-cell" [class.cm-correct]="getConfusionCell(validationMetrics.confusion_matrix,'Negative','Negative') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Negative','Negative') }}</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Negative','Neutral') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Negative','Neutral') }}</td>
                        </tr>
                        <tr>
                          <td class="cm-actual neu">Neutral</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Positive') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Positive') }}</td>
                          <td class="cm-cell" [class.cm-wrong]="getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Negative') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Negative') }}</td>
                          <td class="cm-cell" [class.cm-correct]="getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Neutral') > 0">{{ getConfusionCell(validationMetrics.confusion_matrix,'Neutral','Neutral') }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p class="cm-note"><span class="cm-correct-dot"></span> Diagonal = prediksi benar &nbsp;|&nbsp; <span class="cm-wrong-dot"></span> Off-diagonal = prediksi salah</p>
                  </div>

                  <!-- Comparison with internal metrics -->
                  <div class="val-compare" *ngIf="insights?.modelMetrics as im">
                    <h4 class="val-section-title"><i class="fas fa-balance-scale"></i> Perbandingan: Internal vs Eksternal</h4>
                    <table class="val-compare-table">
                      <thead><tr><th>Metrik</th><th>Internal ({{ im.source === 'test_set' ? 'Test Set' : 'Training' }})</th><th>Eksternal (Validasi Manual)</th></tr></thead>
                      <tbody>
                        <tr>
                          <td>Akurasi</td>
                          <td>{{ fmt4(im.test_accuracy ?? im.training_accuracy) }}</td>
                          <td>{{ fmt4(validationMetrics.accuracy) }}</td>
                        </tr>
                        <tr *ngIf="im.classification_report?.['weighted avg'] as wa">
                          <td>F1 Weighted</td>
                          <td>{{ fmt2(wa['f1-score']) }}</td>
                          <td>{{ fmt2(validationMetrics.weighted_avg?.['f1-score']) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div><!-- /val-metrics-section -->

              </div><!-- /validationExists -->

            </div><!-- /validation-container -->
          </div><!-- /tab-pane validation -->

          <!-- N-gram Analysis Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'ngrams'">
            <div class="ngrams-grid">
              
              <!-- Bigrams -->
              <div class="ngram-card">
                <div class="chart-header">
                  <h3><i class="fas fa-link"></i> Bigram Paling Umum</h3>
                  <p>Pasangan dua kata yang sering muncul bersamaan</p>
                </div>
                <div class="ngram-list">
                  <div 
                    *ngFor="let bigram of insights.insights.word_analysis.ngram_analysis.bigrams" 
                    class="ngram-item">
                    <span class="ngram-text">"{{ bigram.ngram }}"</span>
                    <span class="ngram-count">{{ bigram.count }}</span>
                  </div>
                </div>
              </div>

              <!-- Trigrams -->
              <div class="ngram-card">
                <div class="chart-header">
                  <h3><i class="fas fa-sitemap"></i> Trigram Paling Umum</h3>
                  <p>Rangkaian tiga kata yang sering muncul bersamaan</p>
                </div>
                <div class="ngram-list">
                  <div 
                    *ngFor="let trigram of insights.insights.word_analysis.ngram_analysis.trigrams" 
                    class="ngram-item">
                    <span class="ngram-text">"{{ trigram.ngram }}"</span>
                    <span class="ngram-count">{{ trigram.count }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  `,
  styleUrl: './analysis-insights.component.css'
})
export class AnalysisInsightsComponent implements OnInit, OnDestroy {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('wordCloudRef') wordCloudRef?: ElementRef<HTMLElement>;

  insights: AnalysisInsights | null = null;
  loading = true;
  error: string | null = null;
  analysisId: string | null = null;
  activeTab = 'charts';
  
  // Processed data with fixed colors
  wordCloudData: WordCloudItem[] = [];

  tabs = [
    { id: 'charts', label: 'Grafik & Chart', icon: 'fas fa-chart-bar' },
    { id: 'words', label: 'Analisis Kata', icon: 'fas fa-font' },
    { id: 'stats', label: 'Statistik', icon: 'fas fa-calculator' },
    { id: 'ngrams', label: 'Analisis N-gram', icon: 'fas fa-link' },
    { id: 'validation', label: 'Validasi Eksternal', icon: 'fas fa-check-double' }
  ];

  // ── External Validation state ─────────────────────────────────────────────
  validationLoading = false;
  validationLabelLoading = false;
  validationError: string | null = null;
  validationExists = false;
  skipAutoCreate = false;  // true after explicit reset — user must click to recreate
  validationProgress: {
    total: number; labeled: number; remaining: number; isComplete: boolean;
    nextItem: any | null;
    progress: Array<{ predicted_sentiment: string; total: number; labeled: number }>;
  } | null = null;
  validationMetrics: any | null = null;

  // Chart options
  pieChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom'
      }
    }
  };

  barChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  lineChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom'
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  
  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.analysisId = this.route.snapshot.paramMap.get('id');
    if (this.analysisId) {
      this.loadInsights();
    } else {
      this.error = 'No analysis ID provided';
      this.loading = false;
    }
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  async loadInsights() {
    if (!this.analysisId) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch(`${environment.apiUrl}/analysis-history/${this.analysisId}/insights`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        this.insights = data;
        this.processWordCloudData();
        console.log('Insights loaded:', this.insights);
      } else {
        throw new Error(data.error || 'Failed to load insights');
      }
    } catch (error) {
      console.error('Error loading insights:', error);
      this.error = error instanceof Error ? error.message : 'Unknown error occurred';
    } finally {
      this.loading = false;
    }
  }

  setActiveTab(tabId: string) {
    this.activeTab = tabId;
    if (tabId === 'validation' && !this.validationProgress && !this.validationLoading) {
      this.loadValidation();
    }
    setTimeout(() => { if (this.chart) this.chart.chart?.update(); }, 100);
  }

  // ── Validation methods ────────────────────────────────────────────────────

  private get apiBase() { return `${environment.apiUrl}/analysis-history/${this.analysisId}/validation`; }
  private get authHeader() { return { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }; }

  async loadValidation() {
    if (!this.analysisId) return;
    this.validationLoading = true;
    this.validationError = null;
    try {
      const r = await fetch(this.apiBase, { headers: this.authHeader });
      const d = await r.json();
      if (d.success) {
        this.validationExists = d.exists;
        if (d.exists) {
          this.validationProgress = d;
          if (d.labeled >= 10) await this.loadValidationMetrics();
        } else if (!this.skipAutoCreate) {
          // Sample not ready yet — auto-create (backend may still be inserting after analysis)
          await this.startValidation();
          return;
        }
      }
    } catch (e: any) { this.validationError = e.message; }
    finally { this.validationLoading = false; }
  }

  async startValidation() {
    if (!this.analysisId) return;
    this.validationLoading = true;
    this.validationError = null;
    try {
      const r = await fetch(`${this.apiBase}/sample`, { method: 'POST', headers: this.authHeader });
      const d = await r.json();
      if (d.success) { await this.loadValidation(); }
      else this.validationError = d.error || 'Gagal membuat sampel validasi';
    } catch (e: any) { this.validationError = e.message; }
    finally { this.validationLoading = false; }
  }

  async submitValidationLabel(label: 'Positive' | 'Negative' | 'Neutral') {
    if (!this.validationProgress?.nextItem || this.validationLabelLoading) return;
    this.validationLabelLoading = true;
    try {
      const r = await fetch(`${this.apiBase}/label`, {
        method: 'POST', headers: this.authHeader,
        body: JSON.stringify({ itemId: this.validationProgress.nextItem.id, label })
      });
      const d = await r.json();
      if (d.success) {
        this.validationProgress = { ...this.validationProgress, ...d };
        // Refresh metrics every 10 labels so user sees running F1
        if (d.labeled >= 10 && d.labeled % 10 === 0) await this.loadValidationMetrics();
      }
    } catch (e: any) { this.validationError = e.message; }
    finally { this.validationLabelLoading = false; }
  }

  async loadValidationMetrics() {
    if (!this.analysisId) return;
    try {
      const r = await fetch(`${this.apiBase}/metrics`, { headers: this.authHeader });
      const d = await r.json();
      if (d.success && d.metrics) this.validationMetrics = d.metrics;
    } catch {}
  }

  async resetValidation() {
    if (!confirm('Hapus semua data validasi (sampel + label)? Label yang sudah dibuat akan hilang.')) return;
    try {
      await fetch(this.apiBase, { method: 'DELETE', headers: this.authHeader });
      this.validationMetrics = null;
      this.validationProgress = null;
      this.validationExists = false;
      this.skipAutoCreate = true;  // Prevent auto-recreation — user must click "Mulai" to restart
    } catch {}
  }

  getValidationClassProgress(cls: string): { total: number; labeled: number } {
    const p = this.validationProgress?.progress?.find(
      (x: any) => x.predicted_sentiment?.toLowerCase() === cls.toLowerCase()
    );
    return { total: p?.total || 0, labeled: p?.labeled || 0 };
  }

  getConfusionCell(matrix: any[], actual: string, predicted: string): number {
    const row = matrix?.find(r => r.actual === actual);
    return row?.predictions?.find((p: any) => p.predicted === predicted)?.count ?? 0;
  }

  fmt4(v: number | undefined): string { return v != null ? (v * 100).toFixed(1) + '%' : 'N/A'; }
  fmt2(v: number | undefined): string { return v != null ? v.toFixed(4) : 'N/A'; }

  goBack() {
    this.router.navigate(['/analysis-history']);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  getPercentage(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  calculateItemsPerSecond(): number {
    if (!this.insights) return 0;
    const timeInSeconds = this.insights.analysis.processing_time_ms / 1000;
    return timeInSeconds > 0 ? this.insights.analysis.total_items / timeInSeconds : 0;
  }

  processWordCloudData() {
    if (!this.insights?.insights?.word_analysis?.word_cloud_data) return;
    
    const colors = [
      '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#16a085'
    ];
    
    this.wordCloudData = this.insights.insights.word_analysis.word_cloud_data.map((word: any, index: number) => ({
      text: word.text,
      size: word.size,
      color: colors[index % colors.length]
    }));
  }

  getRandomColor(): string {
    const colors = [
      '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#16a085'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  downloadWordCloud() {
    const container = this.wordCloudRef?.nativeElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const padding = 24;
    const canvasW = Math.round(containerRect.width) + padding * 2;
    const canvasH = Math.round(containerRect.height) + padding * 2;

    const canvas = document.createElement('canvas');
    // 2x resolution for crisp PNG on high-DPI screens
    const scale = 2;
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw each word at its exact screen position
    const items = container.querySelectorAll<HTMLElement>('.word-cloud-item');
    items.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      const color = style.color;

      const x = rect.left - containerRect.left + padding;
      const y = rect.top - containerRect.top + padding;

      ctx.font = `600 ${fontSize}px ${style.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(el.textContent?.trim() || '', x, y + fontSize * 0.85);
    });

    const link = document.createElement('a');
    const name = this.insights?.analysis?.session_name || 'word-cloud';
    link.download = `${name.replace(/[^a-z0-9]/gi, '_')}_word_cloud.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}