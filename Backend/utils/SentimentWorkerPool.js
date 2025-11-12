const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Use python3 for Docker/Linux, or python/python3 for local development
// Set PYTHON_PATH environment variable to override (e.g., for custom Windows Python path)
const pythonPath = process.env.PYTHON_PATH || (os.platform() === 'win32' ? 'python' : 'python3');

/**
 * Manages a pool of persistent Python sentiment analysis workers.
 * Each worker loads the model once and processes batches via JSON messages.
 */
class SentimentWorkerPool {
  constructor(poolSize = 2) {
    this.poolSize = poolSize;
    this.workers = [];
    this.availableWorkers = [];
    this.requestQueue = [];
    this.isShuttingDown = false;
    
    // Worker script path - use Indonesian-aware worker
    this.workerScript = path.join(__dirname, 'sentiment_worker_indonesian.py');
  }
  
  /**
   * Initialize the worker pool
   */
  async initialize() {
    console.log(`🔄 Initializing sentiment worker pool with ${this.poolSize} workers...`);
    
    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = await this.createWorker(i);
        this.workers.push(worker);
        this.availableWorkers.push(worker);
        console.log(`✅ Worker ${i} initialized successfully`);
      } catch (error) {
        console.error(`❌ Failed to initialize worker ${i}:`, error.message);
        throw error;
      }
    }
    
    console.log(`🎉 Sentiment worker pool ready with ${this.workers.length} workers`);
  }
  
  /**
   * Create a single worker process
   */
  async createWorker(workerId) {
    return new Promise((resolve, reject) => {
      const worker = {
        id: workerId,
        process: null,
        isReady: false,
        isBusy: false,
        pendingRequests: new Map(),
        requestCounter: 0
      };
      
      // Clean environment for Python
      const cleanEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string') {
          cleanEnv[key] = value.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[^\x00-\x7F]/g, '');
        } else {
          cleanEnv[key] = value;
        }
      }
      
      // Spawn Python worker
      worker.process = spawn(pythonPath, [this.workerScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...cleanEnv,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          LC_ALL: 'en_US.UTF-8',
          LANG: 'en_US.UTF-8'
        }
      });
      
      let initTimeout = setTimeout(() => {
        reject(new Error(`Worker ${workerId} initialization timeout`));
      }, 30000); // 30 second timeout
      
      // Handle stdout (responses)
      let buffer = '';
      worker.process.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const message = JSON.parse(line);
            
            if (message.type === 'ready' && !worker.isReady) {
              // Worker is ready
              worker.isReady = true;
              clearTimeout(initTimeout);
              resolve(worker);
            } else {
              // Handle response to pending request
              this.handleWorkerResponse(worker, message);
            }
          } catch (error) {
            console.error(`Worker ${workerId} JSON parse error:`, error.message, 'Line:', line);
          }
        }
      });
      
      // Handle stderr
      worker.process.stderr.on('data', (data) => {
        console.error(`Worker ${workerId} stderr:`, data.toString());
      });
      
      // Handle process exit
      worker.process.on('exit', (code, signal) => {
        console.warn(`Worker ${workerId} exited with code ${code}, signal ${signal}`);
        worker.isReady = false;
        
        // Reject pending requests
        for (const [requestId, { reject }] of worker.pendingRequests) {
          reject(new Error(`Worker ${workerId} exited unexpectedly`));
        }
        worker.pendingRequests.clear();
        
        // Remove from available workers
        const index = this.availableWorkers.indexOf(worker);
        if (index > -1) {
          this.availableWorkers.splice(index, 1);
        }
        
        // Try to restart worker if not shutting down
        if (!this.isShuttingDown && code !== 0) {
          console.log(`🔄 Restarting worker ${workerId}...`);
          setTimeout(() => this.restartWorker(worker), 1000);
        }
      });
      
      // Handle process error
      worker.process.on('error', (error) => {
        console.error(`Worker ${workerId} process error:`, error.message);
        clearTimeout(initTimeout);
        reject(error);
      });
    });
  }
  
  /**
   * Handle response from worker
   */
  handleWorkerResponse(worker, message) {
    // For now, assume responses are for the oldest pending request
    // In a more sophisticated implementation, you'd match by request ID
    const firstRequest = worker.pendingRequests.values().next();
    if (!firstRequest.done) {
      const { resolve, reject } = firstRequest.value;
      const requestId = worker.pendingRequests.keys().next().value;
      worker.pendingRequests.delete(requestId);
      
      if (message.type === 'result') {
        resolve(message.predictions);
      } else if (message.type === 'error') {
        reject(new Error(message.message));
      } else {
        reject(new Error(`Unknown response type: ${message.type}`));
      }
      
      // Worker is no longer busy
      worker.isBusy = false;
      this.availableWorkers.push(worker);
      
      // Process next request in queue
      this.processNextRequest();
    }
  }
  
  /**
   * Restart a failed worker
   */
  async restartWorker(oldWorker) {
    try {
      const newWorker = await this.createWorker(oldWorker.id);
      
      // Replace in workers array
      const index = this.workers.indexOf(oldWorker);
      if (index > -1) {
        this.workers[index] = newWorker;
        this.availableWorkers.push(newWorker);
      }
      
      console.log(`✅ Worker ${oldWorker.id} restarted successfully`);
    } catch (error) {
      console.error(`❌ Failed to restart worker ${oldWorker.id}:`, error.message);
    }
  }
  
  /**
   * Predict sentiment for a batch of texts
   */
  async predict(trainingData, texts) {
    return new Promise((resolve, reject) => {
      const request = {
        trainingData,
        texts,
        resolve,
        reject,
        timestamp: Date.now()
      };
      
      this.requestQueue.push(request);
      this.processNextRequest();
    });
  }
  
  /**
   * Process the next request in the queue
   */
  processNextRequest() {
    if (this.requestQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }
    
    const request = this.requestQueue.shift();
    const worker = this.availableWorkers.shift();
    
    // Mark worker as busy
    worker.isBusy = true;
    
    // Generate request ID
    const requestId = ++worker.requestCounter;
    worker.pendingRequests.set(requestId, {
      resolve: request.resolve,
      reject: request.reject
    });
    
    // Send request to worker
    const message = JSON.stringify({
      type: 'predict',
      training_data: request.trainingData,
      texts: request.texts
    });
    
    try {
      worker.process.stdin.write(message + '\n');
    } catch (error) {
      // Handle write error
      worker.pendingRequests.delete(requestId);
      worker.isBusy = false;
      this.availableWorkers.push(worker);
      request.reject(error);
    }
  }
  
  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.workers.filter(w => w.isBusy).length,
      queueLength: this.requestQueue.length,
      readyWorkers: this.workers.filter(w => w.isReady).length
    };
  }
  
  /**
   * Shutdown the worker pool
   */
  async shutdown() {
    console.log('🔄 Shutting down sentiment worker pool...');
    this.isShuttingDown = true;
    
    // Clear request queue
    for (const request of this.requestQueue) {
      request.reject(new Error('Worker pool shutting down'));
    }
    this.requestQueue = [];
    
    // Shutdown all workers
    const shutdownPromises = this.workers.map(worker => {
      return new Promise((resolve) => {
        if (!worker.process || worker.process.killed) {
          resolve();
          return;
        }
        
        // Send shutdown message
        try {
          worker.process.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
        } catch (error) {
          // Ignore write errors during shutdown
        }
        
        // Force kill after timeout
        const timeout = setTimeout(() => {
          if (!worker.process.killed) {
            worker.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        
        worker.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });
    
    await Promise.all(shutdownPromises);
    console.log('✅ Sentiment worker pool shutdown complete');
  }
}

module.exports = SentimentWorkerPool;