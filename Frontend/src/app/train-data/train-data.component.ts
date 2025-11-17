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
  
  // UI state
  loading = false;
  successMsg = '';
  errorMsg = '';

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

  // Computed property for all samples combined
  get allSamples(): Sample[] {
    return [
      ...this.samples.positive,
      ...this.samples.negative,
      ...this.samples.neutral
    ];
  }

  // Paginated samples
  get paginatedSamples(): Sample[] {
    const startIndex = (this.samplesCurrentPage - 1) * this.samplesItemsPerPage;
    const endIndex = startIndex + this.samplesItemsPerPage;
    return this.allSamples.slice(startIndex, endIndex);
  }

  // Total pages for samples
  get samplesTotalPages(): number {
    return Math.ceil(this.allSamples.length / this.samplesItemsPerPage);
  }

  // Samples page numbers array
  get samplesPageNumbers(): number[] {
    return Array.from({ length: this.samplesTotalPages }, (_, i) => i + 1);
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
      this.editingSampleId = null; // Cancel any editing when changing pages
    }
  }

  previousSamplesPage() {
    if (this.samplesCurrentPage > 1) {
      this.samplesCurrentPage--;
      this.editingSampleId = null;
    }
  }

  nextSamplesPage() {
    if (this.samplesCurrentPage < this.samplesTotalPages) {
      this.samplesCurrentPage++;
      this.editingSampleId = null;
    }
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
  }

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
      return;
    }

    this.loading = true;
    try {
      const response = await this.http.get<any>(`${this.apiUrl}/word-libraries/${this.selectedLibraryId}`, { 
        headers: this.getHeaders() 
      }).toPromise();
      
      if (response.success) {
        this.selectedLibrary = response.library;
        this.words = response.words;
        this.samples = response.samples;
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
    // Extract words (alphanumeric and common punctuation)
    const words = tweetText
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => w.length > 0);

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
