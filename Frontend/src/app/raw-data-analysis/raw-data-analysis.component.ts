import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface RawDataSession {
  session_id: string;
  total_items: number;
  labeled_items: number;
  predicted_items: number;
  status: string;
  can_analyze: boolean;
  created_at: string;
  updated_at: string;
  library_id?: number;
  library_name?: string;
}

interface LabelingData {
  id: number;
  clean_text: string;
  raw_data: string;
  timestamp_extracted?: string;
  username_extracted?: string;
}

@Component({
  selector: 'app-raw-data-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './raw-data-analysis.component.html',
  styleUrls: ['./raw-data-analysis.component.css']
})
export class RawDataAnalysisComponent implements OnInit, OnDestroy {
  // UI State
  analysisMode: 'choose' | 'direct-api' | 'upload-file' = 'choose';
  currentStep: 'upload' | 'library-selection' | 'labeling' | 'analyzing' | 'results' = 'upload';
  
  // Forms
  uploadForm: FormGroup;
  
  // Word Library Selection
  wordLibraries: any[] = [];
  selectedLibraryId: number | null = null;
  newLibraryName: string = '';
  newLibraryDescription: string = '';
  librarySelectionMode: 'existing' | 'new' = 'existing';
  importingToLibrary = false;
  resettingLabels = false;
  
  // Data
  sessions: RawDataSession[] = [];
  currentSession: RawDataSession | null = null;
  labelingData: LabelingData[] = [];
  
  // Data viewer
  viewingDataSession: RawDataSession | null = null;
  viewingDataList: any[] = [];
  dataCurrentPage: number = 1;
  dataTotalPages: number = 1;
  dataPageSize: number = 50;
  loadingData: boolean = false;
  
  // CRUD editing
  editingItemId: number | null = null;
  editingItemText: string = '';
  
  // File upload
  selectedFile: File | null = null;
  
  // Progress tracking
  cleaningProgress = {
    isActive: false,
    currentIndex: 0,
    totalItems: 0,
    processedItems: 0,
    validItems: 0,
    invalidItems: 0,
    currentItem: null as any,
    recentCleanedItems: [] as any[]
  };

  // Upload progress tracking
  uploadProgress = {
    isActive: false,
    sessionId: '',
    status: 'idle', // idle, uploading, completed, error
    totalItems: 0,
    processedItems: 0,
    currentChunk: 0,
    totalChunks: 0,
    percentComplete: 0,
    elapsedTime: 0,
    estimatedTimeRemaining: null as number | null,
    startTime: null as Date | null,
    lastUpdate: null as Date | null,
    errorMessage: ''
  };

  // Background processing
  backgroundProcesses: Map<string, any> = new Map();
  processingHistory: any[] = [];

  // Utility methods for template
  Math = Math;
  
  // Labeling progress
  labelingProgress = {
    positive: 0,
    negative: 0,
    neutral: 0,
    needed: { positive: 5, negative: 5, neutral: 5 }
  };
  
  // Analysis progress
  analysisProgress = {
    isActive: false,
    progressKey: '',
    status: 'idle', // idle, processing, completed, error
    totalItems: 0,
    processedItems: 0,
    currentBatch: 0,
    totalBatches: 0,
    libraryName: '',
    sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
    startTime: null as Date | null,
    completedAt: null as Date | null,
    error: ''
  };
  
  analysisResults: any = null;
  progressInterval: any = null;
  
  // Loading states
  loading = {
    upload: false,
    sessions: false,
    labeling: false
  };
  
  // Error handling
  error: string = '';
  success: string = '';

  private apiUrl = environment.apiUrl;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.uploadForm = this.fb.group({
      sessionName: ['', [Validators.required, Validators.minLength(3)]],
      rawDataText: [''] // Not required - either file or text is needed
    });
  }

  ngOnInit() {
    this.loadSessions();
    
    // Start auto-refresh for sessions list
    this.startAutoRefresh();
    
    // All processing now happens on backend - no need to resume frontend processes
    console.log('✅ Component initialized - all processing handled by backend');
  }

  // Form state management removed - all processing now on backend

  // ========== Mode Selection ==========
  
  selectDirectApi() {
    this.analysisMode = 'direct-api';
    // Redirect to existing home component functionality
    // This will use the existing Twitter API integration
    window.location.href = '/home';
  }

  selectUploadFile() {
    this.analysisMode = 'upload-file';
    this.currentStep = 'upload';
  }

  backToModeSelection() {
    this.analysisMode = 'choose';
    this.resetState();
  }

  // ========== File Upload ==========

  onFileSelected(event: any) {
    const file = event.target.files[0];
    console.log('📁 File selected:', file?.name, file?.type, file?.size);
    
    if (file) {
      // Check file size (50MB limit)
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSizeBytes) {
        this.setError('File too large. Maximum size is 50MB. Please reduce your dataset size.');
        return;
      }
      
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || 
          file.type === 'text/csv' || file.name.endsWith('.csv') ||
          file.type === 'application/csv' || file.name.endsWith('.tsv') ||
          file.type === 'text/tab-separated-values') {
        this.selectedFile = file;
        console.log('✅ File stored in this.selectedFile:', file.name);
        
        // Show warning for large files
        if (file.size > 5 * 1024 * 1024) { // 5MB
          console.log(`⚠️ Large file detected: ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
        }
        
        // For CSV files, upload directly to backend instead of reading in browser
        if (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv') {
          console.log('📁 CSV file selected - will upload directly to backend');
          // Don't read the file content - we'll send it directly
        } else {
          // For TXT files, still read in browser for compatibility
          this.readFileContent(file);
        }
      } else {
        this.setError('Please select a .txt, .csv, or .tsv file containing raw Twitter data');
      }
    }
  }

  private readFileContent(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      let content = e.target.result;
      
      // Handle CSV/TSV files by converting to expected format
      if (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv' ||
          file.name.endsWith('.tsv') || file.type === 'text/tab-separated-values') {
        content = this.convertCsvToRawFormat(content);
      }
      
      this.uploadForm.patchValue({ rawDataText: content });
    };
    reader.readAsText(file);
  }

  private convertCsvToRawFormat(csvContent: string): string {
    const lines = csvContent.trim().split('\n');
    const convertedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Skip header row if it looks like headers
      if (i === 0 && (line.toLowerCase().includes('timestamp') || 
                      line.toLowerCase().includes('username') || 
                      line.toLowerCase().includes('message') ||
                      line.toLowerCase().includes('date') || 
                      line.toLowerCase().includes('user') || 
                      line.toLowerCase().includes('tweet'))) {
        continue;
      }
      
      // Parse CSV/TSV line (handle both comma and tab separated)
      const fields = this.parseCsvLine(line);
      
      if (fields.length >= 3) {
        // Assume format: timestamp, username, message
        const timestamp = fields[0].trim();
        const username = fields[1].trim();
        const message = fields.slice(2).join(' ').trim(); // Join remaining fields as message
        
        // Convert to expected raw format: "timestamp username message 1"
        convertedLines.push(`${timestamp} ${username} ${message} 1`);
      } else if (fields.length === 1) {
        // Single field might be the raw format already
        convertedLines.push(fields[0]);
      }
    }
    
    return convertedLines.join('\n');
  }

  private parseCsvLine(line: string): string[] {
    // Auto-detect separator (tab or comma)
    const separator = line.includes('\t') ? '\t' : ',';
    
    // Simple split for tab-separated (most TSV files don't have quotes)
    if (separator === '\t') {
      return line.split('\t').map(field => field.trim());
    }
    
    // Advanced parsing for comma-separated with quotes
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    fields.push(current.trim());
    
    return fields;
  }

  // ========== Raw Data Upload ==========

  uploadRawData() {
    console.log('🔍 uploadRawData called');
    console.log('   Form valid:', !this.uploadForm.invalid);
    console.log('   Selected file:', this.selectedFile);
    console.log('   Form values:', this.uploadForm.value);
    
    // Check session name is provided
    const sessionName = this.uploadForm.get('sessionName')?.value;
    if (!sessionName || sessionName.trim().length < 3) {
      this.setError('Please provide a session name (minimum 3 characters)');
      return;
    }

    // Check if either file OR text is provided
    const rawDataText = this.uploadForm.get('rawDataText')?.value || '';
    if (!this.selectedFile && !rawDataText.trim()) {
      this.setError('Please provide raw data or upload a file');
      return;
    }

    this.loading.upload = true;
    this.clearMessages();

    // Check if CSV/TXT file is selected - upload directly to backend
    if (this.selectedFile) {
      console.log('📤 Uploading file to backend for processing');
      this.uploadFileToBackend();
      return;
    }

    // For pasted text data, also send to backend (no frontend processing)
    if (rawDataText.trim().length < 50) {
      this.setError('Raw data text must be at least 50 characters');
      this.loading.upload = false;
      return;
    }

    // Send pasted text to backend for processing
    this.uploadTextToBackend(rawDataText);
  }

  private uploadFileToBackend() {
    if (!this.selectedFile) {
      this.setError('No file selected');
      this.loading.upload = false;
      return;
    }

    const formData = new FormData();
    formData.append('csvFile', this.selectedFile);
    formData.append('sessionName', this.uploadForm.value.sessionName || 'File Upload');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    this.http.post<any>(`${environment.apiUrl}/raw-data/upload-csv`, formData, { headers })
      .subscribe({
        next: (response) => {
          console.log('✅ File uploaded successfully:', response);
          this.setSuccess(`File uploaded! Processing in background for session: ${response.sessionId}`);
          this.loading.upload = false;
          
          // Start monitoring the upload progress
          this.monitorUploadProgress(response.sessionId);
          
          // Refresh sessions list
          this.loadSessions();
          
          // Reset form
          this.uploadForm.reset();
          this.selectedFile = null;
        },
        error: (error) => {
          console.error('❌ File upload failed:', error);
          this.setError(error.error?.error || 'Failed to upload file');
          this.loading.upload = false;
        }
      });
  }

  private uploadTextToBackend(rawDataText: string) {
    // Parse text into array
    let rawDataArray: any[] = [];
    
    try {
      const trimmedText = rawDataText.trim();
      if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
        const jsonData = JSON.parse(trimmedText);
        if (Array.isArray(jsonData)) {
          rawDataArray = jsonData;
        } else if (jsonData.data && Array.isArray(jsonData.data)) {
          rawDataArray = jsonData.data;
        } else {
          rawDataArray = [jsonData];
        }
      } else {
        rawDataArray = trimmedText.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);
      }
    } catch (jsonError) {
      rawDataArray = rawDataText.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }

    if (rawDataArray.length < 20) {
      this.setError('Need at least 20 data points for meaningful analysis');
      this.loading.upload = false;
      return;
    }

    // Send to backend API
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    });

    const body = {
      rawDataArray: rawDataArray,
      sessionName: this.uploadForm.value.sessionName || 'Text Upload'
    };

    this.http.post<any>(`${environment.apiUrl}/raw-data/upload`, body, { headers })
      .subscribe({
        next: (response) => {
          console.log('✅ Data uploaded successfully:', response);
          this.setSuccess(`Data uploaded! Processing in background. Session: ${response.sessionId}`);
          this.loading.upload = false;
          
          // Refresh sessions list
          this.loadSessions();
          
          // Reset form
          this.uploadForm.reset();
        },
        error: (error) => {
          console.error('❌ Upload failed:', error);
          this.setError(error.error?.error || 'Failed to upload data');
          this.loading.upload = false;
        }
      });
  }

  private monitorUploadProgress(sessionId: string) {
    const checkProgress = () => {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      });

      this.http.get<any>(`${environment.apiUrl}/raw-data/progress/${sessionId}`, { headers })
        .subscribe({
          next: (response) => {
            console.log('📊 Upload progress:', response);
            
            if (response.status === 'uploaded' || response.status === 'completed') {
              console.log('✅ Upload completed');
              this.loadSessions();
            } else if (response.status === 'failed') {
              console.error('❌ Upload failed');
              this.loadSessions();
            } else {
              // Still processing, check again in 2 seconds
              setTimeout(checkProgress, 2000);
            }
          },
          error: (error) => {
            console.error('Error checking progress:', error);
          }
        });
    };

    // Start checking progress after 1 second
    setTimeout(checkProgress, 1000);
  }

  private startDataCleaningProgress(rawDataArray: string[]) {
    this.cleaningProgress.isActive = true;
    this.cleaningProgress.totalItems = rawDataArray.length;
    this.cleaningProgress.currentIndex = 0;
    this.cleaningProgress.processedItems = 0;
    this.cleaningProgress.validItems = 0;
    this.cleaningProgress.invalidItems = 0;
    this.cleaningProgress.recentCleanedItems = [];

    const cleanedData: string[] = [];
    
    const processNextBatch = () => {
      const batchSize = 10; // Process 10 items at a time for smooth UI
      const endIndex = Math.min(this.cleaningProgress.currentIndex + batchSize, rawDataArray.length);
      
      for (let i = this.cleaningProgress.currentIndex; i < endIndex; i++) {
        const rawItem = rawDataArray[i];
        const cleanedItem = this.simulateDataCleaning(rawItem, i);
        
        this.cleaningProgress.currentItem = {
          index: i + 1,
          original: rawItem,
          cleaned: cleanedItem.cleaned,
          isValid: cleanedItem.isValid,
          timestamp: cleanedItem.timestamp,
          username: cleanedItem.username,
          message: cleanedItem.message
        };
        
        if (cleanedItem.isValid) {
          cleanedData.push(cleanedItem.cleaned);
          this.cleaningProgress.validItems++;
          
          // Add to recent items (keep last 5)
          this.cleaningProgress.recentCleanedItems.unshift(this.cleaningProgress.currentItem);
          if (this.cleaningProgress.recentCleanedItems.length > 5) {
            this.cleaningProgress.recentCleanedItems.pop();
          }
        } else {
          this.cleaningProgress.invalidItems++;
        }
        
        this.cleaningProgress.processedItems++;
      }
      
      this.cleaningProgress.currentIndex = endIndex;
      
      if (this.cleaningProgress.currentIndex < rawDataArray.length) {
        // Continue processing
        setTimeout(processNextBatch, 50); // 50ms delay for smooth animation
      } else {
        // Finished processing, now upload to server
        this.finishDataCleaningAndUpload(cleanedData);
      }
    };
    
    processNextBatch();
  }

  private simulateDataCleaning(rawData: string, index: number) {
    // Parse raw Twitter data format
    const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s+(\w+)\s+(.*?)\s*(\d+)?$/;
    const match = rawData.match(regex);
    
    if (match) {
      const timestamp = match[1];
      const username = match[2];
      const message = match[3].trim();
      
      // Basic cleaning
      let cleanedMessage = message
        .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/@\w+/g, '') // Remove mentions
        .replace(/[^\w\s]/g, ' ') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      if (cleanedMessage.length < 10) {
        return {
          isValid: false,
          cleaned: rawData,
          timestamp,
          username,
          message: cleanedMessage
        };
      }
      
      return {
        isValid: true,
        cleaned: `${timestamp} ${username} ${cleanedMessage} 1`,
        timestamp,
        username,
        message: cleanedMessage
      };
    }
    
    return {
      isValid: false,
      cleaned: rawData,
      timestamp: null,
      username: null,
      message: null
    };
  }

  private finishDataCleaningAndUpload(cleanedData: string[]) {
    this.cleaningProgress.isActive = false;
    
    if (cleanedData.length < 15) {
      this.setError(`Only ${cleanedData.length} valid items found after cleaning. Need at least 15 for analysis.`);
      this.loading.upload = false;
      return;
    }

    // Initialize upload progress tracking
    this.uploadProgress.isActive = true;
    this.uploadProgress.status = 'uploading';
    this.uploadProgress.totalItems = cleanedData.length;
    this.uploadProgress.processedItems = 0;
    this.uploadProgress.percentComplete = 0;
    this.uploadProgress.startTime = new Date();
    this.uploadProgress.errorMessage = '';

    const payload = {
      rawDataArray: cleanedData,
      sessionName: this.uploadForm.value.sessionName
    };

    // Increase timeout for large uploads
    const options = { 
      headers: this.getHeaders(),
      // Add timeout for large files (10 minutes)
      timeout: 600000
    };

    this.http.post(`${this.apiUrl}/raw-data/upload`, payload, options)
      .subscribe({
        next: (response: any) => {
          // Start progress polling if we have a session ID
          if (response.sessionId) {
            this.uploadProgress.sessionId = response.sessionId;
            this.startUploadProgressPolling(response.sessionId);
          } else {
            // No session ID, complete immediately
            this.completeUpload(response);
          }
        },
        error: (error) => {
          this.uploadProgress.isActive = false;
          this.uploadProgress.status = 'error';
          this.uploadProgress.errorMessage = error.error?.error || 'Failed to upload raw data';
          this.setError(this.uploadProgress.errorMessage);
          this.loading.upload = false;
        }
      });
  }

  private startUploadProgressPolling(sessionId: string) {
    const pollInterval = setInterval(() => {
      this.http.get(`${this.apiUrl}/raw-data/progress/${sessionId}`, { headers: this.getHeaders() })
        .subscribe({
          next: (response: any) => {
            if (response.success && response.progress) {
              this.updateUploadProgress(response.progress);
              
              // Stop polling when upload is complete
              if (response.status === 'completed') {
                clearInterval(pollInterval);
                this.completeUploadFromProgress(sessionId);
              } else if (response.status === 'error') {
                clearInterval(pollInterval);
                this.uploadProgress.status = 'error';
                this.uploadProgress.errorMessage = 'Upload failed on server';
                this.setError(this.uploadProgress.errorMessage);
                this.loading.upload = false;
              }
            }
          },
          error: (error) => {
            console.error('Error polling upload progress:', error);
            // Don't stop polling immediately on error, server might recover
          }
        });
    }, 1000); // Poll every second

    // Safety timeout - stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (this.uploadProgress.status === 'uploading') {
        this.uploadProgress.status = 'error';
        this.uploadProgress.errorMessage = 'Upload timeout - please check server';
        this.setError(this.uploadProgress.errorMessage);
        this.loading.upload = false;
      }
    }, 600000);
  }

  private updateUploadProgress(progress: any) {
    this.uploadProgress.processedItems = progress.processedItems;
    this.uploadProgress.totalChunks = progress.totalChunks;
    this.uploadProgress.currentChunk = progress.currentChunk;
    this.uploadProgress.percentComplete = progress.percentComplete;
    this.uploadProgress.elapsedTime = progress.elapsedTime;
    this.uploadProgress.estimatedTimeRemaining = progress.estimatedTimeRemaining;
    this.uploadProgress.lastUpdate = new Date(progress.lastUpdate);
    
    // Trigger change detection
    this.cdr.detectChanges();
  }

  private completeUploadFromProgress(sessionId: string) {
    // Get session details after upload completion
    this.http.get(`${this.apiUrl}/raw-data/session/${sessionId}`, { headers: this.getHeaders() })
      .subscribe({
        next: (response: any) => {
          this.completeUpload({
            sessionId: sessionId,
            stats: {
              validAfterProcessing: response.data.length
            }
          });
        },
        error: (error) => {
          // Fallback - still mark as complete but with minimal info
          this.completeUpload({
            sessionId: sessionId,
            stats: {
              validAfterProcessing: this.uploadProgress.totalItems
            }
          });
        }
      });
  }

  private completeUpload(response: any) {
    this.uploadProgress.isActive = false;
    this.uploadProgress.status = 'completed';
    this.uploadProgress.percentComplete = 100;
    
    this.setSuccess(`Successfully processed ${response.stats.validAfterProcessing} items`);
    this.currentSession = { 
      session_id: response.sessionId,
      total_items: response.stats.validAfterProcessing,
      labeled_items: 0,
      predicted_items: 0,
      status: 'needs_labeling',
      can_analyze: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Go to library selection first, before labeling or importing
    this.currentStep = 'library-selection';
    this.loadWordLibraries();
    this.loading.upload = false;
  }

  cancelUpload() {
    // Reset all upload states
    this.loading.upload = false;
    this.cleaningProgress.isActive = false;
    this.uploadProgress.isActive = false;
    this.uploadProgress.status = 'idle';
    
    // Clear any active background processes
    this.backgroundProcesses.clear();
    
    // Clear localStorage processing state
    localStorage.removeItem('background_processing_state');
    
    // Reset form if needed
    this.uploadForm.reset();
    this.selectedFile = null;
    
    // Update form state to re-enable form controls

    
    // Clear messages and show cancellation message
    this.clearMessages();
    this.setSuccess('Upload cancelled successfully');
    
    console.log('Upload process cancelled by user');
  }

  // ========== Session Management ==========

  loadSessions() {
    // Don't load sessions if not authenticated
    const token = localStorage.getItem('token');
    if (!token || token === 'null') {
      return;
    }
    
    this.loading.sessions = true;
    this.http.get(`${this.apiUrl}/raw-data/sessions`, { headers: this.getHeaders() })
      .subscribe({
        next: (response: any) => {
          this.sessions = (response.sessions || []).map((session: RawDataSession) => {
            // Restore library info from localStorage
            const libraryInfoStr = localStorage.getItem(`session_library_${session.session_id}`);
            if (libraryInfoStr) {
              const libraryInfo = JSON.parse(libraryInfoStr);
              session.library_id = libraryInfo.library_id;
              session.library_name = libraryInfo.library_name;
            }
            return session;
          });
          this.loading.sessions = false;
        },
        error: (error) => {
          this.setError('Failed to load sessions');
          this.loading.sessions = false;
        }
      });
  }

  selectSession(session: RawDataSession) {
    this.currentSession = session;
    
    // If session is completed, redirect to analysis insights
    if (session.status === 'completed') {
      // Find the analysis history for this session and redirect to insights
      this.http.get<any>(`${this.apiUrl}/analysis-history`, { headers: this.getHeaders() })
        .subscribe({
          next: (response) => {
            const analyses = response.analyses || [];
            const analysis = analyses.find((a: any) => a.session_id === session.session_id);
            if (analysis) {
              // Redirect to insights page
              this.router.navigate(['/analysis-insights', analysis.id]);
            } else {
              this.setError('Analysis results not found');
            }
          },
          error: (error) => {
            console.error('Error loading analysis history:', error);
            this.setError('Failed to load analysis results');
          }
        });
      return;
    }
    
    // Check if there's an ongoing analysis for this session
    this.checkForOngoingAnalysis(session);
    
    // If no ongoing analysis was found, go to library selection
    if (this.currentStep !== 'analyzing') {
      this.currentStep = 'library-selection';
      this.loadWordLibraries();
    }
  }

  deleteSession(session: RawDataSession) {
    if (confirm(`Are you sure you want to delete session "${session.session_id}"?`)) {
      this.http.delete(`${this.apiUrl}/raw-data/session/${session.session_id}`, { headers: this.getHeaders() })
        .subscribe({
          next: () => {
            this.setSuccess('Session deleted successfully');
            this.loadSessions();
            if (this.currentSession?.session_id === session.session_id) {
              this.currentSession = null;
              this.currentStep = 'upload';
            }
          },
          error: (error) => {
            this.setError('Failed to delete session');
          }
        });
    }
  }

  // ========== Manual Labeling ==========

  loadLabelingData() {
    if (!this.currentSession) return;

    this.loading.labeling = true;
    this.http.get(`${this.apiUrl}/raw-data/labeling/${this.currentSession.session_id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (response: any) => {
          this.labelingData = response.unlabeledData || [];
          this.labelingProgress = {
            positive: response.currentLabels.Positive,
            negative: response.currentLabels.Negative,
            neutral: response.currentLabels.Neutral,
            needed: response.needsLabeling
          };
          this.loading.labeling = false;
        },
        error: (error) => {
          this.setError('Failed to load labeling data');
          this.loading.labeling = false;
        }
      });
  }

  labelItem(item: LabelingData, sentiment: 'Positive' | 'Negative' | 'Neutral') {
    if (!this.currentSession) return;

    const labels = [{ id: item.id, sentiment_label: sentiment }];

    this.http.post(`${this.apiUrl}/raw-data/labeling/${this.currentSession.session_id}`, 
      { labels }, { headers: this.getHeaders() })
      .subscribe({
        next: (response: any) => {
          this.setSuccess(`Labeled as ${sentiment}`);
          this.labelingProgress = {
            positive: response.currentLabels.Positive,
            negative: response.currentLabels.Negative,
            neutral: response.currentLabels.Neutral,
            needed: {
              positive: Math.max(0, 5 - response.currentLabels.Positive),
              negative: Math.max(0, 5 - response.currentLabels.Negative),
              neutral: Math.max(0, 5 - response.currentLabels.Neutral)
            }
          };
          
          // Remove labeled item from list
          this.labelingData = this.labelingData.filter(d => d.id !== item.id);
          
          // Check if labeling is complete
          if (response.isComplete) {
            this.setSuccess('✅ Labeling complete! You can now import the labeled data to your training library.');
            // Note: User will click "Import Labeled Data" button to trigger import
          }
        },
        error: (error) => {
          this.setError('Failed to label item');
        }
      });
  }

  resetLabeling() {
    if (!this.currentSession) return;
    
    if (!confirm('Are you sure you want to reset all labels? This will clear all your progress.')) {
      return;
    }

    this.resettingLabels = true;
    this.http.post(`${this.apiUrl}/raw-data/labeling/${this.currentSession.session_id}/reset`, 
      {}, { headers: this.getHeaders() })
      .subscribe({
        next: (response: any) => {
          this.setSuccess(`✅ ${response.labelsCleared} labels cleared. Reloading data...`);
          
          // Reset progress
          this.labelingProgress = {
            positive: 0,
            negative: 0,
            neutral: 0,
            needed: {
              positive: 5,
              negative: 5,
              neutral: 5
            }
          };
          
          // Reload labeling data
          this.loadLabelingData();
          this.resettingLabels = false;
        },
        error: (error) => {
          this.setError('Failed to reset labels');
          this.resettingLabels = false;
        }
      });
  }

  // ========== Removed: Analysis and Results sections ==========
  // The flow now goes directly from labeling to library selection

  // ========== Utility Methods ==========

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private setError(message: string) {
    this.error = message;
    this.success = '';
    setTimeout(() => this.error = '', 5000);
  }

  private setSuccess(message: string) {
    this.success = message;
    this.error = '';
    setTimeout(() => this.success = '', 5000);
  }

  private clearMessages() {
    this.error = '';
    this.success = '';
  }

  private resetState() {
    this.currentSession = null;
    this.labelingData = [];
    this.selectedFile = null;
    this.uploadForm.reset();
    this.currentStep = 'upload';
    this.clearMessages();
  }

  // ========== Helper Methods ==========

  get totalLabelingNeeded(): number {
    return this.labelingProgress.needed.positive + 
           this.labelingProgress.needed.negative + 
           this.labelingProgress.needed.neutral;
  }

  get labelingProgressPercent(): number {
    const total = this.labelingProgress.positive + this.labelingProgress.negative + this.labelingProgress.neutral;
    return Math.round((total / 15) * 100);
  }

  getSentimentClass(sentiment: string): string {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'sentiment-positive';
      case 'negative': return 'sentiment-negative';
      case 'neutral': return 'sentiment-neutral';
      default: return '';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  trackByProcessId(index: number, process: any): string {
    return process.id;
  }

  getStatusLabel(status: string): string {
    if (status === 'needs_labeling') {
      return 'Processing';
    }
    return status.replace('_', ' ');
  }

  formatTimeRemaining(milliseconds: number): string {
    if (!milliseconds) return 'Unknown';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  viewProcessResults(process: any) {
    if (process.sessionId) {
      // Navigate to existing session results
      const session = this.sessions.find(s => s.session_id === process.sessionId);
      if (session) {
        this.selectSession(session);
      }
    } else if (process.cleanedData && process.cleanedData.length > 0) {
      // Show preview of cleaned data
      this.showDataPreview(process.cleanedData);
    }
  }

  showDataPreview(cleanedData: string[]) {
    // Create a modal or expand view to show cleaned data preview
    console.log('Cleaned data preview:', cleanedData.slice(0, 10));
    alert(`Preview of cleaned data:\n\n${cleanedData.slice(0, 5).join('\n')}\n\n... and ${cleanedData.length - 5} more items`);
  }

  // ========== Background Processing ==========

  startBackgroundProcessing(rawDataArray: string[], sessionName: string) {
    const processId = `process_${Date.now()}`;
    console.log(`🚀 Starting new background process: ${processId} with ${rawDataArray.length} items`);
    
    const processInfo = {
      id: processId,
      sessionName: sessionName || 'Untitled Session',
      status: 'processing',
      startTime: new Date(),
      totalItems: rawDataArray.length,
      processedItems: 0,
      validItems: 0,
      invalidItems: 0,
      currentIndex: 0,
      rawData: rawDataArray,
      cleanedData: [] as string[],
      isActive: true,
      progress: 0,
      estimatedTimeRemaining: null,
      errorMessage: null
    };

    // Add to background processes and history
    this.backgroundProcesses.set(processId, processInfo);
    this.processingHistory.unshift(processInfo);
    
    console.log(`📝 Added process to history. Total processes: ${this.processingHistory.length}`);
    
    // Save to localStorage for persistence
    this.saveProcessingState();
    
    // Update form state to disable form controls

    
    // Start the background processing immediately
    setTimeout(() => {
      this.continueBackgroundProcessing(processId);
    }, 100); // Small delay to ensure UI updates
    
    return processId;
  }

  continueBackgroundProcessing(processId: string) {
    const process = this.backgroundProcesses.get(processId);
    if (!process || process.status === 'completed' || process.status === 'error') {
      console.log(`❌ Cannot continue processing for ${processId}: process=${!!process}, status=${process?.status}`);
      return;
    }

    console.log(`🔄 Starting/resuming background processing for ${processId}`);
    console.log(`📊 Process state: total=${process.totalItems}, current=${process.currentIndex}, processed=${process.processedItems}`);
    process.isActive = true;
    process.status = 'processing';
    this.saveProcessingState();

    const processNextBatch = () => {
      if (!process.isActive || process.status !== 'processing') {
        console.log(`⏸️ Processing stopped for ${processId}: active=${process.isActive}, status=${process.status}`);
        return;
      }

      const batchSize = 50; // Larger batch for faster processing
      const endIndex = Math.min(process.currentIndex + batchSize, process.totalItems);
      
      console.log(`📊 Processing batch ${process.currentIndex} to ${endIndex} of ${process.totalItems}`);
      console.log(`📊 Raw data length: ${process.rawData?.length || 'undefined'}`);
      
      // Debug: show first few items being processed
      if (process.currentIndex === 0) {
        console.log(`🔍 First 3 raw data items:`, process.rawData.slice(0, 3));
      }
      
      for (let i = process.currentIndex; i < endIndex; i++) {
        const rawItem = process.rawData[i];
        const cleanedItem = this.simulateDataCleaning(rawItem, i);
        
        // Debug: show cleaning results for first few items
        if (i < 3) {
          console.log(`🧹 Item ${i}: "${rawItem}" → Valid: ${cleanedItem.isValid}`, cleanedItem);
        }
        
        if (cleanedItem.isValid) {
          process.cleanedData.push(cleanedItem.cleaned);
          process.validItems++;
        } else {
          process.invalidItems++;
        }
        
        process.processedItems++;
      }
      
      process.currentIndex = endIndex;
      process.progress = Math.round((process.processedItems / process.totalItems) * 100);
      
      // Calculate estimated time remaining
      const elapsed = Date.now() - process.startTime.getTime();
      const rate = process.processedItems / elapsed; // items per ms
      const remaining = process.totalItems - process.processedItems;
      process.estimatedTimeRemaining = remaining > 0 ? Math.round(remaining / rate) : 0;
      
      // Save progress and trigger UI update
      this.saveProcessingState();
      
      // Force Angular change detection
      this.cdr.detectChanges();
      
      console.log(`📈 Progress: ${process.progress}% (${process.processedItems}/${process.totalItems}), Valid: ${process.validItems}, Invalid: ${process.invalidItems}`);
      
      if (process.currentIndex < process.totalItems) {
        // Continue processing with shorter delay for faster processing
        setTimeout(processNextBatch, 50); // 50ms delay for responsive processing
      } else {
        // Finished processing
        console.log(`✅ Processing completed for ${processId}`);
        this.finishBackgroundProcessing(processId);
      }
    };
    
    // Start processing immediately
    processNextBatch();
  }

  finishBackgroundProcessing(processId: string) {
    const process = this.backgroundProcesses.get(processId);
    if (!process) return;

    if (process.validItems < 15) {
      process.status = 'error';
      process.errorMessage = `Only ${process.validItems} valid items found after cleaning. Need at least 15 for analysis.`;
      this.saveProcessingState();
      return;
    }

    process.status = 'ready_for_upload';
    process.isActive = false;
    process.progress = 100;
    process.completedTime = new Date();
    
    this.saveProcessingState();

    
    // Auto-upload immediately after processing completes
    setTimeout(() => {
      this.uploadProcessedData(processId);
    }, 500); // Small delay to show "ready for upload" status briefly
  }

  uploadProcessedData(processId: string) {
    const process = this.backgroundProcesses.get(processId);
    if (!process || process.cleanedData.length === 0) return;

    process.status = 'uploading';
    this.saveProcessingState();

    const payload = {
      rawDataArray: process.cleanedData,
      sessionName: process.sessionName
    };

    const options = { 
      headers: this.getHeaders(),
      timeout: 300000
    };

    this.http.post(`${this.apiUrl}/raw-data/upload`, payload, options)
      .subscribe({
        next: (response: any) => {
          process.status = 'server_processing';
          process.sessionId = response.sessionId;
          process.serverResponse = response;
          process.serverProgress = 0;
          process.estimatedServerTime = null;
          this.saveProcessingState();
          
          this.setSuccess(`Upload completed! Server is processing ${response.stats.validAfterProcessing} items...`);
          
          // Start polling server processing status
          this.pollServerProcessingStatus(processId, response.sessionId);
          
          this.currentSession = { 
            session_id: response.sessionId,
            total_items: response.stats.validAfterProcessing,
            labeled_items: 0,
            predicted_items: 0,
            status: 'needs_labeling',
            can_analyze: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          this.loadSessions(); // Refresh sessions to show new data
        },
        error: (error) => {
          process.status = 'error';
          process.errorMessage = error.error?.error || 'Upload failed';
          this.saveProcessingState();
          this.setError('Failed to upload processed data: ' + process.errorMessage);
        }
      });
  }

  pauseBackgroundProcessing(processId: string) {
    const process = this.backgroundProcesses.get(processId);
    if (process) {
      process.isActive = false;
      process.status = 'paused';
      this.saveProcessingState();
  
    }
  }

  resumeBackgroundProcessing(processId: string) {
    this.continueBackgroundProcessing(processId);
  }

  deleteBackgroundProcess(processId: string) {
    this.backgroundProcesses.delete(processId);
    this.processingHistory = this.processingHistory.filter(p => p.id !== processId);
    this.saveProcessingState();
    localStorage.removeItem(`process_${processId}`);

  }

  pollServerProcessingStatus(processId: string, sessionId: string) {
    const process = this.backgroundProcesses.get(processId);
    if (!process || process.status !== 'server_processing') return;

    console.log(`🔄 Polling server processing status for session: ${sessionId}`);

    const pollInterval = setInterval(() => {
      this.http.get(`${this.apiUrl}/raw-data/sessions`, { headers: this.getHeaders() })
        .subscribe({
          next: (response: any) => {
            const session = response.sessions.find((s: any) => s.session_id === sessionId);
            if (session) {
              // Update server processing progress based on session status
              if (session.total_items > 0) {
                const serverProgress = Math.round((session.total_items / (process.serverResponse?.stats?.validAfterProcessing || session.total_items)) * 100);
                process.serverProgress = Math.min(serverProgress, 100);
                
                if (session.status === 'needs_labeling' && session.total_items > 0) {
                  // Server processing completed successfully
                  process.status = 'completed';
                  process.serverProgress = 100;
                  process.completedTime = new Date();
                  this.saveProcessingState();
                  this.setSuccess(`Server processing completed for ${session.session_id}! Ready for labeling.`);
                  clearInterval(pollInterval);
                  
                  // Now that processing is complete, reset form and navigate
                  this.uploadForm.reset();
                  this.selectedFile = null;
                  
                  // Update current session if this is the active one
                  if (this.currentSession?.session_id === sessionId) {
                    this.currentSession = session;
                    this.currentStep = 'labeling';
                    this.loadLabelingData();
                  }
                } else if (session.status === 'error') {
                  // Server processing failed
                  process.status = 'error';
                  process.errorMessage = 'Server processing failed';
                  this.saveProcessingState();
                  this.setError(`Server processing failed for session ${sessionId}`);
                  clearInterval(pollInterval);
                }
                
                this.saveProcessingState();
                this.cdr.detectChanges();
              }
            }
          },
          error: (error) => {
            console.warn('Failed to poll server status:', error);
            // Don't stop polling for temporary network errors
          }
        });
    }, 3000); // Poll every 3 seconds

    // Stop polling after 10 minutes to prevent infinite polling
    setTimeout(() => {
      clearInterval(pollInterval);
      if (process.status === 'server_processing') {
        process.status = 'error';
        process.errorMessage = 'Server processing timeout - check session manually';
        this.saveProcessingState();
      }
    }, 600000); // 10 minutes timeout
  }

  saveProcessingState() {
    try {
      // Save to localStorage with size optimization - exclude large data arrays
      const optimizedProcesses = Array.from(this.backgroundProcesses.entries()).map(([id, process]) => {
        const {rawData, cleanedData, ...processWithoutData} = process;
        return [id, {
          ...processWithoutData,
          rawDataSize: rawData?.length || 0,
          cleanedDataSize: cleanedData?.length || 0
        }];
      });
      
      const optimizedHistory = this.processingHistory.map(process => {
        const {rawData, cleanedData, ...processWithoutData} = process;
        return {
          ...processWithoutData,
          rawDataSize: rawData?.length || 0,
          cleanedDataSize: cleanedData?.length || 0
        };
      });
      
      const state = {
        processes: optimizedProcesses,
        history: optimizedHistory
      };
      
      localStorage.setItem('background_processing_state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save processing state to localStorage:', error);
      // Try to clear old data and save minimal state
      this.clearOldProcessingData();
    }
  }

  clearOldProcessingData() {
    try {
      // Remove completed processes older than 1 hour to free up space
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      // Filter out old completed processes
      this.processingHistory = this.processingHistory.filter(process => {
        if (process.status === 'completed' && process.completedTime) {
          return new Date(process.completedTime).getTime() > oneHourAgo;
        }
        return true; // Keep non-completed or recent processes
      });
      
      // Remove corresponding entries from backgroundProcesses
      for (const [id, process] of this.backgroundProcesses) {
        if (process.status === 'completed' && process.completedTime) {
          if (new Date(process.completedTime).getTime() <= oneHourAgo) {
            this.backgroundProcesses.delete(id);
          }
        }
      }
      
      // Try to save again with reduced data
      localStorage.removeItem('background_processing_state');
      const minimalState = {
        processes: [],
        history: this.processingHistory.slice(-5) // Keep only last 5 processes
      };
      localStorage.setItem('background_processing_state', JSON.stringify(minimalState));
    } catch (error) {
      console.warn('Failed to clear old processing data:', error);
      localStorage.removeItem('background_processing_state');
    }
  }

  // Auto-refresh sessions list every 5 seconds
  private startAutoRefresh() {
    setInterval(() => {
      // Only refresh if authenticated
      const token = localStorage.getItem('token');
      if (token && token !== 'null') {
        this.loadSessions();
      }
    }, 5000);
  }

  // Method to clear all localStorage data if needed
  clearAllProcessingData() {
    localStorage.removeItem('background_processing_state');
    this.backgroundProcesses.clear();
    this.processingHistory = [];
    this.cdr.detectChanges();
    console.log('🧹 Cleared all processing data');
  }

  // ========== Word Library Selection ==========
  
  loadWordLibraries() {
    this.http.get<any>(`${this.apiUrl}/word-libraries`, { headers: this.getHeaders() })
      .subscribe({
        next: (response) => {
          this.wordLibraries = response.libraries || [];
          // If user has no libraries, auto-select 'new' mode
          if (this.wordLibraries.length === 0) {
            this.librarySelectionMode = 'new';
          } else {
            this.librarySelectionMode = 'existing';
            // Pre-select first library
            if (this.wordLibraries.length > 0) {
              this.selectedLibraryId = this.wordLibraries[0].id;
            }
          }
        },
        error: (error) => {
          console.error('Error loading word libraries:', error);
          this.setError('Failed to load word libraries');
        }
      });
  }

  getSelectedLibraryName(): string {
    if (!this.selectedLibraryId) return '';
    const library = this.wordLibraries.find(lib => lib.id === this.selectedLibraryId);
    return library ? library.name : '';
  }

  proceedToLabeling() {
    // Validate library selection first
    if (this.librarySelectionMode === 'new' && !this.newLibraryName.trim()) {
      this.setError('Please enter a library name');
      return;
    }
    
    if (this.librarySelectionMode === 'existing' && !this.selectedLibraryId) {
      this.setError('Please select a library');
      return;
    }
    
    // Store library selection for this session
    if (this.currentSession) {
      const libraryInfo = {
        library_id: this.librarySelectionMode === 'existing' ? this.selectedLibraryId : null,
        library_name: this.librarySelectionMode === 'existing' ? this.getSelectedLibraryName() : this.newLibraryName
      };
      localStorage.setItem(`session_library_${this.currentSession.session_id}`, JSON.stringify(libraryInfo));
      
      // Update current session with library info
      this.currentSession.library_id = libraryInfo.library_id || undefined;
      this.currentSession.library_name = libraryInfo.library_name;
    }
    
    // Proceed to labeling step
    this.currentStep = 'labeling';
    this.loadLabelingData();
  }

  proceedWithLabeledImport() {
    // This is called after labeling is complete
    if (this.librarySelectionMode === 'new') {
      this.importingToLibrary = true;
      
      this.http.post<any>(`${this.apiUrl}/word-libraries`, {
        name: this.newLibraryName,
        description: this.newLibraryDescription || ''
      }, { headers: this.getHeaders() })
        .subscribe({
          next: (response) => {
            const libraryId = response.libraryId;
            this.importLabeledTweetsToLibrary(libraryId);
          },
          error: (error) => {
            console.error('Error creating library:', error);
            this.setError('Failed to create word library');
            this.importingToLibrary = false;
          }
        });
    } else {
      this.importingToLibrary = true;
      this.importLabeledTweetsToLibrary(this.selectedLibraryId!);
    }
  }

  importLabeledTweetsToLibrary(libraryId: number) {
    if (!this.currentSession) {
      this.setError('No active session');
      this.importingToLibrary = false;
      return;
    }
    
    this.http.post<any>(
      `${this.apiUrl}/word-libraries/${libraryId}/import-labeled-tweets`,
      { sessionId: this.currentSession.session_id },
      { headers: this.getHeaders() }
    ).subscribe({
      next: (response) => {
        this.importingToLibrary = false;
        this.setSuccess(`Successfully imported ${response.samplesAdded} samples and extracted ${response.wordsAdded} unique words!`);
        
        // Redirect to Training Data page after 2 seconds
        setTimeout(() => {
          window.location.href = '/train-data';
        }, 2000);
      },
      error: (error) => {
        console.error('Error importing labeled tweets:', error);
        this.setError('Failed to import labeled tweets to library');
        this.importingToLibrary = false;
      }
    });
  }

  runSentimentAnalysis() {
    if (!this.selectedLibraryId || !this.currentSession) {
      this.setError('Please select a library first');
      return;
    }

    this.clearMessages();
    this.currentStep = 'analyzing';
    
    // Initialize analysis progress
    this.analysisProgress = {
      isActive: true,
      progressKey: '',
      status: 'processing',
      totalItems: 0,
      processedItems: 0,
      currentBatch: 0,
      totalBatches: 0,
      libraryName: this.getSelectedLibraryName(),
      sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
      startTime: new Date(),
      completedAt: null,
      error: ''
    };

    this.http.post<any>(`${this.apiUrl}/raw-data/analyze-with-library`, {
      sessionId: this.currentSession.session_id,
      libraryId: this.selectedLibraryId
    }, { headers: this.getHeaders() })
      .subscribe({
        next: (response) => {
          // Analysis started, begin polling for progress
          this.analysisProgress.progressKey = response.progressKey;
          this.analysisProgress.totalItems = response.totalItems;
          
          // Start polling for progress
          this.startProgressPolling();
        },
        error: (error) => {
          console.error('Error starting sentiment analysis:', error);
          console.error('Error details:', error.error);
          const errorMsg = error.error?.error || error.error?.hint || 'Failed to start sentiment analysis';
          this.setError(errorMsg);
          this.currentStep = 'library-selection';
          this.analysisProgress.isActive = false;
        }
      });
  }

  startProgressPolling() {
    // Poll every 1 second
    this.progressInterval = setInterval(() => {
      this.checkAnalysisProgress();
    }, 1000);
  }

  checkAnalysisProgress() {
    if (!this.analysisProgress.progressKey) return;

    this.http.get<any>(`${this.apiUrl}/raw-data/library-progress/${this.analysisProgress.progressKey}`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (progress) => {
        this.analysisProgress.status = progress.status;
        this.analysisProgress.processedItems = progress.processedItems || 0;
        this.analysisProgress.currentBatch = progress.currentBatch || 0;
        this.analysisProgress.totalBatches = progress.totalBatches || 0;
        
        if (progress.status === 'completed' || progress.status === 'cancelled') {
          // Analysis completed or cancelled
          this.analysisProgress.isActive = false;
          this.analysisProgress.completedAt = new Date(progress.completedAt || progress.cancelledAt);
          this.analysisProgress.sentimentCounts = progress.sentimentCounts || { Positive: 0, Negative: 0, Neutral: 0 };
          this.analysisResults = progress;
          
          // Stop polling
          if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
          }
          
          // Move to results step
          if (progress.status === 'completed') {
            this.currentStep = 'results';
            this.setSuccess(`Successfully analyzed ${this.analysisProgress.totalItems} tweets!`);
          } else if (progress.status === 'cancelled') {
            this.currentStep = 'results';
            this.setSuccess(`Analysis cancelled. Processed ${this.analysisProgress.processedItems} of ${this.analysisProgress.totalItems} tweets.`);
          }
          
          // Store library info
          const libraryInfo = {
            library_id: this.selectedLibraryId,
            library_name: this.getSelectedLibraryName()
          };
          localStorage.setItem(`session_library_${this.currentSession!.session_id}`, JSON.stringify(libraryInfo));
          
        } else if (progress.status === 'error') {
          // Analysis failed
          this.analysisProgress.isActive = false;
          this.analysisProgress.error = progress.error || 'Unknown error';
          
          // Stop polling
          if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
          }
          
          this.setError(`Analysis failed: ${progress.error}`);
          this.currentStep = 'library-selection';
        }
      },
      error: (error) => {
        console.error('Error checking progress:', error);
        // Don't stop polling on network errors, continue trying
      }
    });
  }

  getAnalysisPercentage(): number {
    if (this.analysisProgress.totalItems === 0) return 0;
    return Math.round((this.analysisProgress.processedItems / this.analysisProgress.totalItems) * 100);
  }

  cancelAnalysis() {
    if (!this.analysisProgress.progressKey) return;

    if (!confirm('Are you sure you want to cancel the analysis? Progress will be lost.')) {
      return;
    }

    this.http.post<any>(
      `${this.apiUrl}/raw-data/cancel-library-analysis/${this.analysisProgress.progressKey}`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: (response) => {
        console.log('Analysis cancelled:', response);
        this.setSuccess('Analysis cancelled successfully');
        
        // Stop polling
        if (this.progressInterval) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
        
        // Update status
        this.analysisProgress.status = 'cancelled';
        this.analysisProgress.isActive = false;
      },
      error: (error) => {
        console.error('Error cancelling analysis:', error);
        this.setError(error.error?.error || 'Failed to cancel analysis');
      }
    });
  }

  viewAnalysisHistory() {
    this.router.navigate(['/analysis-history']);
  }

  startNewAnalysis() {
    // Reset to upload step
    this.currentStep = 'upload';
    this.analysisProgress.isActive = false;
    this.analysisResults = null;
    this.currentSession = null;
    this.selectedLibraryId = null;
    this.clearMessages();
    this.loadSessions();
  }

  skipLibraryImport() {
    // User wants to skip importing to library
    this.router.navigate(['/train-data']);
  }

  returnToSessionsWhileAnalyzing() {
    // Save analysis state to localStorage so we can restore it
    if (this.analysisProgress.progressKey) {
      const analysisState = {
        progressKey: this.analysisProgress.progressKey,
        sessionId: this.currentSession?.session_id,
        libraryId: this.selectedLibraryId,
        libraryName: this.analysisProgress.libraryName,
        totalItems: this.analysisProgress.totalItems,
        startedAt: this.analysisProgress.startTime
      };
      localStorage.setItem('ongoing_analysis', JSON.stringify(analysisState));
    }
    
    // Keep polling running in background
    // Don't clear progressInterval - let it continue
    
    // Go back to sessions view
    this.currentStep = 'upload';
    this.setSuccess('Analysis is running in the background. Click "Continue" on the session to check progress.');
  }

  checkForOngoingAnalysis(session: any) {
    // First check if session status is 'processing'
    if (session.status === 'processing') {
      console.log('📊 Session is processing, checking for ongoing analysis...');
      
      // Check localStorage first
      const savedState = localStorage.getItem('ongoing_analysis');
      if (savedState) {
        try {
          const analysisState = JSON.parse(savedState);
          if (analysisState.sessionId === session.session_id) {
            // Resume the analysis view with saved state
            this.currentSession = session;
            this.selectedLibraryId = analysisState.libraryId;
            this.analysisProgress = {
              isActive: true,
              progressKey: analysisState.progressKey,
              status: 'processing',
              totalItems: analysisState.totalItems,
              processedItems: 0,
              currentBatch: 0,
              totalBatches: 0,
              libraryName: analysisState.libraryName,
              sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
              startTime: new Date(analysisState.startedAt),
              completedAt: null,
              error: ''
            };
            this.currentStep = 'analyzing';
            this.startProgressPolling();
            console.log('✅ Resumed ongoing analysis from localStorage:', analysisState.progressKey);
            return;
          }
        } catch (error) {
          console.error('Error parsing saved analysis state:', error);
        }
      }
      
      // If no localStorage, try to find the progress key by checking backend
      // Progress key format: sessionId_library
      const progressKey = `${session.session_id}_library`;
      
      // Try to fetch progress from backend
      this.http.get<any>(`${this.apiUrl}/raw-data/library-progress/${progressKey}`, {
        headers: this.getHeaders()
      }).subscribe({
        next: (progress) => {
          if (progress && progress.status === 'processing') {
            console.log('✅ Found ongoing analysis on backend:', progressKey);
            
            // Restore analysis view
            this.currentSession = session;
            this.selectedLibraryId = progress.libraryId;
            this.analysisProgress = {
              isActive: true,
              progressKey: progressKey,
              status: 'processing',
              totalItems: progress.totalItems,
              processedItems: progress.processedItems || 0,
              currentBatch: progress.currentBatch || 0,
              totalBatches: progress.totalBatches || 0,
              libraryName: progress.libraryName || 'Word Library',
              sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
              startTime: new Date(progress.startedAt),
              completedAt: null,
              error: ''
            };
            this.currentStep = 'analyzing';
            this.startProgressPolling();
          }
        },
        error: (error) => {
          // Silently ignore 404 - just means no ongoing analysis
          // This is expected behavior when session is completed or not being analyzed
        }
      });
    }
  }

  // ========== Data Viewer ==========
  
  viewSessionData(session: RawDataSession) {
    console.log('👁️ Viewing data for session:', session.session_id);
    this.viewingDataSession = session;
    this.dataCurrentPage = 1;
    this.dataTotalPages = Math.ceil(session.total_items / this.dataPageSize);
    this.loadDataPage(1);
  }
  
  loadDataPage(page: number) {
    if (!this.viewingDataSession || page < 1 || page > this.dataTotalPages) {
      return;
    }
    
    this.dataCurrentPage = page;
    this.loadingData = true;
    const offset = (page - 1) * this.dataPageSize;
    
    this.http.get<any>(`${this.apiUrl}/raw-data/view/${this.viewingDataSession.session_id}?limit=${this.dataPageSize}&offset=${offset}`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (response) => {
        this.viewingDataList = response.data || [];
        this.loadingData = false;
        console.log(`✅ Loaded ${this.viewingDataList.length} items for page ${page}`);
      },
      error: (error) => {
        console.error('❌ Error loading session data:', error);
        this.setError('Failed to load session data');
        this.loadingData = false;
      }
    });
  }
  
  closeDataViewer() {
    this.viewingDataSession = null;
    this.viewingDataList = [];
    this.dataCurrentPage = 1;
    this.dataTotalPages = 1;
    this.editingItemId = null;
    this.editingItemText = '';
  }
  
  // ========== CRUD Operations ==========
  
  startEditItem(item: any) {
    this.editingItemId = item.id;
    this.editingItemText = item.clean_text || item.raw_data;
  }
  
  cancelEditItem() {
    this.editingItemId = null;
    this.editingItemText = '';
  }
  
  saveEditItem(item: any) {
    if (!this.editingItemText.trim()) {
      this.setError('Text cannot be empty');
      return;
    }
    
    this.loadingData = true;
    
    this.http.put<any>(`${this.apiUrl}/raw-data/item/${item.id}`, {
      clean_text: this.editingItemText.trim()
    }, {
      headers: this.getHeaders()
    }).subscribe({
      next: (response) => {
        console.log('✅ Item updated successfully');
        this.setSuccess('Item updated successfully');
        
        // Update the item in the list
        const index = this.viewingDataList.findIndex(i => i.id === item.id);
        if (index !== -1) {
          this.viewingDataList[index].clean_text = this.editingItemText.trim();
        }
        
        this.editingItemId = null;
        this.editingItemText = '';
        this.loadingData = false;
      },
      error: (error) => {
        console.error('❌ Error updating item:', error);
        this.setError('Failed to update item');
        this.loadingData = false;
      }
    });
  }
  
  deleteItem(item: any) {
    if (!confirm(`Are you sure you want to delete this item?\n\n"${(item.clean_text || item.raw_data).substring(0, 100)}..."`)) {
      return;
    }
    
    this.loadingData = true;
    
    this.http.delete<any>(`${this.apiUrl}/raw-data/item/${item.id}`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (response) => {
        console.log('✅ Item deleted successfully');
        this.setSuccess('Item deleted successfully');
        
        // Remove from list
        this.viewingDataList = this.viewingDataList.filter(i => i.id !== item.id);
        
        // Update session total
        if (this.viewingDataSession) {
          this.viewingDataSession.total_items--;
          this.dataTotalPages = Math.ceil(this.viewingDataSession.total_items / this.dataPageSize);
          
          // If current page is now empty and not the first page, go to previous page
          if (this.viewingDataList.length === 0 && this.dataCurrentPage > 1) {
            this.loadDataPage(this.dataCurrentPage - 1);
          } else {
            this.loadingData = false;
          }
        } else {
          this.loadingData = false;
        }
        
        // Refresh sessions list to update counts
        this.loadSessions();
      },
      error: (error) => {
        console.error('❌ Error deleting item:', error);
        this.setError('Failed to delete item');
        this.loadingData = false;
      }
    });
  }

  ngOnDestroy() {
    // Clear polling interval when component is destroyed
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}
