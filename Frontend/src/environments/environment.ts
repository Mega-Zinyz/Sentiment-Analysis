export const environment = {
  production: false,
  // Build-time placeholder. The prebuild script will replace this with the value
  // from `Frontend/.env` (API_URL) if present. If not replaced, it remains '$API_URL'.
  apiUrl: '$API_URL',
  
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