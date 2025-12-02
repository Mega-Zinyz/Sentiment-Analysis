import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  username?: string;
  selected?: boolean;
  edited?: boolean;
  originalText?: string;
}

interface TweetDataset {
  id: number;
  name: string;
  description: string;
  created_at: string;
  tweet_count: number;
  last_updated: string;
  keywords: string;
}

interface ApiRateLimit {
  endpoint: string;
  limit: number;
  remaining: number;
  reset: number;
  resetTime: string;
}

@Component({
  selector: 'app-tweet-collection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tweet-collection.component.html',
  styleUrls: ['./tweet-collection.component.css']
})
export class TweetCollectionComponent implements OnInit {
  // Collection state
  currentView: 'datasets' | 'collect' | 'manage' = 'datasets';
  
  // Dataset management
  datasets: TweetDataset[] = [];
  selectedDataset: TweetDataset | null = null;
  
  // Tweet collection
  keyword: string = '';
  maxResults: number = 10;
  isCollecting: boolean = false;
  collectionProgress: string = '';
  
  // Tweet management
  tweets: Tweet[] = [];
  filteredTweets: Tweet[] = [];
  searchFilter: string = '';
  selectedTweets: Tweet[] = [];
  editingTweet: Tweet | null = null;
  
  // Pagination
  currentPage: number = 1;
  tweetsPerPage: number = 10;
  totalPages: number = 1;
  
  // Dataset creation
  newDatasetName: string = '';
  newDatasetDescription: string = '';
  showCreateDataset: boolean = false;
  
  // Messages
  successMessage: string = '';
  errorMessage: string = '';
  
  // API Rate Limits
  rateLimits: ApiRateLimit[] = [];
  showRateLimits: boolean = false;
  
  // Word Library Selection (for analysis)
  wordLibraries: any[] = [];
  selectedLibraryId: number | null = null;
  librarySelectionMode: 'existing' | 'new' = 'existing';
  newLibraryName: string = '';
  showLibrarySelection: boolean = false;
  isAnalyzing: boolean = false;
  analysisProgress: string = '';
  isAnalyzingDatasets: { [datasetId: number]: boolean } = {};

  constructor(
    private http: HttpClient,
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // Check authentication status before loading data
    if (!this.authService.isAuthenticated || this.authService.isTokenExpired()) {
      this.handleAuthenticationError('Please log in to access tweet datasets');
      return;
    }
    this.loadDatasets();
    this.loadWordLibraries();
  }

  // ========== Word Library Management ==========
  
  async loadWordLibraries() {
    try {
      const response = await this.http.get<any[]>(`${environment.apiUrl}/word-libraries`).toPromise();
      this.wordLibraries = response || [];
      
      // Auto-select first library if available
      if (this.wordLibraries.length > 0) {
        this.librarySelectionMode = 'existing';
        this.selectedLibraryId = this.wordLibraries[0].id;
      } else {
        this.librarySelectionMode = 'new';
      }
    } catch (error) {
      console.error('Error loading word libraries:', error);
    }
  }
  
  getSelectedLibraryName(): string {
    if (!this.selectedLibraryId) return '';
    const library = this.wordLibraries.find(lib => lib.id === this.selectedLibraryId);
    return library ? library.name : '';
  }

  // ========== Dataset Management ==========
  
  async loadDatasets() {
    try {
      // Double-check authentication before making API calls
      if (!this.authService.isAuthenticated || this.authService.isTokenExpired()) {
        this.handleAuthenticationError('Authentication required. Please log in again.');
        return;
      }

      const response = await this.http.get<TweetDataset[]>(`${environment.apiUrl}/tweet-datasets`).toPromise();
      this.datasets = response || [];
    } catch (error: any) {
      console.error('Error loading datasets:', error);
      if (error.status === 401) {
        this.handleAuthenticationError('Authentication failed. Please log in again.');
      } else {
        this.setError('Failed to load datasets');
      }
    }
  }

  async loadRateLimits() {
    try {
      if (!this.authService.isAuthenticated || this.authService.isTokenExpired()) {
        return;
      }

      console.log('📊 Loading rate limits...');
      const response = await this.http.get<{rateLimits: ApiRateLimit[]}>(`${environment.apiUrl}/rate-limits`).toPromise();
      this.rateLimits = response?.rateLimits || [];
      console.log('✅ Rate limits loaded:', this.rateLimits.length);
    } catch (error: any) {
      console.error('❌ Error loading rate limits:', error);
      console.error('❌ Error status:', error.status);
      console.error('❌ Error response:', error.error);
      
      // Handle specific error cases
      if (error.status === 400 && error.error?.needsConfiguration) {
        // API credentials not configured - this is expected for new users
        this.rateLimits = [{
          endpoint: 'Configuration Required',
          limit: 0,
          remaining: 0,
          reset: 0,
          resetTime: 'Please configure your Twitter API credentials first'
        }];
      } else if (error.status === 401) {
        // Authentication error
        this.rateLimits = [{
          endpoint: 'Authentication Error',
          limit: 0,
          remaining: 0,
          reset: 0,
          resetTime: 'Authentication failed. Please log in again.'
        }];
      } else {
        // Other errors - show generic message
        this.rateLimits = [{
          endpoint: 'Error Loading Limits',
          limit: 0,
          remaining: 0,
          reset: 0,
          resetTime: `Failed to load rate limits (${error.status})`
        }];
      }
    }
  }

  toggleRateLimits() {
    this.showRateLimits = !this.showRateLimits;
    if (this.showRateLimits && this.rateLimits.length === 0) {
      this.loadRateLimits();
    }
  }

  showCreateDatasetForm() {
    this.showCreateDataset = true;
    this.newDatasetName = '';
    this.newDatasetDescription = '';
  }

  hideCreateDatasetForm() {
    this.showCreateDataset = false;
  }

  async createDataset() {
    if (!this.newDatasetName.trim()) {
      this.setError('Dataset name is required');
      return;
    }

    try {
      const response = await this.http.post<TweetDataset>(`${environment.apiUrl}/tweet-datasets`, {
        name: this.newDatasetName.trim(),
        description: this.newDatasetDescription.trim()
      }).toPromise();

      if (response) {
        this.datasets.unshift(response);
        this.hideCreateDatasetForm();
        this.setSuccess('Dataset created successfully!');
      }
    } catch (error) {
      console.error('Error creating dataset:', error);
      this.setError('Failed to create dataset');
    }
  }

  async deleteDataset(dataset: TweetDataset) {
    if (!confirm(`Are you sure you want to delete "${dataset.name}"? This will also delete all tweets in this dataset.`)) {
      return;
    }

    try {
      console.log('Deleting dataset:', dataset);
      
      const response = await this.http.delete(`${environment.apiUrl}/tweet-datasets/${dataset.id}`).toPromise();
      console.log('Delete dataset response:', response);
      
      this.datasets = this.datasets.filter(d => d.id !== dataset.id);
      this.setSuccess(`Dataset "${dataset.name}" deleted successfully`);
      
      // If we deleted the currently selected dataset, clear selection
      if (this.selectedDataset && this.selectedDataset.id === dataset.id) {
        this.selectedDataset = null;
        this.tweets = [];
        this.filteredTweets = [];
        console.log('Cleared selected dataset and tweets');
      }
    } catch (error: any) {
      console.error('Error deleting dataset:', error);
      const errorMessage = error?.error?.error || error?.message || 'Failed to delete dataset';
      this.setError(errorMessage);
    }
  }

  // Trigger dataset-level analysis (uses backend: POST /api/tweet-datasets/:id/analyze)
  async analyzeDataset(dataset: TweetDataset) {
    if (!dataset) return;

    // Confirm with user
    if (!confirm(`Start sentiment analysis for dataset "${dataset.name}" (${dataset.tweet_count} tweets)?`)) return;

    // Ensure auth
    if (!this.authService.isAuthenticated || this.authService.isTokenExpired()) {
      this.handleAuthenticationError('Authentication required to start analysis');
      return;
    }

    this.isAnalyzingDatasets[dataset.id] = true;
    this.clearMessages();

    try {
      const payload: any = {};
      if (this.selectedLibraryId) payload.libraryId = this.selectedLibraryId;

      const response = await this.http.post<any>(`${environment.apiUrl}/tweet-datasets/${dataset.id}/analyze`, payload).toPromise();
      if (response && response.success) {
        this.setSuccess('Dataset analysis started. You can monitor progress in Analysis History.');
        // Optionally navigate to analysis history view
        setTimeout(() => this.router.navigate(['/analysis-history']), 1000);
      } else {
        this.setError(response?.error || 'Failed to start dataset analysis');
      }
    } catch (error: any) {
      console.error('Error starting dataset analysis:', error);
      this.setError(error?.error?.error || error?.message || 'Failed to start dataset analysis');
    } finally {
      this.isAnalyzingDatasets[dataset.id] = false;
    }
  }

  selectDataset(dataset: TweetDataset) {
    this.selectedDataset = dataset;
    this.currentView = 'manage';
    this.loadTweets();
  }

  // ========== Tweet Collection ==========
  
  goToCollection() {
    this.currentView = 'collect';
  }

  async collectTweets() {
    if (!this.keyword.trim()) {
      this.setError('Please enter a keyword');
      return;
    }

    if (!this.selectedDataset) {
      this.setError('Please select a dataset first');
      return;
    }

    this.isCollecting = true;
    this.collectionProgress = 'Fetching tweets...';
    this.clearMessages();

    try {
      const response = await this.http.post<any>(`${environment.apiUrl}/fetch-tweets`, {
        keyword: this.keyword,
        max_results: this.maxResults
      }).toPromise();

      if (response && response.data && response.data.length > 0) {
        this.collectionProgress = `Found ${response.data.length} tweets. Saving to dataset...`;
        
        // Save tweets to selected dataset
        await this.saveTweetsToDataset(response.data);
        
        // Check if mock data was used
        const mockDataMessage = response._mockData ? 
          ` (using mock data - upgrade Twitter API for real tweets)` : '';
        
        this.setSuccess(`Successfully collected ${response.data.length} tweets!${mockDataMessage}`);
        this.keyword = '';
        
        // Update dataset count
        this.loadDatasets();
        
        // Refresh rate limits after API call
        if (this.showRateLimits) {
          this.loadRateLimits();
        }
        
      } else {
        this.setError('No tweets found for this keyword');
      }
    } catch (error: any) {
      console.error('Error collecting tweets:', error);
      if (error.error?.needsConfiguration) {
        this.setError('Twitter API not configured. Please configure your API credentials first.');
      } else if (error.error?.allTokensExhausted) {
        this.setError('All API tokens have reached their monthly limit. Please try again next month.');
      } else {
        this.setError(error.error?.error || 'Failed to collect tweets');
      }
    } finally {
      this.isCollecting = false;
      this.collectionProgress = '';
    }
  }

  private async saveTweetsToDataset(tweets: any[]) {
    try {
      await this.http.post(`${environment.apiUrl}/tweet-datasets/${this.selectedDataset!.id}/tweets`, {
        tweets: tweets,
        keywords: this.keyword
      }).toPromise();
    } catch (error) {
      console.error('Error saving tweets to dataset:', error);
      throw error;
    }
  }

  // ========== Tweet Management ==========
  
  async loadTweets() {
    if (!this.selectedDataset) return;

    try {
      const response = await this.http.get<Tweet[]>(`${environment.apiUrl}/tweet-datasets/${this.selectedDataset.id}/tweets`).toPromise();
      this.tweets = response || [];
      this.applyFilter();
      this.updatePagination();
    } catch (error) {
      console.error('Error loading tweets:', error);
      this.setError('Failed to load tweets');
    }
  }

  applyFilter() {
    if (!this.searchFilter.trim()) {
      this.filteredTweets = [...this.tweets];
    } else {
      const filter = this.searchFilter.toLowerCase();
      this.filteredTweets = this.tweets.filter(tweet => 
        tweet.text.toLowerCase().includes(filter) ||
        (tweet.username && tweet.username.toLowerCase().includes(filter))
      );
    }
    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.filteredTweets.length / this.tweetsPerPage);
  }

  get paginatedTweets(): Tweet[] {
    const startIndex = (this.currentPage - 1) * this.tweetsPerPage;
    const endIndex = startIndex + this.tweetsPerPage;
    return this.filteredTweets.slice(startIndex, endIndex);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  toggleTweetSelection(tweet: Tweet) {
    tweet.selected = !tweet.selected;
    this.updateSelectedTweets();
  }

  selectAllTweets() {
    const allSelected = this.paginatedTweets.every(tweet => tweet.selected);
    this.paginatedTweets.forEach(tweet => {
      tweet.selected = !allSelected;
    });
    this.updateSelectedTweets();
  }

  updateSelectedTweets() {
    this.selectedTweets = this.tweets.filter(tweet => tweet.selected);
  }

  editTweet(tweet: Tweet) {
    if (!tweet.originalText) {
      tweet.originalText = tweet.text;
    }
    this.editingTweet = tweet;
  }

  saveTweetEdit() {
    if (this.editingTweet) {
      this.editingTweet.edited = true;
      this.editingTweet = null;
      // Here you could save to backend
      this.setSuccess('Tweet updated successfully');
    }
  }

  cancelTweetEdit() {
    if (this.editingTweet && this.editingTweet.originalText) {
      this.editingTweet.text = this.editingTweet.originalText;
    }
    this.editingTweet = null;
  }

  async deleteTweets() {
    if (this.selectedTweets.length === 0) {
      this.setError('Please select tweets to delete');
      return;
    }

    if (!confirm(`Delete ${this.selectedTweets.length} selected tweets?`)) {
      return;
    }

    try {
      const tweetIds = this.selectedTweets.map(t => t.id);
      console.log('Deleting tweets with IDs:', tweetIds);
      
      const response = await this.http.delete(`${environment.apiUrl}/tweet-datasets/${this.selectedDataset!.id}/tweets`, {
        body: { tweetIds }
      }).toPromise();
      
      console.log('Delete response:', response);

      // Filter out deleted tweets from the local array
      const beforeCount = this.tweets.length;
      this.tweets = this.tweets.filter(tweet => !tweetIds.includes(tweet.id));
      const afterCount = this.tweets.length;
      const deletedCount = beforeCount - afterCount;
      
      console.log(`Removed ${deletedCount} tweets from UI (${beforeCount} → ${afterCount})`);
      
      this.selectedTweets = [];
      this.applyFilter();
      this.setSuccess(`Successfully deleted ${deletedCount} tweets`);
    } catch (error: any) {
      console.error('Error deleting tweets:', error);
      const errorMessage = error?.error?.error || error?.message || 'Failed to delete tweets';
      this.setError(errorMessage);
    }
  }

  // ========== Analysis ==========
  
  analyzeSelectedTweets() {
    if (this.selectedTweets.length === 0) {
      this.setError('Please select tweets to analyze');
      return;
    }

    if (this.selectedTweets.length < 20) {
      this.setError('Please select at least 20 tweets for meaningful analysis');
      return;
    }

    // Show library selection modal
    this.showLibrarySelection = true;
  }
  
  closeLibrarySelection() {
    this.showLibrarySelection = false;
  }
  
  async startAnalysisWithLibrary() {
    // Validate library selection
    if (this.librarySelectionMode === 'existing' && !this.selectedLibraryId) {
      this.setError('Please select a word library');
      return;
    }
    
    if (this.librarySelectionMode === 'new' && !this.newLibraryName.trim()) {
      this.setError('Please enter a name for the new library');
      return;
    }
    
    this.isAnalyzing = true;
    this.analysisProgress = 'Preparing analysis...';
    
    try {
      // Step 1: Upload tweets to raw_twitter_data
      const sessionId = `XAPI_${Date.now()}`;
      const uploadData = {
        sessionId: sessionId,
        tweets: this.selectedTweets.map(tweet => ({
          tweet_id: tweet.id,
          tweet_text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.author_id,
          username: tweet.username || 'unknown'
        }))
      };
      
      this.analysisProgress = 'Uploading tweets...';
      await this.http.post(`${environment.apiUrl}/raw-data/upload-x-tweets`, uploadData).toPromise();
      
      // Step 2: Start sentiment analysis with library
      this.analysisProgress = 'Starting sentiment analysis...';
      const analysisPayload: any = {
        sessionId: sessionId,
        analysisType: 'library',
        libraryId: this.librarySelectionMode === 'existing' ? this.selectedLibraryId : null
      };
      
      if (this.librarySelectionMode === 'new') {
        analysisPayload.newLibraryName = this.newLibraryName.trim();
      }
      
      const response = await this.http.post(`${environment.apiUrl}/sentiment/analyze`, analysisPayload).toPromise();
      
      this.setSuccess('Analysis started successfully! Redirecting to analysis history...');
      this.showLibrarySelection = false;
      this.isAnalyzing = false;
      
      // Redirect to analysis history after 2 seconds
      setTimeout(() => {
        this.router.navigate(['/analysis-history']);
      }, 2000);
      
    } catch (error: any) {
      console.error('Error analyzing tweets:', error);
      this.setError(error.error?.message || 'Failed to analyze tweets');
      this.isAnalyzing = false;
    }
  }

  // ========== Navigation ==========
  
  backToDatasets() {
    this.currentView = 'datasets';
    this.selectedDataset = null;
    this.tweets = [];
    this.selectedTweets = [];
  }

  // ========== Utilities ==========
  
  setSuccess(message: string) {
    this.successMessage = message;
    this.errorMessage = '';
    setTimeout(() => this.successMessage = '', 5000);
  }

  setError(message: string) {
    this.errorMessage = message;
    this.successMessage = '';
  }

  clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }

  handleAuthenticationError(message: string) {
    this.setError(message + ' Redirecting to login...');
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 2000);
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToApiConfig() {
    // Navigate to home page where API configuration is typically handled
    this.router.navigate(['/home']);
  }

  hasConfigurationRequired(): boolean {
    return this.rateLimits.some(limit => limit.endpoint === 'Configuration Required');
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

  trackByTweetId(index: number, tweet: Tweet): string {
    return tweet.id;
  }

  // Getter methods for template (avoid arrow functions in templates)
  get allPaginatedTweetsSelected(): boolean {
    return this.paginatedTweets.length > 0 && this.paginatedTweets.every(tweet => tweet.selected);
  }

  get selectAllButtonText(): string {
    return this.allPaginatedTweetsSelected ? '☑️ Deselect All' : '☑️ Select All';
  }
}