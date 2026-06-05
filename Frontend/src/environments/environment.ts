export const environment = {
  production: false,
  // In development, use relative path for API
  // The nginx proxy will handle routing to backend:5000
  apiUrl: '/api',
  
  // Feature flags
  enableLogging: true,
  logLevel: 'debug', // show all logs in development
  enableAnalytics: false,
  
  // API Configuration
  apiTimeout: 300000, // 5 minutes
  maxRetries: 3,
  
  // UI Configuration
  showDebugInfo: true, // show debug panels in development
  enableDevTools: true
};