import { Component, OnInit, ElementRef, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import Chart from 'chart.js/auto';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  private apiUrl = environment.apiUrl;
  
  inputText: string = '';
  sentimentResult: string = '';
  keyword: string = '';
  dataAmount: number = 50;
  tweets: any[] = [];
  tweetSentiments: { text: string, sentiment: string, date?: string, id?: string }[] = [];
  sentimentChart: any = null;
  sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  loadingTweets = false;
  loadingSentiment = false;
  savingToDatabase = false;
  errorMsg: string = '';
  successMsg: string = '';
  
  // API Configuration
  apiConfigured = false;
  showApiConfig = false;
  apiCredentials = {
    bearerToken: '',
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    accessTokenSecret: ''
  };
  configuringApi = false;
  
  // Animation states
  showSearchInput = true;
  showNumberInput = false;
  showSearchButton = false;
  animationStep = 1;
  canProceedToStep2 = false;
  canProceedToStep3 = false;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  async fetchTweets(event: Event) {
    event.preventDefault();
    this.tweets = [];
    this.tweetSentiments = [];
    this.errorMsg = '';
    this.successMsg = '';
    if (!this.keyword) return;
    
    this.loadingTweets = true;
    try {
      // Fetch tweets using HTTP client with authentication
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const data = await this.http.post<any>(`${this.apiUrl}/fetch-tweets`, {
        keyword: this.keyword, 
        max_results: this.dataAmount
      }, { headers }).toPromise();
      if (data.data) {
        this.tweets = data.data.map((t: any) => ({ id: t.id, text: t.text, editable: false }));
        // Automatically analyze sentiments
        await this.analyzeTweets();
        // Save to database
        await this.saveToDatabase();
      } else {
        this.errorMsg = data.error || 'No tweets found.';
        // If credentials are not configured, show the API config modal
        if (data.needsConfiguration) {
          this.apiConfigured = false;
          this.showApiConfig = true;
        }
      }
    } catch (err) {
      this.errorMsg = 'Failed to fetch tweets.';
    }
    this.loadingTweets = false;
  }

  async analyzeTweets() {
    this.tweetSentiments = [];
    this.loadingSentiment = true;
    this.sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    for (const tweet of this.tweets) {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const data = await this.http.post<any>(`${this.apiUrl}/analyze`, {
          text: tweet.text,
          keyword: this.keyword,
          tweetCount: this.tweets.length
        }, { headers }).toPromise();
        this.tweetSentiments.push({ text: tweet.text, sentiment: data.sentiment });
        if (['positive','negative','neutral'].includes(data.sentiment)) {
          (this.sentimentCounts as any)[data.sentiment]++;
        }
      } catch {
        this.tweetSentiments.push({ text: tweet.text, sentiment: 'Error' });
      }
    }
    this.loadingSentiment = false;
    setTimeout(() => this.renderChart(), 100);
  }

  renderChart() {
    const ctx = document.getElementById('sentimentChart') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.sentimentChart) {
      this.sentimentChart.destroy();
    }
    this.sentimentChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Positive', 'Negative', 'Neutral'],
        datasets: [{
          data: [this.sentimentCounts.positive, this.sentimentCounts.negative, this.sentimentCounts.neutral],
          backgroundColor: ['#4caf50','#f44336','#ffc107'],
        }]
      },
      options: {
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  deleteTweet(index: number) {
    this.tweets.splice(index, 1);
    this.tweetSentiments.splice(index, 1);
  }

  async saveToDatabase() {
    this.savingToDatabase = true;
    try {
      const token = localStorage.getItem('token');
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      const data = await this.http.post<any>(`${this.apiUrl}/save-analysis-results`, {
        keyword: this.keyword,
        results: this.tweetSentiments,
        timestamp: new Date().toISOString()
      }, { headers }).toPromise();
      if (data.success) {
        this.successMsg = `Successfully saved ${this.tweetSentiments.length} analyzed tweets to database!`;
      } else {
        this.errorMsg = 'Failed to save to database.';
      }
    } catch (err) {
      this.errorMsg = 'Failed to save to database.';
    }
    this.savingToDatabase = false;
  }

  async analyzeSentiment(event: Event) {
    event.preventDefault();
    this.sentimentResult = '';
    if (!this.inputText) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const data = await this.http.post<any>(`${this.apiUrl}/analyze`, {
        text: this.inputText,
        keyword: 'manual_input',
        tweetCount: 1
      }, { headers }).toPromise();
      this.sentimentResult = data.sentiment;
    } catch {
      this.sentimentResult = 'Error';
    }
  }

  onKeywordInput() {
    this.canProceedToStep2 = !!(this.keyword && this.keyword.length >= 2);
    if (!this.canProceedToStep2) {
      this.goBackToStep1();
    }
  }

  onDataAmountInput() {
    this.canProceedToStep3 = !!(this.dataAmount && this.dataAmount > 0);
    if (!this.canProceedToStep3) {
      // Don't go back automatically, just disable next button
    }
  }

  proceedToStep2() {
    if (this.canProceedToStep2) {
      this.showNumberInput = true;
      this.animationStep = 2;
    }
  }

  proceedToStep3() {
    if (this.canProceedToStep3) {
      this.showSearchButton = true;
      this.animationStep = 3;
    }
  }

  goBackToStep1() {
    this.showNumberInput = false;
    this.showSearchButton = false;
    this.animationStep = 1;
    this.canProceedToStep2 = false;
    this.canProceedToStep3 = false;
  }

  goBackToStep2() {
    this.showSearchButton = false;
    this.animationStep = 2;
    this.canProceedToStep3 = false;
  }

  resetAnimation() {
    this.keyword = '';
    this.dataAmount = 50;
    this.goBackToStep1();
  }

  // API Configuration Methods
  ngOnInit() {
    this.checkApiConfiguration();
  }

  async checkApiConfiguration() {
    try {
      // Include JWT token if user is logged in
      const token = localStorage.getItem('token');
      let data;
      
      if (token) {
        const headers = { Authorization: `Bearer ${token}` };
        data = await this.http.get<{configured: boolean, hasAdvanced: boolean}>(`${this.apiUrl}/check-credentials`, { headers }).toPromise();
      } else {
        data = await this.http.get<{configured: boolean, hasAdvanced: boolean}>(`${this.apiUrl}/check-credentials`).toPromise();
      }
      
      if (data) {
        this.apiConfigured = data.configured || false;
        console.log('API configuration status:', data);
      }
    } catch (error) {
      console.log('Could not check API configuration:', error);
      this.apiConfigured = false;
    }
  }

  showApiConfiguration() {
    this.showApiConfig = true;
    this.errorMsg = ''; // Clear any existing error messages when opening
  }

  hideApiConfiguration() {
    this.showApiConfig = false;
    // Form data is preserved - credentials are not reset
    this.errorMsg = ''; // Clear any error messages
  }

  resetApiConfiguration() {
    // Method to reset form data if needed
    this.apiCredentials = {
      bearerToken: '',
      apiKey: '',
      apiSecret: '',
      accessToken: '',
      accessTokenSecret: ''
    };
    this.errorMsg = '';
  }

  async saveApiConfiguration() {
    if (!this.apiCredentials.bearerToken.trim()) {
      this.errorMsg = 'Bearer Token is required for basic functionality';
      return;
    }

    this.configuringApi = true;
    this.errorMsg = '';

    try {
      const token = localStorage.getItem('token');
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      const data = await this.http.post<any>(`${this.apiUrl}/configure-credentials`, this.apiCredentials, { headers }).toPromise();
      
      if (data && data.success) {
        this.apiConfigured = true;
        this.showApiConfig = false;
        this.successMsg = 'X/Twitter API credentials configured successfully!';
        setTimeout(() => { this.successMsg = ''; }, 5000);
      } else {
        this.errorMsg = data.error || 'Failed to configure API credentials';
      }
    } catch (error) {
      this.errorMsg = 'Error configuring API credentials. Please try again.';
    }

    this.configuringApi = false;
  }

  canProceed(): boolean {
    return this.apiConfigured;
  }

  hasExistingFormData(): boolean {
    return !!(this.apiCredentials.bearerToken.trim() || 
              this.apiCredentials.apiKey.trim() || 
              this.apiCredentials.apiSecret.trim() || 
              this.apiCredentials.accessToken.trim() || 
              this.apiCredentials.accessTokenSecret.trim());
  }

  onModalBackgroundClick(event: Event) {
    // Close modal when clicking on the background (outside the modal content)
    this.hideApiConfiguration();
  }

  onModalContentClick(event: Event) {
    // Prevent the modal from closing when clicking inside the modal content
    event.stopPropagation();
  }
}
