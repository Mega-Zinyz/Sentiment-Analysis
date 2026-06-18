import { Component, OnInit, OnDestroy, ElementRef, Renderer2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface ClassMetrics {
  precision: number;
  recall: number;
  'f1-score': number;
  support: number;
}

interface TrainingMetrics {
  // Training-set fields
  training_accuracy?: number;
  training_samples?: number;
  // Test-set fields (present when test split was applied)
  test_accuracy?: number;
  train_samples?: number;
  test_samples?: number;
  test_split_ratio?: number;
  // Cross-validation (present in both paths)
  cross_validation_mean?: number;
  cross_validation_std?: number;
  classification_report: {
    positive?: ClassMetrics;
    negative?: ClassMetrics;
    neutral?: ClassMetrics;
    'macro avg'?: ClassMetrics;
    'weighted avg'?: ClassMetrics;
    accuracy?: number;
  };
}

interface AnalysisHistory {
  id: number;
  session_id: string;
  analysis_name: string;
  analysis_type: 'manual' | 'api' | 'library';
  source_description: string;
  total_items: number;
  processed_items: number;
  training_samples: number;
  sentiment_distribution: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  processing_time?: number;
  duration: string;
  completionRate: number;
  created_at: string;
  completed_at?: string;
}

interface AnalysisDetail {
  id: number;
  text: string;
  originalText?: string;
  sentiment: string;
  confidence?: number;
  username?: string;
  timestamp?: string;
  created_at?: string;
  // Legacy fields for backward compatibility
  clean_text?: string;
  predicted_sentiment?: string;
  prediction_confidence?: number;
  timestamp_extracted?: string;
  username_extracted?: string;
  is_training_sample?: boolean;
}

@Component({
  selector: 'app-analysis-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analysis-history.component.html',
  styleUrls: ['./analysis-history.component.css']
})
export class AnalysisHistoryComponent implements OnInit, OnDestroy {
  analysisHistory: AnalysisHistory[] = [];
  selectedAnalysis: AnalysisHistory | null = null;
  analysisDetails: AnalysisDetail[] = [];
  
  loading = false;
  loadingDetails = false;
  exportingExcel = false;
  
  private apiUrl = environment.apiUrl;
  
  // List pagination
  currentPage = 1;
  totalPages = 1;
  totalItems = 0;
  limit = 20;
  
  // Details pagination
  detailsPage = 1;
  detailsTotalPages = 1;
  detailsLimit = 50; // Increased for better performance
  totalResults = 0;
  
  // View state
  showDetails = false;
  
  // Performance optimization
  detailsCache = new Map<string, { data: AnalysisDetail[], totalPages: number, totalResults: number }>();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private el: ElementRef,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {
    this.loadAnalysisHistory();
  }

  async loadAnalysisHistory() {
    this.loading = true;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const response = await this.http.get<{
        success: boolean,
        analyses: AnalysisHistory[],
        pagination: {
          currentPage: number,
          totalPages: number,
          totalAnalyses: number,
          limit: number,
          hasNextPage: boolean,
          hasPrevPage: boolean
        }
      }>(`${this.apiUrl}/analysis-history?page=${this.currentPage}&limit=${this.limit}`, { headers }).toPromise();      if (response && response.success) {
        this.analysisHistory = response.analyses;
        this.totalItems = response.pagination.totalAnalyses;
        this.currentPage = response.pagination.currentPage;
        this.totalPages = response.pagination.totalPages;
      }
    } catch (error) {
      console.error('Error loading analysis history:', error);
    }
    this.loading = false;
  }

  async deleteAnalysis(analysisId: number) {
    if (!confirm('Are you sure you want to delete this analysis?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await this.http.delete(`${this.apiUrl}/analysis-history/${analysisId}`, { headers }).toPromise();
      await this.loadAnalysisHistory();
    } catch (error) {
      console.error('Error deleting analysis:', error);
    }
  }

  // Eagerly computed metrics for the open modal — avoids method calls in template
  selectedCNBMetrics: any = null;
  selectedBaselineMetrics: any = null;
  selectedIsInset = false;
  selectedTestSplit: number | null = null;
  selectedNeutralMin: number | null = null;
  selectedNeutralMax: number | null = null;

  async viewAnalysisDetails(analysis: AnalysisHistory) {
    this.selectedAnalysis = analysis;
    this.showDetails = true;
    this.detailsPage = 1;
    // Compute metrics once so the template only reads simple properties
    this.selectedCNBMetrics      = this.getComplementNBMetrics(analysis);
    this.selectedBaselineMetrics = this.getBaselineMetrics(analysis);
    this.selectedIsInset         = this.isInsetMode(analysis);
    const r = this.parseResults(analysis.sentiment_distribution);
    this.selectedTestSplit  = r.testSplit;
    this.selectedNeutralMin = r.neutralMin;
    this.selectedNeutralMax = r.neutralMax;
    this.renderer.addClass(this.document.body, 'modal-open');
    await this.loadAnalysisDetails();
  }

  viewAnalysisInsights(analysisId: number) {
    // Navigate to the analysis insights page
    this.router.navigate(['/analysis-insights', analysisId]);
  }

  async loadAnalysisDetails() {
    if (!this.selectedAnalysis) return;
    
    // Check cache first
    const cacheKey = `${this.selectedAnalysis.id}-${this.detailsPage}`;
    const cached = this.detailsCache.get(cacheKey);
    
    if (cached) {
      this.analysisDetails = cached.data;
      this.detailsTotalPages = cached.totalPages;
      this.totalResults = cached.totalResults;
      return;
    }
    
    this.loadingDetails = true;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const response = await this.http.get<{
        success: boolean,
        analysis: AnalysisHistory,
        results: AnalysisDetail[],
        pagination: {
          currentPage: number,
          totalPages: number,
          totalResults: number,
          limit: number,
          hasNextPage: boolean,
          hasPrevPage: boolean
        }
      }>(`${this.apiUrl}/analysis-history/${this.selectedAnalysis.id}/details?page=${this.detailsPage}&limit=${this.detailsLimit}`, { headers }).toPromise();
      
      if (response && response.success) {
        this.analysisDetails = response.results;
        this.detailsPage = response.pagination.currentPage;
        this.detailsTotalPages = response.pagination.totalPages;
        this.totalResults = response.pagination.totalResults;
        
        // Cache the results
        this.detailsCache.set(cacheKey, {
          data: [...this.analysisDetails],
          totalPages: this.detailsTotalPages,
          totalResults: this.totalResults
        });
        
        // Limit cache size to prevent memory issues
        if (this.detailsCache.size > 10) {
          const firstKey = this.detailsCache.keys().next().value;
          if (firstKey) {
            this.detailsCache.delete(firstKey);
          }
        }
      }
    } catch (error) {
      console.error('Error loading analysis details:', error);
      // Show user-friendly error message
      this.analysisDetails = [];
      this.totalResults = 0;
    } finally {
      this.loadingDetails = false;
    }
  }

  closeDetails() {
    this.showDetails = false;
    this.selectedAnalysis = null;
    this.selectedCNBMetrics = null;
    this.selectedBaselineMetrics = null;
    this.selectedIsInset = false;
    this.selectedTestSplit = null;
    this.selectedNeutralMin = null;
    this.selectedNeutralMax = null;
    this.analysisDetails = [];
    this.renderer.removeClass(this.document.body, 'modal-open');
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadAnalysisHistory();
    }
  }

  async changeDetailsPage(page: number) {
    this.detailsPage = page;
    await this.loadAnalysisDetails();
  }

  get hasNextPage(): boolean {
    return this.currentPage < this.totalPages;
  }

  get hasPrevPage(): boolean {
    return this.currentPage > 1;
  }

  get hasNextDetailsPage(): boolean {
    return this.detailsPage < this.detailsTotalPages;
  }

  get hasPrevDetailsPage(): boolean {
    return this.detailsPage > 1;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getSentimentColor(sentiment: string): string {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return '#28a745';
      case 'negative': return '#dc3545';
      case 'neutral': return '#6c757d';
      default: return '#6c757d';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#28a745';
      case 'failed': return '#dc3545';
      case 'processing': return '#ffc107';
      case 'pending': return '#6c757d';
      default: return '#6c757d';
    }
  }

  getAnalysisTypeIcon(type: string): string {
    return type === 'api' ? '🔗' : '👤';
  }

  private parseResults(distributionStr: string): {
    sentimentCounts: Record<string, number>,
    trainingMetrics: any | null,
    testMetrics: any | null,
    baselineTestMetrics: any | null,
    isInsetMode: boolean,
    testSplit: number | null,
    neutralMin: number | null,
    neutralMax: number | null
  } {
    const empty = { sentimentCounts: {}, trainingMetrics: null, testMetrics: null, baselineTestMetrics: null, isInsetMode: false, testSplit: null, neutralMin: null, neutralMax: null };
    if (!distributionStr) return empty;
    try {
      const parsed = JSON.parse(distributionStr);

      if (parsed.sentimentCounts) {
        return {
          sentimentCounts: parsed.sentimentCounts,
          trainingMetrics: parsed.trainingMetrics || null,
          testMetrics: parsed.testMetrics || null,
          baselineTestMetrics: parsed.baselineTestMetrics || null,
          isInsetMode: !!parsed.isInsetMode,
          testSplit: parsed.testSplit ?? null,
          neutralMin: parsed.neutralMin ?? null,
          neutralMax: parsed.neutralMax ?? null
        };
      }

      if (parsed.sentimentDistribution) {
        return { ...empty, sentimentCounts: parsed.sentimentDistribution };
      }

      if (parsed.positive !== undefined || parsed.negative !== undefined || parsed.neutral !== undefined) {
        return { ...empty, sentimentCounts: parsed };
      }

      return empty;
    } catch {
      return empty;
    }
  }

  getSentimentCount(distributionStr: string, sentiment: string): number {
    return this.parseResults(distributionStr).sentimentCounts[sentiment] || 0;
  }

  getMetrics(analysis: AnalysisHistory): any | null {
    const r = this.parseResults(analysis.sentiment_distribution);
    return r.testMetrics || r.trainingMetrics;
  }

  getBaselineMetrics(analysis: AnalysisHistory): any | null {
    return this.parseResults(analysis.sentiment_distribution).baselineTestMetrics;
  }

  isInsetMode(analysis: AnalysisHistory): boolean {
    return this.parseResults(analysis.sentiment_distribution).isInsetMode;
  }

  isTestMetrics(analysis: AnalysisHistory): boolean {
    return !!this.parseResults(analysis.sentiment_distribution).testMetrics;
  }

  getTestSplit(analysis: AnalysisHistory): number | null {
    return this.parseResults(analysis.sentiment_distribution).testSplit;
  }

  /** Returns testMetrics if it uses the new per_class format (ComplementNB output) */
  getComplementNBMetrics(analysis: AnalysisHistory): any | null {
    const r = this.parseResults(analysis.sentiment_distribution);
    return r.testMetrics?.per_class ? r.testMetrics : null;
  }

  /** Safe accessor for per_class data — avoids ?.[dynamic] in templates */
  getPerClassData(metrics: any, cls: string): any {
    if (!metrics || !metrics.per_class) return null;
    return metrics.per_class[cls] || null;
  }

  fmtPct(v: number | undefined | null): string {
    return v != null ? (v * 100).toFixed(2) + '%' : 'N/A';
  }

  formatPercent(value: number | undefined): string {
    if (value == null) return 'N/A';
    return (value * 100).toFixed(1) + '%';
  }

  formatScore(value: number | undefined): string {
    if (value == null) return 'N/A';
    return value.toFixed(4);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Helper methods for enhanced table
  trackByFn(index: number, item: AnalysisDetail): number {
    return item.id;
  }

  truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  getSentimentIcon(sentiment: string): string {
    switch(sentiment?.toLowerCase()) {
      case 'positive': return 'fas fa-smile';
      case 'negative': return 'fas fa-frown';
      case 'neutral': return 'fas fa-meh';
      default: return 'fas fa-question';
    }
  }

  getConfidenceScore(detail: AnalysisDetail): string {
    const confidence = detail.prediction_confidence || detail.confidence;
    if (confidence) {
      return (confidence * 100).toFixed(1) + '%';
    }
    return 'N/A';
  }

  getConfidenceValue(detail: AnalysisDetail): number {
    return detail.prediction_confidence || detail.confidence || 0;
  }

  getConfidenceClass(confidence: number): string {
    if (confidence > 0.8) return 'high-confidence';
    if (confidence > 0.6) return 'medium-confidence';
    return 'low-confidence';
  }

  formatTimestamp(timestamp: string): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getVisiblePages(): (number | string)[] {
    const pages: (number | string)[] = [];
    const totalPages = this.detailsTotalPages;
    const currentPage = this.detailsPage;
    
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 4) {
        pages.push('...');
      }
      
      // Show current page and surrounding pages
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 3) {
        pages.push('...');
      }
      
      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  }

  // Handle page click for mixed number/string pages
  onPageClick(page: number | string): void {
    if (typeof page === 'number') {
      this.changeDetailsPage(page);
    }
  }

  // Export all results as Excel via backend endpoint
  async exportResults(): Promise<void> {
    if (!this.selectedAnalysis || this.exportingExcel) return;
    this.exportingExcel = true;
    try {
      const token = localStorage.getItem('token');
      const response = await this.http.get(
        `${this.apiUrl}/analysis-history/${this.selectedAnalysis.id}/export/excel`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      ).toPromise();

      const blob = response as Blob;
      const url = URL.createObjectURL(blob);
      const a = this.renderer.createElement('a') as HTMLAnchorElement;
      a.href = url;
      const safeName = (this.selectedAnalysis.analysis_name || 'analisis')
        .replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').substring(0, 50);
      a.download = `${safeName}_${Date.now()}.xlsx`;
      this.renderer.appendChild(this.document.body, a);
      a.click();
      this.renderer.removeChild(this.document.body, a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export Excel error:', error);
      alert('Gagal mengekspor Excel. Coba lagi.');
    } finally {
      this.exportingExcel = false;
    }
  }

  // Expose Math to template
  get Math() {
    return Math;
  }

  ngOnDestroy() {
    // Clean up body class if modal was open when component is destroyed
    this.renderer.removeClass(this.document.body, 'modal-open');
  }
}
