import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface WordLibrary {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  word_count: number;
  sample_count: number;
}

interface ClassMetric {
  precision: number;
  recall: number;
  'f1-score': number;
  support: number;
}

interface ModelMetrics {
  source: 'test_set' | 'training_set';
  // New ComplementNB format
  accuracy?: number;
  per_class?: { [cls: string]: { precision: number; recall: number; f1: number; support: number } };
  macro_avg?: { precision: number; recall: number; f1: number };
  // Old format
  test_accuracy?: number;
  training_accuracy?: number;
  cross_validation_mean?: number;
  cross_validation_std?: number;
  train_samples?: number;
  test_samples?: number;
  testSplit?: number;
  classification_report?: {
    positive?: ClassMetric;
    negative?: ClassMetric;
    neutral?: ClassMetric;
    'weighted avg'?: ClassMetric;
  };
}

interface LatestMetricsResponse {
  success: boolean;
  metrics: ModelMetrics | null;
  analysis: {
    id: number;
    session_name: string;
    analysis_type: string;
    training_samples: number;
    created_at: string;
  } | null;
}

interface Word {
  word: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  weight: number;
}

interface Sample {
  id: number;
  tweet_text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

@Component({
  selector: 'app-train-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './train-data.component.html',
  styleUrls: ['./train-data.component.css']
})
export class TrainDataComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  // keep DOM access minimal; no body-class manipulation
  
  // Library management
  libraries: WordLibrary[] = [];
  selectedLibraryId: number | null = null;
  selectedLibrary: WordLibrary | null = null;
  
  // Word management
  words: {
    positive: Word[];
    negative: Word[];
    neutral: Word[];
  } = { positive: [], negative: [], neutral: [] };
  newWords: string = '';
  newWordSentiment: 'positive' | 'negative' | 'neutral' = 'positive';
  
  // Sample management
  samples: {
    positive: Sample[];
    negative: Sample[];
    neutral: Sample[];
  } = { positive: [], negative: [], neutral: [] };
  newSampleText: string = '';
  newSampleSentiment: 'positive' | 'negative' | 'neutral' = 'positive';
  
  // Dialog management
  showCreateDialog = false;
  newLibraryName = '';
  newLibraryDescription = '';
  
  // Edit state for words
  editingWord: string | null = null;
  editWordText: string = '';
  editWordSentiment: 'positive' | 'negative' | 'neutral' = 'positive';
  
  // Edit state for samples
  editingSampleId: number | null = null;
  editSampleText: string = '';
  editSampleSentiment: 'positive' | 'negative' | 'neutral' = 'positive';
  
  // Pagination for words
  wordsCurrentPage = 1;
  wordsItemsPerPage = 50;
  
  // Pagination for samples
  samplesCurrentPage = 1;
  samplesItemsPerPage = 20;
  
  // Bulk selection for words
  selectedWords: Set<string> = new Set();
  selectAllWords = false;
  
  // Bulk selection for samples
  selectedSamples: Set<number> = new Set();
  selectAllSamples = false;

  // Sentiment filter & go-to-page for samples
  sampleSentimentFilter: 'all' | 'positive' | 'negative' | 'neutral' = 'all';
  samplesGoToPage = 1;

  // UI state
  loading = false;
  successMsg = '';
  errorMsg = '';

  // Model metrics
  latestMetrics: ModelMetrics | null = null;
  latestMetricsAnalysis: LatestMetricsResponse['analysis'] = null;
  metricsLoading = false;
  metricsSource: 'library' | 'analysis' | null = null;
  metricsReason: string | null = null; // reason if metrics unavailable
  metricsDistribution: { positive: number; negative: number; neutral: number } | null = null;

  // Computed property for all words combined
  get allWords(): Word[] {
    return [
      ...this.words.positive,
      ...this.words.negative,
      ...this.words.neutral
    ].sort((a, b) => a.word.localeCompare(b.word));
  }

  // Paginated words
  get paginatedWords(): Word[] {
    const startIndex = (this.wordsCurrentPage - 1) * this.wordsItemsPerPage;
    const endIndex = startIndex + this.wordsItemsPerPage;
    return this.allWords.slice(startIndex, endIndex);
  }

  // Total pages for words
  get wordsTotalPages(): number {
    return Math.ceil(this.allWords.length / this.wordsItemsPerPage);
  }

  // Words page numbers array
  get wordsPageNumbers(): number[] {
    return Array.from({ length: this.wordsTotalPages }, (_, i) => i + 1);
  }

  // Computed property for all samples combined (unfiltered)
  get allSamples(): Sample[] {
    return [
      ...this.samples.positive,
      ...this.samples.negative,
      ...this.samples.neutral
    ];
  }

  // Filtered samples based on sampleSentimentFilter
  get filteredSamples(): Sample[] {
    if (this.sampleSentimentFilter === 'all') return this.allSamples;
    return this.allSamples.filter(s => s.sentiment === this.sampleSentimentFilter);
  }

  // Paginated samples (from filtered)
  get paginatedSamples(): Sample[] {
    const startIndex = (this.samplesCurrentPage - 1) * this.samplesItemsPerPage;
    const endIndex = startIndex + this.samplesItemsPerPage;
    return this.filteredSamples.slice(startIndex, endIndex);
  }

  // Total pages for samples (based on filtered)
  get samplesTotalPages(): number {
    return Math.ceil(this.filteredSamples.length / this.samplesItemsPerPage);
  }

  // Smart page numbers: first, last, and up to 2 around current; null = ellipsis
  get samplesVisiblePageNumbers(): (number | null)[] {
    const total = this.samplesTotalPages;
    const current = this.samplesCurrentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | null)[] = [1];
    if (current > 3) pages.push(null);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) pages.push(p);
    if (current < total - 2) pages.push(null);
    pages.push(total);
    return pages;
  }

  // Pagination methods for words
  goToWordsPage(page: number) {
    if (page >= 1 && page <= this.wordsTotalPages) {
      this.wordsCurrentPage = page;
      this.editingWord = null; // Cancel any editing when changing pages
    }
  }

  previousWordsPage() {
    if (this.wordsCurrentPage > 1) {
      this.wordsCurrentPage--;
      this.editingWord = null;
    }
  }

  nextWordsPage() {
    if (this.wordsCurrentPage < this.wordsTotalPages) {
      this.wordsCurrentPage++;
      this.editingWord = null;
    }
  }

  // Pagination methods for samples
  goToSamplesPage(page: number) {
    if (page >= 1 && page <= this.samplesTotalPages) {
      this.samplesCurrentPage = page;
      this.samplesGoToPage = page;
      this.editingSampleId = null;
    }
  }

  previousSamplesPage() {
    if (this.samplesCurrentPage > 1) {
      this.samplesCurrentPage--;
      this.samplesGoToPage = this.samplesCurrentPage;
      this.editingSampleId = null;
    }
  }

  nextSamplesPage() {
    if (this.samplesCurrentPage < this.samplesTotalPages) {
      this.samplesCurrentPage++;
      this.samplesGoToPage = this.samplesCurrentPage;
      this.editingSampleId = null;
    }
  }

  goToSamplesPageFromInput() {
    const page = Math.round(this.samplesGoToPage);
    this.goToSamplesPage(page);
  }

  setSampleFilter(filter: 'all' | 'positive' | 'negative' | 'neutral') {
    this.sampleSentimentFilter = filter;
    this.samplesCurrentPage = 1;
    this.samplesGoToPage = 1;
    this.editingSampleId = null;
  }

  // Bulk selection methods for words
  toggleWordSelection(word: string) {
    if (this.selectedWords.has(word)) {
      this.selectedWords.delete(word);
    } else {
      this.selectedWords.add(word);
    }
    this.updateSelectAllWords();
  }

  toggleSelectAllWordsOnPage() {
    if (this.areAllWordsOnPageSelected()) {
      // Deselect all on current page
      this.paginatedWords.forEach(word => this.selectedWords.delete(word.word));
    } else {
      // Select all on current page
      this.paginatedWords.forEach(word => this.selectedWords.add(word.word));
    }
    this.updateSelectAllWords();
  }

  areAllWordsOnPageSelected(): boolean {
    return this.paginatedWords.length > 0 && 
           this.paginatedWords.every(word => this.selectedWords.has(word.word));
  }

  updateSelectAllWords() {
    this.selectAllWords = this.areAllWordsOnPageSelected();
  }

  async deleteSelectedWords() {
    if (this.selectedWords.size === 0) return;
    
    if (!confirm(`Delete ${this.selectedWords.size} selected word(s)?`)) return;

    this.loading = true;
    let deletedCount = 0;
    
    try {
      for (const word of this.selectedWords) {
        try {
          await this.http.delete<any>(
            `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words/${encodeURIComponent(word)}`, 
            { headers: this.getHeaders() }
          ).toPromise();
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete word "${word}":`, error);
        }
      }
      
      this.successMsg = `Deleted ${deletedCount} word(s) successfully`;
      this.selectedWords.clear();
      this.selectAllWords = false;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 3000);
    } catch (error) {
      console.error('Failed to delete words:', error);
      this.errorMsg = 'Failed to delete some words';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  clearWordSelection() {
    this.selectedWords.clear();
    this.selectAllWords = false;
  }

  // Bulk selection methods for samples
  toggleSampleSelection(sampleId: number) {
    if (this.selectedSamples.has(sampleId)) {
      this.selectedSamples.delete(sampleId);
    } else {
      this.selectedSamples.add(sampleId);
    }
    this.updateSelectAllSamples();
  }

  toggleSelectAllSamplesOnPage() {
    if (this.areAllSamplesOnPageSelected()) {
      // Deselect all on current page
      this.paginatedSamples.forEach(sample => this.selectedSamples.delete(sample.id));
    } else {
      // Select all on current page
      this.paginatedSamples.forEach(sample => this.selectedSamples.add(sample.id));
    }
    this.updateSelectAllSamples();
  }

  areAllSamplesOnPageSelected(): boolean {
    return this.paginatedSamples.length > 0 && 
           this.paginatedSamples.every(sample => this.selectedSamples.has(sample.id));
  }

  updateSelectAllSamples() {
    this.selectAllSamples = this.areAllSamplesOnPageSelected();
  }

  async deleteSelectedSamples() {
    if (this.selectedSamples.size === 0) return;
    
    if (!confirm(`Delete ${this.selectedSamples.size} selected sample(s)?`)) return;

    this.loading = true;
    let deletedCount = 0;
    
    try {
      for (const sampleId of this.selectedSamples) {
        try {
          await this.http.delete<any>(
            `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples/${sampleId}`, 
            { headers: this.getHeaders() }
          ).toPromise();
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete sample ${sampleId}:`, error);
        }
      }
      
      this.successMsg = `Deleted ${deletedCount} sample(s) successfully`;
      this.selectedSamples.clear();
      this.selectAllSamples = false;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 3000);
    } catch (error) {
      console.error('Failed to delete samples:', error);
      this.errorMsg = 'Failed to delete some samples';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  clearSampleSelection() {
    this.selectedSamples.clear();
    this.selectAllSamples = false;
  }

  ngOnInit() {
    this.loadLibraries();
    this.loadLatestMetrics();
  }

  async loadLatestMetrics() {
    this.metricsLoading = true;
    try {
      const response = await this.http.get<LatestMetricsResponse>(
        `${this.apiUrl}/analysis-history/latest-metrics`,
        { headers: this.getHeaders() }
      ).toPromise();
      if (response?.success) {
        this.latestMetrics = response.metrics;
        this.latestMetricsAnalysis = response.analysis;
        this.metricsSource = response.metrics ? 'analysis' : null;
      }
    } catch (error) {
      console.error('Failed to load latest metrics:', error);
    }
    this.metricsLoading = false;
  }

  async computeLibraryMetrics() {
    if (!this.selectedLibraryId) return;
    this.metricsLoading = true;
    this.metricsReason = null;
    try {
      const response = await this.http.post<any>(
        `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/compute-metrics`,
        {},
        { headers: this.getHeaders() }
      ).toPromise();
      if (response?.success) {
        if (response.metrics) {
          this.latestMetrics = response.metrics;
          this.latestMetricsAnalysis = null;
          this.metricsSource = 'library';
          this.metricsDistribution = response.distribution;
        } else {
          this.metricsReason = response.reason || 'Tidak cukup data untuk evaluasi.';
        }
      }
    } catch (error) {
      console.error('Failed to compute library metrics:', error);
      this.metricsReason = 'Gagal menghitung metrik. Coba lagi nanti.';
    }
    this.metricsLoading = false;
  }

  getAccuracy(): number {
    if (!this.latestMetrics) return 0;
    // Support both new format (accuracy) and old format (test_accuracy / training_accuracy)
    return (this.latestMetrics.test_accuracy ?? this.latestMetrics.accuracy ?? this.latestMetrics.training_accuracy ?? 0) * 100;
  }

  /** Safe accessor for per-class data (avoids ?.[dynamic] in templates) */
  getPerClass(cls: string): { precision: number; recall: number; f1: number; support: number } | null {
    return this.latestMetrics?.per_class?.[cls] ?? null;
  }

  getAccuracyLevel(): 'good' | 'medium' | 'poor' {
    const acc = this.getAccuracy();
    if (acc >= 70) return 'good';
    if (acc >= 50) return 'medium';
    return 'poor';
  }

  fmt4(v: number | undefined): string { return v != null ? (v * 100).toFixed(1) + '%' : 'N/A'; }
  fmt6(v: number | undefined): string { return v != null ? v.toFixed(4) : 'N/A'; }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  // Library management
  async loadLibraries() {
    this.loading = true;
    try {
      const response = await this.http.get<any>(`${this.apiUrl}/word-libraries`, { 
        headers: this.getHeaders() 
      }).toPromise();
      
      if (response.success) {
        this.libraries = response.libraries;
      }
    } catch (error) {
      console.error('Failed to load libraries:', error);
      this.errorMsg = 'Failed to load word libraries';
    }
    this.loading = false;
  }

  async loadLibraryDetails() {
    if (!this.selectedLibraryId) {
      this.selectedLibrary = null;
      this.words = { positive: [], negative: [], neutral: [] };
      this.samples = { positive: [], negative: [], neutral: [] };
      // Revert to last-analysis metrics when library is deselected
      this.latestMetrics = null;
      this.metricsSource = null;
      this.metricsDistribution = null;
      this.metricsReason = null;
      this.loadLatestMetrics();
      return;
    }

    // Clear library-specific metrics while loading so stale data isn't shown
    this.latestMetrics = null;
    this.metricsSource = null;
    this.metricsDistribution = null;
    this.metricsReason = null;

    this.loading = true;
    try {
      const response = await this.http.get<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}`, {
        headers: this.getHeaders()
      }).toPromise();

      if (response.success) {
        this.selectedLibrary = response.library;
        this.words = response.words;
        this.samples = response.samples;

        // Auto-compute metrics if library has enough samples (>=15 = 5 per class)
        const totalSamples = this.allSamples.length;
        if (totalSamples >= 15) {
          this.computeLibraryMetrics();
        } else {
          // Don't fall back to analysis metrics — show a clear reason instead
          this.metricsReason = `Butuh minimal 15 sampel berlabel (5 per kelas) untuk evaluasi otomatis. Saat ini: ${totalSamples}.`;
        }
      }
    } catch (error) {
      console.error('Failed to load library details:', error);
      this.errorMsg = 'Failed to load library details';
    }
    this.loading = false;
  }

  showCreateLibraryDialog() {
    this.showCreateDialog = true;
    this.newLibraryName = '';
    this.newLibraryDescription = '';
  }

  cancelCreateLibrary() {
    this.showCreateDialog = false;
  }

  async createLibrary() {
    if (!this.newLibraryName.trim()) return;

    this.loading = true;
    try {
      const response = await this.http.post<any>(`${this.apiUrl}/word-libraries`, {
        name: this.newLibraryName,
        description: this.newLibraryDescription
      }, { headers: this.getHeaders() }).toPromise();
      
      if (response.success) {
        this.successMsg = 'Library created successfully';
        this.showCreateDialog = false;
        await this.loadLibraries();
        this.selectedLibraryId = response.libraryId;
        await this.loadLibraryDetails();
        setTimeout(() => this.successMsg = '', 3000);
      }
    } catch (error) {
      console.error('Failed to create library:', error);
      this.errorMsg = 'Failed to create library';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  async deleteLibrary() {
    if (!this.selectedLibraryId || !confirm('Are you sure you want to delete this library?')) return;

    this.loading = true;
    try {
      const response = await this.http.delete<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}`, { 
        headers: this.getHeaders() 
      }).toPromise();
      
      if (response.success) {
        this.successMsg = 'Library deleted successfully';
        this.selectedLibraryId = null;
        this.selectedLibrary = null;
        await this.loadLibraries();
        setTimeout(() => this.successMsg = '', 3000);
      }
    } catch (error: any) {
      console.error('Failed to delete library:', error);
      this.errorMsg = error.error?.error || 'Failed to delete library';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  // Word management
  async addWords() {
    if (!this.selectedLibraryId || !this.newWords.trim()) return;

    const wordArray = this.newWords
      .split(/[,\n]/)
      .map(w => w.trim())
      .filter(w => w.length > 0);

    this.loading = true;
    try {
      const response = await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
        words: wordArray,
        sentiment: this.newWordSentiment
      }, { headers: this.getHeaders() }).toPromise();
      
      if (response.success) {
        this.successMsg = `Added ${response.added} word(s)`;
        this.newWords = '';
        await this.loadLibraryDetails();
        setTimeout(() => this.successMsg = '', 3000);
      }
    } catch (error) {
      console.error('Failed to add words:', error);
      this.errorMsg = 'Failed to add words';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  // CSV Import for Words
  async onCsvFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!this.selectedLibraryId) {
      this.errorMsg = 'Please select a library first';
      setTimeout(() => this.errorMsg = '', 3000);
      return;
    }

    this.loading = true;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line: string) => line.trim());
      
      const wordsBySentiment: { [key: string]: string[] } = {
        positive: [],
        negative: [],
        neutral: []
      };

      let importedCount = 0;
      let skippedCount = 0;

      for (const line of lines) {
        const [word, sentiment] = line.split(',').map((s: string) => s.trim());
        
        if (word && sentiment && ['positive', 'negative', 'neutral'].includes(sentiment.toLowerCase())) {
          const sent = sentiment.toLowerCase() as 'positive' | 'negative' | 'neutral';
          if (!wordsBySentiment[sent].includes(word)) {
            wordsBySentiment[sent].push(word);
            importedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }

      // Import each sentiment group
      for (const [sentiment, wordList] of Object.entries(wordsBySentiment)) {
        if (wordList.length > 0) {
          await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
            words: wordList,
            sentiment: sentiment
          }, { headers: this.getHeaders() }).toPromise();
        }
      }

      this.successMsg = `Imported ${importedCount} words successfully${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 4000);
      
      // Clear file input
      event.target.value = '';
    } catch (error) {
      console.error('Failed to import CSV:', error);
      this.errorMsg = 'Failed to import CSV file. Please check the format.';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  // CSV Import for Samples
  async onSampleCsvFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!this.selectedLibraryId) {
      this.errorMsg = 'Please select a library first';
      setTimeout(() => this.errorMsg = '', 3000);
      return;
    }

    this.loading = true;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line: string) => line.trim());
      
      let importedCount = 0;
      let skippedCount = 0;
      let totalNewWords = 0;

      // Collect all words by sentiment to batch upload
      const wordsBySentiment: { [key: string]: Set<string> } = {
        positive: new Set(),
        negative: new Set(),
        neutral: new Set()
      };

      for (const line of lines) {
        const [tweetText, sentiment] = line.split(',').map((s: string) => s.trim());
        
        if (tweetText && sentiment && ['positive', 'negative', 'neutral'].includes(sentiment.toLowerCase())) {
          try {
            const sent = sentiment.toLowerCase() as 'positive' | 'negative' | 'neutral';
            
            // Add the sample
            await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples`, {
              tweetText: tweetText,
              sentiment: sent
            }, { headers: this.getHeaders() }).toPromise();
            
            // Extract words and add to set
            const newWords = this.extractWordsFromTweet(tweetText, sent);
            newWords.forEach(word => wordsBySentiment[sent].add(word));
            
            importedCount++;
          } catch (error) {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }

      // Upload all extracted words by sentiment
      for (const [sentiment, wordSet] of Object.entries(wordsBySentiment)) {
        const wordArray = Array.from(wordSet);
        if (wordArray.length > 0) {
          try {
            const response = await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
              words: wordArray,
              sentiment: sentiment
            }, { headers: this.getHeaders() }).toPromise();
            
            if (response.success && response.added) {
              totalNewWords += response.added;
            }
          } catch (error) {
            console.error(`Failed to add words for ${sentiment}:`, error);
          }
        }
      }

      this.successMsg = `Imported ${importedCount} samples with ${totalNewWords} new word(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 5000);
      
      // Clear file input
      event.target.value = '';
    } catch (error) {
      console.error('Failed to import samples CSV:', error);
      this.errorMsg = 'Failed to import samples CSV file. Please check the format.';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  startEditWord(word: Word) {
    this.editingWord = word.word;
    this.editWordText = word.word;
    this.editWordSentiment = word.sentiment;
  }

  cancelEditWord() {
    this.editingWord = null;
    this.editWordText = '';
  }

  async updateWord(oldWord: string) {
    if (!this.selectedLibraryId || !this.editWordText.trim()) return;

    this.loading = true;
    try {
      // Delete old word
      await this.http.delete<any>(
        `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words/${encodeURIComponent(oldWord)}`, 
        { headers: this.getHeaders() }
      ).toPromise();

      // Add new word
      await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
        words: [this.editWordText.trim()],
        sentiment: this.editWordSentiment
      }, { headers: this.getHeaders() }).toPromise();

      this.successMsg = 'Word updated successfully';
      this.editingWord = null;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 2000);
    } catch (error) {
      console.error('Failed to update word:', error);
      this.errorMsg = 'Failed to update word';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  async deleteWord(word: string) {
    if (!this.selectedLibraryId || !confirm(`Delete word "${word}"?`)) return;

    try {
      const response = await this.http.delete<any>(
        `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words/${encodeURIComponent(word)}`, 
        { headers: this.getHeaders() }
      ).toPromise();
      
      if (response.success) {
        this.successMsg = 'Word deleted';
        await this.loadLibraryDetails();
        setTimeout(() => this.successMsg = '', 2000);
      }
    } catch (error) {
      console.error('Failed to delete word:', error);
      this.errorMsg = 'Failed to delete word';
      setTimeout(() => this.errorMsg = '', 3000);
    }
  }

  // Helper function to extract unique words from tweet text
  private extractWordsFromTweet(tweetText: string, sentiment: 'positive' | 'negative' | 'neutral'): string[] {
    const words = tweetText
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^\w]/g, ''))
      // Must start with a letter, min 3 chars — mirrors Python token_pattern
      .filter(w => /^[a-z][a-z0-9]{2,}$/.test(w));

    // Get existing words for this sentiment
    const existingWords = this.words[sentiment].map(w => w.word.toLowerCase());
    
    // Return only unique new words
    return [...new Set(words)].filter(word => !existingWords.includes(word));
  }

  // Sample management
  async addSample() {
    if (!this.selectedLibraryId || !this.newSampleText.trim()) return;

    this.loading = true;
    try {
      // Add the sample
      const response = await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples`, {
        tweetText: this.newSampleText,
        sentiment: this.newSampleSentiment
      }, { headers: this.getHeaders() }).toPromise();
      
      if (response.success) {
        // Extract and add unique words from the tweet
        const newWords = this.extractWordsFromTweet(this.newSampleText, this.newSampleSentiment);
        
        if (newWords.length > 0) {
          await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
            words: newWords,
            sentiment: this.newSampleSentiment
          }, { headers: this.getHeaders() }).toPromise();
          
          this.successMsg = `Sample added successfully with ${newWords.length} new word(s)`;
        } else {
          this.successMsg = 'Sample added successfully (no new words)';
        }
        
        this.newSampleText = '';
        await this.loadLibraryDetails();
        setTimeout(() => this.successMsg = '', 3000);
      }
    } catch (error) {
      console.error('Failed to add sample:', error);
      this.errorMsg = 'Failed to add sample';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  startEditSample(sample: Sample) {
    this.editingSampleId = sample.id;
    this.editSampleText = sample.tweet_text;
    this.editSampleSentiment = sample.sentiment;
  }

  cancelEditSample() {
    this.editingSampleId = null;
    this.editSampleText = '';
  }

  async updateSample(sampleId: number) {
    if (!this.selectedLibraryId || !this.editSampleText.trim()) return;

    this.loading = true;
    try {
      // Delete old sample
      await this.http.delete<any>(
        `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples/${sampleId}`, 
        { headers: this.getHeaders() }
      ).toPromise();

      // Add new sample with extracted words
      const response = await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples`, {
        tweetText: this.editSampleText,
        sentiment: this.editSampleSentiment
      }, { headers: this.getHeaders() }).toPromise();

      if (response.success) {
        // Extract and add unique words
        const newWords = this.extractWordsFromTweet(this.editSampleText, this.editSampleSentiment);
        if (newWords.length > 0) {
          await this.http.post<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}/words`, {
            words: newWords,
            sentiment: this.editSampleSentiment
          }, { headers: this.getHeaders() }).toPromise();
        }
      }

      this.successMsg = 'Sample updated successfully';
      this.editingSampleId = null;
      await this.loadLibraryDetails();
      setTimeout(() => this.successMsg = '', 2000);
    } catch (error) {
      console.error('Failed to update sample:', error);
      this.errorMsg = 'Failed to update sample';
      setTimeout(() => this.errorMsg = '', 3000);
    }
    this.loading = false;
  }

  async deleteSample(sampleId: number) {
    if (!this.selectedLibraryId || !confirm('Delete this sample?')) return;

    try {
      const response = await this.http.delete<any>(
        `${this.apiUrl}/word-libraries/${this.selectedLibraryId}/samples/${sampleId}`, 
        { headers: this.getHeaders() }
      ).toPromise();
      
      if (response.success) {
        this.successMsg = 'Sample deleted';
        await this.loadLibraryDetails();
        setTimeout(() => this.successMsg = '', 2000);
      }
    } catch (error) {
      console.error('Failed to delete sample:', error);
      this.errorMsg = 'Failed to delete sample';
      setTimeout(() => this.errorMsg = '', 3000);
    }
  }
}
