import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
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
          <i class="fas fa-arrow-left"></i> Back to History
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
              {{ insights.analysis.total_items | number }} items
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
        <p>Loading comprehensive analysis insights...</p>
      </div>

      <!-- Error State -->
      <div class="error" *ngIf="error">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Insights</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadInsights()">
          <i class="fas fa-redo"></i> Retry
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
              <p>Avg Confidence</p>
              <small>Model certainty</small>
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
                  <h3><i class="fas fa-chart-pie"></i> Sentiment Distribution</h3>
                  <p>Overall breakdown of sentiment classifications</p>
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
                  <h3><i class="fas fa-chart-bar"></i> Confidence Distribution</h3>
                  <p>Distribution of model confidence scores</p>
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
                  <h3><i class="fas fa-chart-line"></i> Sentiment Trends</h3>
                  <p>Sentiment patterns across data batches</p>
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
                  <h3><i class="fas fa-text-width"></i> Text Length Distribution</h3>
                  <p>Distribution of text lengths in characters</p>
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
                  <h3><i class="fas fa-balance-scale"></i> Training vs Predictions</h3>
                  <p>Comparison between training data and predictions</p>
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
                <p>Most frequent words sized by frequency</p>
              </div>
              <div class="word-cloud-container">
                <div class="word-cloud">
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
                  <h3><i class="fas fa-list-ol"></i> Top Words</h3>
                  <p>Most frequently used words</p>
                </div>
                <div class="word-table">
                  <div class="word-table-header">
                    <span>Word</span>
                    <span>Count</span>
                    <span>Frequency</span>
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
                  <h4><i class="fas fa-smile"></i> Positive Keywords</h4>
                  <div class="keyword-list">
                    <span 
                      *ngFor="let word of insights.insights.word_analysis.sentiment_keywords.positive.slice(0, 15)" 
                      class="keyword-tag">
                      {{ word.word }} ({{ word.count }})
                    </span>
                  </div>
                </div>
                
                <div class="sentiment-keyword-card negative">
                  <h4><i class="fas fa-frown"></i> Negative Keywords</h4>
                  <div class="keyword-list">
                    <span 
                      *ngFor="let word of insights.insights.word_analysis.sentiment_keywords.negative.slice(0, 15)" 
                      class="keyword-tag">
                      {{ word.word }} ({{ word.count }})
                    </span>
                  </div>
                </div>
                
                <div class="sentiment-keyword-card neutral">
                  <h4><i class="fas fa-meh"></i> Neutral Keywords</h4>
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
                  <h3><i class="fas fa-calculator"></i> Basic Statistics</h3>
                  <p>Core analysis metrics</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Total Items:</span>
                    <span class="stat-value">{{ insights.insights.statistics.total_items | number }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Training Samples:</span>
                    <span class="stat-value">{{ insights.analysis.training_samples | number }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Processing Time:</span>
                    <span class="stat-value">{{ formatDuration(insights.analysis.processing_time_ms) }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Items per Second:</span>
                    <span class="stat-value">{{ calculateItemsPerSecond() | number:'1.0-0' }}</span>
                  </div>
                </div>
              </div>

              <!-- Confidence Statistics -->
              <div class="stats-card" *ngIf="insights.insights.statistics.confidence_stats?.mean">
                <div class="chart-header">
                  <h3><i class="fas fa-certificate"></i> Confidence Statistics</h3>
                  <p>Model prediction confidence analysis</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Mean Confidence:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.mean * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Median Confidence:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.median * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Min Confidence:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.min * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Max Confidence:</span>
                    <span class="stat-value">{{ (insights.insights.statistics.confidence_stats.max * 100).toFixed(2) }}%</span>
                  </div>
                </div>
              </div>

              <!-- Text Complexity -->
              <div class="stats-card">
                <div class="chart-header">
                  <h3><i class="fas fa-font"></i> Text Complexity</h3>
                  <p>Analysis of text characteristics</p>
                </div>
                <div class="stats-table">
                  <div class="stat-row">
                    <span class="stat-label">Avg Word Length:</span>
                    <span class="stat-value">{{ insights.insights.advanced_insights.text_complexity.avg_word_length?.toFixed(2) || 'N/A' }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Avg Sentence Length:</span>
                    <span class="stat-value">{{ insights.insights.advanced_insights.text_complexity.avg_sentence_length?.toFixed(2) || 'N/A' }}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Vocabulary Richness:</span>
                    <span class="stat-value">{{ (insights.insights.advanced_insights.text_complexity.vocabulary_richness * 100)?.toFixed(2) || 'N/A' }}%</span>
                  </div>
                </div>
              </div>

              <!-- Prediction Quality -->
              <div class="stats-card" *ngIf="insights.insights.advanced_insights.prediction_quality?.high_confidence_predictions">
                <div class="chart-header">
                  <h3><i class="fas fa-quality"></i> Prediction Quality</h3>
                  <p>Quality assessment of model predictions</p>
                </div>
                <div class="prediction-quality">
                  <div class="quality-item high">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.high"></div>
                    </div>
                    <span class="quality-label">High Confidence (>80%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.high_confidence_predictions }}</span>
                  </div>
                  <div class="quality-item medium">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.medium"></div>
                    </div>
                    <span class="quality-label">Medium Confidence (60-80%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.medium_confidence_predictions }}</span>
                  </div>
                  <div class="quality-item low">
                    <div class="quality-bar">
                      <div class="quality-fill" [style.width.%]="insights.insights.advanced_insights.prediction_quality.confidence_distribution.low"></div>
                    </div>
                    <span class="quality-label">Low Confidence (<60%)</span>
                    <span class="quality-value">{{ insights.insights.advanced_insights.prediction_quality.low_confidence_predictions }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- N-gram Analysis Tab -->
          <div class="tab-pane" [class.active]="activeTab === 'ngrams'">
            <div class="ngrams-grid">
              
              <!-- Bigrams -->
              <div class="ngram-card">
                <div class="chart-header">
                  <h3><i class="fas fa-link"></i> Most Common Bigrams</h3>
                  <p>Two-word phrases that appear together frequently</p>
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
                  <h3><i class="fas fa-sitemap"></i> Most Common Trigrams</h3>
                  <p>Three-word phrases that appear together frequently</p>
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

  insights: AnalysisInsights | null = null;
  loading = true;
  error: string | null = null;
  analysisId: string | null = null;
  activeTab = 'charts';
  
  // Processed data with fixed colors
  wordCloudData: WordCloudItem[] = [];

  tabs = [
    { id: 'charts', label: 'Charts & Graphs', icon: 'fas fa-chart-bar' },
    { id: 'words', label: 'Word Analysis', icon: 'fas fa-font' },
    { id: 'stats', label: 'Statistics', icon: 'fas fa-calculator' },
    { id: 'ngrams', label: 'N-gram Analysis', icon: 'fas fa-link' }
  ];

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
    // Force chart refresh
    setTimeout(() => {
      if (this.chart) {
        this.chart.chart?.update();
      }
    }, 100);
  }

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
}