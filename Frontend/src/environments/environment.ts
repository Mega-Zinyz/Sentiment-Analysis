export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  
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