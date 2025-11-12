import { Injectable, ErrorHandler } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  
  constructor(private http: HttpClient) {}

  handleError(error: Error): void {
    // Log to console in development
    if (!environment.production) {
      console.error('Error occurred:', error);
    }

    // Send to backend for logging (only in production or if severe)
    if (environment.production || this.isSevereError(error)) {
      this.logErrorToBackend(error);
    }
  }

  private isSevereError(error: Error): boolean {
    // Determine if error should be logged even in development
    const severePatterns = [
      /ChunkLoadError/,
      /Failed to fetch/,
      /NetworkError/,
      /TimeoutError/,
      /Authentication/,
      /Authorization/
    ];

    return severePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private logErrorToBackend(error: Error): void {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        severity: 'error',
        metadata: {
          errorName: error.name,
          errorType: error.constructor.name
        }
      };

      // Send asynchronously, don't wait for response
      this.http.post(`${environment.apiUrl}/error-log`, errorData)
        .subscribe({
          error: (err) => {
            // Silently fail if error logging fails
            if (!environment.production) {
              console.warn('Failed to log error to backend:', err);
            }
          }
        });
    } catch (loggingError) {
      // Don't let error logging cause more errors
      if (!environment.production) {
        console.warn('Error in error logging:', loggingError);
      }
    }
  }
}
