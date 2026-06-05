import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { io, Socket } from 'socket.io-client';

interface CrawlerCollection {
  id?: number;
  collectionId: string;
  name: string;
  description?: string;
  keywords?: string[];
  status: string;
  tweetCount: number;
  totalTarget?: number;
  totalCollected?: number;
  tweetDateMin?: string | null;
  tweetDateMax?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CrawlJob {
  jobId: string;
  keyword: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'suspended' | 'error' | 'cancelled';
  targetCount: number;
  collectedCount: number;
  progress: number;
  statusMessage?: string;
  createdAt: string;
  completedAt?: string;
  sinceDate?: string;
  untilDate?: string;
}

interface LiveLog {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'progress';
}

@Component({
  selector: 'app-crawler-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './crawler-new.component.html',
  styleUrls: ['./crawler-new.component.css']
})
export class CrawlerNewComponent implements OnInit, OnDestroy {
  currentView: 'collections' | 'collection-detail' = 'collections';

  // Collections
  collections: CrawlerCollection[] = [];
  selectedCollection: CrawlerCollection | null = null;
  isLoadingCollections = false;

  // Create collection modal
  showCreateDialog = false;
  newCollectionName = '';
  newCollectionDescription = '';
  newCollectionKeywords = '';

  // Edit collection modal
  showEditDialog = false;
  editCollectionName = '';
  editCollectionDescription = '';
  editCollectionKeywords = '';
  editingCollection: CrawlerCollection | null = null;

  // Crawl form (embedded in collection detail)
  showCrawlForm = false;
  crawlKeywords: string[] = [];
  crawlKeywordInput = '';
  filterRetweets = true;
  langId = false;
  targetCount = 100;
  sinceDate = '';
  untilDate = '';
  today = new Date().toISOString().slice(0, 10);
  isSubmitting = false;

  // Cookie-based login status
  cookieStatus: { hasCookies: boolean; count: number; updatedAt?: string } | null = null;
  credentialsLoaded = false;

  // Live monitor (WebSocket)
  liveJob: CrawlJob | null = null;
  liveLog: LiveLog[] = [];

  // Collection tweets
  collectionTweets: any[] = [];
  collectionPage = 1;
  collectionTotalPages = 1;
  collectionTotalTweets = 0;
  isLoadingTweets = false;

  // Job history
  jobs: CrawlJob[] = [];
  jobSearchQuery = '';

  // Tweet bulk selection
  selectedTweetIds = new Set<number>();

  // Jump to page
  jumpPageInput = 1;

  socket: Socket | null = null;
  successMessage = '';
  errorMessage = '';

  // Send to analysis
  isSendingToAnalysis = false;

  constructor(private http: HttpClient, private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.initializeWebSocket();
    this.loadCollections();
    this.loadCrawlerCredentials();
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
  }

  private async loadCrawlerCredentials() {
    try {
      this.cookieStatus = await lastValueFrom(
        this.http.get<any>(`${environment.apiUrl}/profile/cookies/status`)
      );
    } catch {
      this.cookieStatus = { hasCookies: false, count: 0 };
    } finally {
      this.credentialsLoaded = true;
    }
  }

  // ============ WEBSOCKET ============

  private initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = `${protocol}//${window.location.host}`;

    this.socket = io(baseUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    this.socket.on('connect', () => {
      this.addLog('Terhubung ke server monitoring', 'info');
    });

    this.socket.on('disconnect', () => {
      this.addLog('Koneksi monitoring terputus', 'error');
    });

    this.socket.on('crawler:job_started', (data: any) => {
      this.addLog(`Job dimulai: "${data.keyword}" (target: ${data.targetCount} tweets)`, 'info');
      this.loadCollections();
    });

    this.socket.on('crawler:job_progress', (data: any) => {
      if (this.liveJob && this.liveJob.jobId === data.jobId) {
        this.liveJob = {
          ...this.liveJob,
          collectedCount: data.collected,
          targetCount: data.total,
          progress: data.progress,
          status: 'processing'
        };
      }
      this.addLog(
        data.statusMessage || `${data.collected}/${data.total} tweets terkumpul (${data.progress}%)`,
        'progress'
      );
    });

    this.socket.on('crawler:job_completed', (data: any) => {
      if (this.liveJob && this.liveJob.jobId === data.jobId) {
        this.liveJob = { ...this.liveJob, status: 'completed', progress: 100, collectedCount: data.collectedCount };
      }
      this.addLog(`Selesai! ${data.collectedCount} tweets berhasil dikumpulkan.`, 'success');
      this.loadCollections();
      if (this.selectedCollection) {
        this.loadCollectionTweets(this.selectedCollection.collectionId, 1);
        this.loadCollectionJobs();
      }
    });

    this.socket.on('crawler:job_failed', (data: any) => {
      if (this.liveJob && this.liveJob.jobId === data.jobId) {
        this.liveJob = { ...this.liveJob, status: 'failed' };
      }
      this.addLog(`Job gagal: ${data.error || 'Unknown error'}`, 'error');
      this.loadCollections();
    });
  }

  private addLog(message: string, type: LiveLog['type']) {
    const time = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    this.liveLog = [{ time, message, type }, ...this.liveLog].slice(0, 100);
  }

  clearLog() {
    this.liveLog = [];
  }

  // ============ COLLECTIONS ============

  async loadCollections() {
    try {
      this.isLoadingCollections = true;
      const response = await lastValueFrom(
        this.http.get<any>(`${environment.apiUrl}/crawler/collections`)
      );
      if (response?.success) {
        this.collections = response.collections;
      }
    } catch {
      this.setError('Gagal memuat daftar database crawling');
    } finally {
      this.isLoadingCollections = false;
    }
  }

  openCreateDialog() {
    this.showCreateDialog = true;
    this.newCollectionName = '';
    this.newCollectionDescription = '';
    this.newCollectionKeywords = '';
  }

  async createCollection() {
    if (!this.newCollectionName.trim()) {
      this.setError('Nama database harus diisi');
      return;
    }
    try {
      const keywords = this.newCollectionKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k);

      const response = await lastValueFrom(
        this.http.post<any>(`${environment.apiUrl}/crawler/collections`, {
          name: this.newCollectionName,
          description: this.newCollectionDescription,
          keywords
        })
      );

      if (response?.success) {
        this.setSuccess('Database crawling berhasil dibuat!');
        this.showCreateDialog = false;
        await this.loadCollections();
        const newCol = this.collections.find(c => c.name === this.newCollectionName) || this.collections[0];
        if (newCol) this.openCollection(newCol);
      }
    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal membuat database');
    }
  }

  openEditDialog(col: CrawlerCollection, event: Event) {
    event.stopPropagation();
    this.editingCollection = col;
    this.editCollectionName = col.name;
    this.editCollectionDescription = col.description || '';
    this.editCollectionKeywords = (col.keywords || []).join(', ');
    this.showEditDialog = true;
  }

  async saveEditCollection() {
    if (!this.editCollectionName.trim() || !this.editingCollection) return;
    try {
      const keywords = this.editCollectionKeywords
        .split(',').map(k => k.trim()).filter(k => k);
      await lastValueFrom(
        this.http.put<any>(`${environment.apiUrl}/crawler/collections/${this.editingCollection.collectionId}`, {
          name: this.editCollectionName.trim(),
          description: this.editCollectionDescription,
          keywords
        })
      );
      this.setSuccess('Database berhasil diperbarui');
      this.showEditDialog = false;
      await this.loadCollections();
      if (this.selectedCollection?.collectionId === this.editingCollection.collectionId) {
        const updated = this.collections.find(c => c.collectionId === this.editingCollection!.collectionId);
        if (updated) this.selectedCollection = updated;
      }
    } catch (e: any) {
      this.setError(e?.error?.error || 'Gagal memperbarui database');
    }
  }

  async deleteCollection(col: CrawlerCollection, event: Event) {
    event.stopPropagation();
    if (!confirm(`Hapus database "${col.name}" beserta semua tweet di dalamnya?`)) return;
    try {
      await lastValueFrom(
        this.http.delete<any>(`${environment.apiUrl}/crawler/collections/${col.collectionId}`)
      );
      this.setSuccess('Database berhasil dihapus');
      if (this.selectedCollection?.collectionId === col.collectionId) {
        this.currentView = 'collections';
        this.selectedCollection = null;
      }
      await this.loadCollections();
    } catch (e: any) {
      this.setError(e?.error?.error || 'Gagal menghapus database');
    }
  }

  async deleteTweet(tweetId: number) {
    if (!this.selectedCollection) return;
    if (!confirm('Hapus tweet ini dari database?')) return;
    try {
      await lastValueFrom(
        this.http.delete<any>(
          `${environment.apiUrl}/crawler/collections/${this.selectedCollection.collectionId}/tweets/${tweetId}`
        )
      );
      this.collectionTweets = this.collectionTweets.filter(t => t.id !== tweetId);
      this.selectedTweetIds.delete(tweetId);
      if (this.selectedCollection) this.selectedCollection.tweetCount = Math.max(0, this.selectedCollection.tweetCount - 1);
    } catch (e: any) {
      this.setError(e?.error?.error || 'Gagal menghapus tweet');
    }
  }

  async openCollection(collection: CrawlerCollection) {
    this.selectedCollection = collection;
    this.currentView = 'collection-detail';
    this.showCrawlForm = false;
    this.collectionTweets = [];
    this.collectionPage = 1;
    this.liveLog = [];
    this.liveJob = null;

    this.addLog(`Membuka: ${collection.name}`, 'info');

    await Promise.all([
      this.loadCollectionDetail(collection.collectionId),
      this.loadCollectionTweets(collection.collectionId, 1),
      this.loadCollectionJobs()
    ]);
  }

  private async loadCollectionDetail(collectionId: string) {
    try {
      const response = await lastValueFrom(
        this.http.get<any>(`${environment.apiUrl}/crawler/collections/${collectionId}`)
      );
      if (response?.success && this.selectedCollection) {
        this.selectedCollection = { ...this.selectedCollection, ...response.collection };
      }
    } catch {
      // Non-critical
    }
  }

  async loadCollectionTweets(collectionId: string, page: number) {
    try {
      this.isLoadingTweets = true;
      this.collectionPage = page;
      this.selectedTweetIds.clear();
      const response = await lastValueFrom(
        this.http.get<any>(`${environment.apiUrl}/crawler/collections/${collectionId}?page=${page}&limit=20`)
      );
      if (response?.success) {
        this.collectionTweets = response.tweets || [];
        const p = response.pagination;
        this.collectionTotalPages = p?.pages || 1;
        this.collectionTotalTweets = p?.total || 0;
      }
      // Scroll to tweet section top after page change
      if (page > 1) {
        setTimeout(() => {
          document.getElementById('tweets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch {
      this.setError('Gagal memuat tweets');
    } finally {
      this.isLoadingTweets = false;
    }
  }

  async loadCollectionJobs() {
    try {
      const response = await lastValueFrom(
        this.http.get<any>(`${environment.apiUrl}/crawler/jobs?limit=50`)
      );
      if (response?.success) {
        this.jobs = response.jobs.map((j: any) => {
          let sinceDate: string | undefined;
          let untilDate: string | undefined;
          if (j.config) {
            try {
              const cfg = typeof j.config === 'string' ? JSON.parse(j.config) : j.config;
              sinceDate = cfg.sinceDate || undefined;
              untilDate = cfg.untilDate || undefined;
            } catch {}
          }
          return { ...j, sinceDate, untilDate };
        });
        if (!this.liveJob) {
          const running = this.jobs.find(j => j.status === 'processing' || j.status === 'queued');
          if (running) {
            this.liveJob = running;
            this.addLog(`Job sedang berjalan: "${running.keyword}"`, 'info');
          }
        }
      }
    } catch {
      // Non-critical
    }
  }

  goBack() {
    this.currentView = 'collections';
    this.selectedCollection = null;
    this.showCrawlForm = false;
    this.liveJob = null;
    this.liveLog = [];
    this.loadCollections();
  }

  trackJob(job: CrawlJob) {
    this.liveJob = job;
    this.addLog(`Memantau job: "${job.keyword}"`, 'info');
  }

  // ============ DATE CHUNK HELPERS ============

  private computeMonthlyChunks(): { since: string; until: string; label: string }[] {
    if (!this.sinceDate || !this.untilDate) return [];

    const start = new Date(this.sinceDate + 'T00:00:00');
    const end   = new Date(this.untilDate + 'T00:00:00');
    if (start > end) return [];

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const chunks: { since: string; until: string; label: string }[] = [];

    let curYear  = start.getFullYear();
    let curMonth = start.getMonth();

    while (true) {
      const monthStart = new Date(curYear, curMonth, 1);
      if (monthStart > end) break;

      const monthEnd   = new Date(curYear, curMonth + 1, 0);
      const chunkSince = monthStart < start ? start    : monthStart;
      const chunkUntil = monthEnd   > end   ? end      : monthEnd;

      chunks.push({
        since: fmt(chunkSince),
        until: fmt(chunkUntil),
        label: monthStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      });

      curMonth++;
      if (curMonth > 11) { curYear++; curMonth = 0; }
    }

    return chunks;
  }

  get monthlyChunks(): { since: string; until: string; label: string }[] {
    return this.computeMonthlyChunks();
  }

  get isMultiMonth(): boolean {
    return this.monthlyChunks.length > 1;
  }

  // ============ CRAWL ============

  get crawlQuery(): string {
    if (this.crawlKeywords.length === 0) return '';
    // Join with OR — no auto-quoting so multi-word terms match broadly (all words must appear,
    // not necessarily adjacent). Users can add manual quotes for exact phrase matching.
    let q = this.crawlKeywords.join(' OR ');
    if (this.filterRetweets) q += ' -filter:retweets';
    if (this.langId) q += ' lang:id';
    return q;
  }

  addCrawlKeyword() {
    const val = this.crawlKeywordInput.trim().replace(/,+$/, '').trim();
    if (!val || this.crawlKeywords.includes(val)) {
      this.crawlKeywordInput = '';
      return;
    }
    this.crawlKeywords.push(val);
    this.crawlKeywordInput = '';
  }

  removeCrawlKeyword(index: number) {
    this.crawlKeywords.splice(index, 1);
  }

  onKeywordInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addCrawlKeyword();
    }
  }

  async submitCrawlJob() {
    if (this.crawlKeywords.length === 0) {
      this.setError('Minimal satu keyword harus ditambahkan');
      return;
    }
    if (!this.selectedCollection) {
      this.setError('Pilih collection terlebih dahulu');
      return;
    }

    const chunks = this.monthlyChunks;
    const isMulti = chunks.length > 1;
    const query = this.crawlQuery;

    if (isMulti) {
      const ok = confirm(
        `Rentang tanggal mencakup ${chunks.length} bulan.\n\n` +
        `Sistem akan membuat ${chunks.length} job crawl terpisah (masing-masing 1 bulan, target ${this.targetCount} tweet/bulan).\n\n` +
        `Total maksimal: ~${chunks.length * this.targetCount} tweet\n\nLanjutkan?`
      );
      if (!ok) return;
    }

    try {
      this.isSubmitting = true;

      if (isMulti) {
        let firstSet = false;
        for (const chunk of chunks) {
          const response = await lastValueFrom(
            this.http.post<any>(`${environment.apiUrl}/crawler/start`, {
              collectionId: this.selectedCollection!.collectionId,
              keyword: query,
              targetCount: this.targetCount,
              sinceDate: chunk.since,
              untilDate: chunk.until,
            })
          );
          if (response?.success && !firstSet) {
            firstSet = true;
            this.liveJob = {
              jobId: response.jobId,
              keyword: `${query} (${chunk.label})`,
              status: 'queued',
              targetCount: this.targetCount,
              collectedCount: 0,
              progress: 0,
              createdAt: new Date().toISOString()
            };
          }
          this.addLog(`Job dikirim: "${query}" — ${chunk.label}`, 'info');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.setSuccess(`${chunks.length} job crawl berhasil dikirim (1 job per bulan)!`);
      } else {
        const response = await lastValueFrom(
          this.http.post<any>(`${environment.apiUrl}/crawler/start`, {
            collectionId: this.selectedCollection!.collectionId,
            keyword: query,
            targetCount: this.targetCount,
            sinceDate: this.sinceDate || undefined,
            untilDate: this.untilDate || undefined,
          })
        );

        if (response?.success) {
          this.liveJob = {
            jobId: response.jobId,
            keyword: query,
            status: 'queued',
            targetCount: this.targetCount,
            collectedCount: 0,
            progress: 0,
            createdAt: new Date().toISOString()
          };
          this.addLog(`Job dikirim: "${query}" (target: ${this.targetCount})`, 'info');
          this.setSuccess('Crawling dimulai! Pantau progress di panel monitor.');
        } else {
          this.setError(response?.message || 'Gagal memulai crawling');
          return;
        }
      }

      this.showCrawlForm = false;
      this.crawlKeywords = [];
      this.crawlKeywordInput = '';
      this.targetCount = 100;
      this.sinceDate = '';
      this.untilDate = '';
      this.loadCollectionJobs();

    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal memulai crawling');
    } finally {
      this.isSubmitting = false;
    }
  }

  async cancelJob(jobId: string) {
    if (!confirm('Batalkan job ini?')) return;
    try {
      const response = await lastValueFrom(
        this.http.post<any>(`${environment.apiUrl}/crawler/cancel/${jobId}`, {})
      );
      if (response?.success) {
        if (this.liveJob?.jobId === jobId) {
          this.liveJob = { ...this.liveJob, status: 'cancelled' };
        }
        this.addLog('Job dibatalkan oleh pengguna', 'error');
        this.setSuccess('Job dibatalkan');
        this.loadCollectionJobs();
      }
    } catch {
      this.setError('Gagal membatalkan job');
    }
  }

  async resumeJob(jobId: string) {
    if (!confirm('Mulai ulang job ini? Job lama akan dibatalkan dan job baru akan antri.')) return;
    try {
      const response = await lastValueFrom(
        this.http.post<any>(`${environment.apiUrl}/crawler/resume/${jobId}`, {})
      );
      if (response?.success) {
        const originalJob = this.jobs.find(j => j.jobId === jobId);
        this.liveJob = {
          jobId: response.newJobId,
          keyword: originalJob?.keyword || '',
          status: 'queued',
          targetCount: originalJob?.targetCount || 100,
          collectedCount: 0,
          progress: 0,
          createdAt: new Date().toISOString(),
          sinceDate: originalJob?.sinceDate,
          untilDate: originalJob?.untilDate,
        };
        this.addLog(`Job di-restart: "${this.liveJob.keyword}"`, 'info');
        this.setSuccess('Job berhasil di-restart! Antri untuk diproses.');
        this.loadCollectionJobs();
      }
    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal me-restart job');
    }
  }

  // ============ HELPERS ============

  get isJobActive(): boolean {
    return !!this.liveJob && (this.liveJob.status === 'processing' || this.liveJob.status === 'queued');
  }

  get allTweetsSelected(): boolean {
    return this.collectionTweets.length > 0 &&
      this.collectionTweets.every(t => this.selectedTweetIds.has(t.id));
  }

  get hasSelectedTweets(): boolean {
    return this.selectedTweetIds.size > 0;
  }

  get selectedCount(): number {
    return this.selectedTweetIds.size;
  }

  get filteredJobs(): CrawlJob[] {
    if (!this.jobSearchQuery.trim()) return this.jobs;
    const q = this.jobSearchQuery.toLowerCase().trim();
    return this.jobs.filter(j => j.keyword.toLowerCase().includes(q));
  }

  toggleSelectTweet(id: number) {
    if (this.selectedTweetIds.has(id)) {
      this.selectedTweetIds.delete(id);
    } else {
      this.selectedTweetIds.add(id);
    }
  }

  toggleSelectAllTweets() {
    if (this.allTweetsSelected) {
      this.selectedTweetIds.clear();
    } else {
      this.collectionTweets.forEach(t => this.selectedTweetIds.add(t.id));
    }
  }

  async bulkDeleteTweets() {
    if (!this.selectedCollection || this.selectedTweetIds.size === 0) return;
    const count = this.selectedTweetIds.size;
    if (!confirm(`Hapus ${count} tweet yang dipilih dari database?`)) return;
    try {
      const ids = Array.from(this.selectedTweetIds);
      await lastValueFrom(
        this.http.delete<any>(
          `${environment.apiUrl}/crawler/collections/${this.selectedCollection.collectionId}/tweets/bulk`,
          { body: { tweetIds: ids } }
        )
      );
      this.selectedTweetIds.clear();
      this.setSuccess(`${count} tweet berhasil dihapus`);
      await this.loadCollectionTweets(this.selectedCollection.collectionId, this.collectionPage);
    } catch (e: any) {
      this.setError(e?.error?.error || 'Gagal menghapus tweets');
    }
  }

  goToJumpPage() {
    if (!this.selectedCollection) return;
    const page = Math.max(1, Math.min(this.collectionTotalPages, Math.floor(this.jumpPageInput) || 1));
    this.loadCollectionTweets(this.selectedCollection.collectionId, page);
  }

  async sendToAnalysis(collection: CrawlerCollection) {
    if (!collection.tweetCount || collection.tweetCount === 0) {
      this.setError('Collection belum memiliki tweet untuk dianalisis');
      return;
    }
    if (!confirm(`Kirim ${collection.tweetCount} tweet dari "${collection.name}" ke halaman analisis sentimen?`)) return;

    try {
      this.isSendingToAnalysis = true;
      const response = await lastValueFrom(
        this.http.post<any>(
          `${environment.apiUrl}/crawler/collections/${collection.collectionId}/send-to-analysis`,
          {}
        )
      );
      if (response?.success) {
        this.setSuccess(`${response.totalItems} tweet berhasil dipindahkan! Mengarahkan ke halaman analisis...`);
        setTimeout(() => {
          this.router.navigate(['/analysis'], { queryParams: { sessionId: response.sessionId } });
        }, 1500);
      }
    } catch (error: any) {
      this.setError(error?.error?.error || 'Gagal mengirim data ke analisis');
    } finally {
      this.isSendingToAnalysis = false;
    }
  }

  private setSuccess(msg: string) {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 5000);
  }

  private setError(msg: string) {
    this.errorMessage = msg;
    setTimeout(() => (this.errorMessage = ''), 6000);
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      completed: '#28a745', processing: '#2563eb', queued: '#d97706',
      failed: '#dc2626', suspended: '#ea580c', error: '#dc2626', cancelled: '#6b7280'
    };
    return colors[status] || '#6b7280';
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      completed: '✅', processing: '⏳', queued: '⏲️',
      failed: '❌', suspended: '⏸️', error: '⚠️', cancelled: '⛔'
    };
    return icons[status] || '❓';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '?';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }
}
