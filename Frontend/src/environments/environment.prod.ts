export const environment = {
  production: true,
  // Use environment variable or fallback to relative path
  // In Docker: nginx proxies /api to backend:5000
  // For standalone deployment: set window.API_URL in index.html
  apiUrl: (typeof window !== 'undefined' && (window as any).API_URL) || '/api',
  
  // Feature flags
  enableLogging: true,
  logLevel: 'error', // only log errors in production
  enableAnalytics: false,
  
  // API Configuration
  apiTimeout: 300000, // 5 minutes for long-running analysis
  maxRetries: 3,
  
  // UI Configuration
  showDebugInfo: false,
  enableDevTools: false
};
