import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { io, Socket } from 'socket.io-client';

interface CrawlJob {
  jobId: string;
  keyword: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'suspended' | 'error' | 'cancelled';
  targetCount: number;
  collectedCount: number;
  failedCount?: number;
  progress: number;
  statusMessage: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

interface CrawlerStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  processingJobs: number;
  totalTweetsCollected: number;
  avgTweetsPerJob: number;
}

@Component({
  selector: 'app-crawler',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crawler.component.html',
  styleUrls: ['./crawler.component.css']
})
export class CrawlerComponent implements OnInit, OnDestroy {
  // UI State
  currentView: 'dashboard' | 'start' | 'history' | 'monitor' = 'dashboard';
  
  // Crawler data
  stats: CrawlerStats | null = null;
  jobs: CrawlJob[] = [];
  currentJob: CrawlJob | null = null;
  selectedJob: CrawlJob | null = null;
  
  // Form data
  keyword: string = '';
  targetCount: number = 100;
  sinceDate: string = '';
  untilDate: string = '';
  xUsername: string = '';
  xPassword: string = '';
  isSubmitting: boolean = false;
  isLoading: boolean = false;
  
  // WebSocket
  socket: Socket | null = null;
  
  // Messages
  successMessage: string = '';
  errorMessage: string = '';
  
  // Auto-refresh
  refreshInterval: any;
  autoRefresh: boolean = true;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    if (!this.authService.isAuthenticated) {
      return;
    }

    this.initializeWebSocket();
    this.loadStats();
    this.loadJobs();
    
    if (this.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  private initializeWebSocket() {
    // Get base URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const baseUrl = `${protocol}//${host}`;
    
    this.socket = io(baseUrl, {
      auth: {
        token: localStorage.getItem('token')
      }
    });

    this.socket.on('crawler:job_started', (data) => {
      console.log('🚀 Job started:', data);
      this.setSuccess(`Crawling started: ${data.jobId}`);
      this.loadStats();
      this.loadJobs();
    });

    this.socket.on('crawler:job_progress', (data) => {
      console.log('📊 Job progress:', data);
      if (this.currentJob && this.currentJob.jobId === data.jobId) {
        this.currentJob = { ...this.currentJob, ...data };
      }
    });

    this.socket.on('crawler:job_completed', (data) => {
      console.log('✅ Job completed:', data);
      this.setSuccess(`Crawling completed! Collected ${data.collectedCount} tweets`);
      this.loadStats();
      this.loadJobs();
    });

    this.socket.on('crawler:job_failed', (data) => {
      console.log('❌ Job failed:', data);
      this.setError(`Crawling failed: ${data.error}`);
      this.loadStats();
      this.loadJobs();
    });
  }

  private startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      if (this.currentView === 'history') {
        this.loadJobs();
      }
    }, 3000);
  }

  private stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadStats() {
    try {
      const response = await this.http.get<any>(`${environment.apiUrl}/crawler/stats`).toPromise();
      if (response && response.success) {
        this.stats = response.stats;
        this.currentJob = response.currentJob;
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async loadJobs() {
    try {
      const response = await this.http.get<any>(`${environment.apiUrl}/crawler/jobs`).toPromise();
      if (response && response.success) {
        this.jobs = response.jobs || [];
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async submitCrawlJob() {
    if (!this.keyword.trim()) {
      this.setError('Masukkan keyword');
      return;
    }

    if (this.targetCount < 10 || this.targetCount > 10000) {
      this.setError('Target harus antara 10 dan 10000');
      return;
    }

    if (this.sinceDate && this.untilDate && new Date(this.sinceDate) > new Date(this.untilDate)) {
      this.setError('Tanggal mulai harus sebelum atau sama dengan tanggal akhir');
      return;
    }

    this.isSubmitting = true;
    this.clearMessages();

    try {
      const response = await this.http.post<any>(`${environment.apiUrl}/crawler/start`, {
        keyword: this.keyword,
        targetCount: this.targetCount,
        sinceDate: this.sinceDate || null,
        untilDate: this.untilDate || null,
      }).toPromise();

      if (response && response.success) {
        this.setSuccess(`✅ Crawling dimulai! Job ID: ${response.jobId}`);
        this.keyword = '';
        this.targetCount = 100;
        this.sinceDate = '';
        this.untilDate = '';
        this.xUsername = '';
        this.xPassword = '';
        
        await this.loadStats();
        await this.loadJobs();
        
        this.currentView = 'monitor';
      } else {
        this.setError(response?.message || 'Gagal memulai crawling');
      }
    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal memulai crawling');
    } finally {
      this.isSubmitting = false;
    }
  }

  async cancelJob(jobId: string) {
    if (!confirm('Batalkan job ini?')) return;

    try {
      const response = await this.http.post<any>(`${environment.apiUrl}/crawler/cancel/${jobId}`, {}).toPromise();
      if (response && response.success) {
        this.setSuccess('Job dibatalkan');
        await this.loadStats();
        await this.loadJobs();
      } else {
        this.setError('Gagal membatalkan job');
      }
    } catch (error) {
      this.setError('Gagal membatalkan job');
    }
  }

  async resumeJob(jobId: string) {
    if (!confirm('Lanjutkan job ini? Akan mengumpulkan sisa target dari job yang gagal.')) return;

    try {
      const response = await this.http.post<any>(`${environment.apiUrl}/crawler/resume/${jobId}`, {}).toPromise();
      if (response && response.success) {
        const resumeInfo = response.resumeInfo;
        this.setSuccess(
          `Job dilanjutkan! Target sisa: ${resumeInfo.remainingTarget} tweets ` +
          `(sudah terkumpul: ${resumeInfo.alreadyCollected}/${resumeInfo.originalTarget})`
        );
        await this.loadStats();
        await this.loadJobs();
        this.currentView = 'monitor';
      } else {
        this.setError(response?.error || 'Gagal melanjutkan job');
      }
    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal melanjutkan job');
    }
  }

  selectJob(job: CrawlJob) {
    this.selectedJob = job;
    this.currentView = 'monitor';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#28a745';
      case 'processing': return '#007bff';
      case 'queued': return '#ffc107';
      case 'failed': return '#dc3545';
      case 'suspended': return '#fd7e14';
      case 'error': return '#dc3545';
      case 'cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'processing': return '⏳';
      case 'queued': return '⏲️';
      case 'failed': return '❌';
      case 'suspended': return '⏸️';
      case 'error': return '⚠️';
      case 'cancelled': return '⛔';
      default: return '❓';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('id-ID');
  }

  private setSuccess(message: string) {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 5000);
  }

  private setError(message: string) {
    this.errorMessage = message;
    setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
  }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }

  getDuration(startDate: string, endDate?: string): string {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m`;
    return `${Math.floor(duration / 3600)}h`;
  }
}
