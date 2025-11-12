/**
 * Utility functions for processing raw Twitter data
 */

/**
 * Parse Twitter API format or legacy raw Twitter data format
 * Twitter API format: JSON objects with {id, text, created_at, author_id} structure
 * Legacy format: "2022-03-31 14:32:04+00:00 pikobar_jabar Message text here 1"
 * @param {string|object} rawData - Raw Twitter data (JSON object or string)
 * @returns {object} Parsed data with timestamp, username, and message
 */
function parseRawTwitterData(rawData) {
  try {
    // Handle Twitter API JSON format (preferred)
    if (typeof rawData === 'object' && rawData !== null) {
      return parseTwitterAPIFormat(rawData);
    }
    
    // Handle JSON string
    if (typeof rawData === 'string' && (rawData.trim().startsWith('{') || rawData.trim().startsWith('['))) {
      try {
        const jsonData = JSON.parse(rawData);
        return parseTwitterAPIFormat(jsonData);
      } catch (jsonError) {
        // Fall through to legacy parsing if JSON parsing fails
      }
    }
    
    // Handle legacy CSV format for backward compatibility
    return parseLegacyFormat(rawData);
    
  } catch (error) {
    console.error('Error parsing Twitter data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Parse Twitter API v2 format
 * Expected format: {id: "123", text: "tweet text", created_at: "2022-03-31T14:32:04.000Z", author_id: "456"}
 */
function parseTwitterAPIFormat(data) {
  try {
    // Handle array of tweets (batch format)
    if (Array.isArray(data)) {
      return data.map(tweet => parseTwitterAPIFormat(tweet)).filter(result => result.success);
    }
    
    // Handle single tweet object
    if (data.id && data.text) {
      return {
        id: data.id,
        timestamp: data.created_at || new Date().toISOString(),
        username: data.username || `user_${data.author_id}` || 'unknown',
        author_id: data.author_id,
        message: data.text.trim(),
        raw_data: JSON.stringify(data),
        success: true,
        format: 'twitter_api'
      };
    }
    
    // Handle Twitter API response wrapper
    if (data.data && Array.isArray(data.data)) {
      return data.data.map(tweet => parseTwitterAPIFormat(tweet)).filter(result => result.success);
    }
    
    return {
      success: false,
      error: 'Invalid Twitter API format'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Twitter API parsing error: ${error.message}`
    };
  }
}

/**
 * Parse legacy CSV/TSV format for backward compatibility
 * Supports multiple formats:
 * 1. Space-separated: "2022-03-31 14:32:04+00:00 pikobar_jabar Message text here 1"
 * 2. Tab-separated: "2022-03-31 14:32:04+00:00"\t"pikobar_jabar"\t"Message text here"\t"1"
 * 3. CSV format: timestamp,username,message,label
 */
function parseLegacyFormat(rawData) {
  try {
    // Remove outer quotes if present
    const cleanRawData = rawData.replace(/^"(.*)"$/, '$1').trim();
    
    // Check if this is tab-separated format with quoted fields
    if (cleanRawData.includes('\t')) {
      return parseTabSeparatedFormat(cleanRawData);
    }
    
    // Check if this is comma-separated format
    if (cleanRawData.includes(',') && !cleanRawData.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/)) {
      return parseCommaSeparatedFormat(cleanRawData);
    }
    
    // Try space-separated format (original format)
    return parseSpaceSeparatedFormat(cleanRawData);
    
  } catch (error) {
    console.error('Error parsing legacy format:', error);
    return {
      timestamp: null,
      username: 'unknown',
      message: rawData,
      number: null,
      success: false,
      error: error.message,
      format: 'legacy'
    };
  }
}

/**
 * Parse tab-separated format with quoted fields
 * Format: "timestamp"\t"username"\t"message part 1"\t"message part 2"\t"label"
 */
function parseTabSeparatedFormat(data) {
  try {
    // Split by tabs and clean quotes
    const parts = data.split('\t').map(part => part.replace(/^"(.*)"$/, '$1').trim());
    
    if (parts.length >= 3) {
      // Handle different tab-separated formats
      
      // Format 1: timestamp, username, message [, label]
      if (parts[0].match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/)) {
        const timestamp = parts[0];
        const username = parts[1];
        
        let message = '';
        let label = null;
        
        if (parts.length === 3) {
          message = parts[2];
        } else {
          const lastPart = parts[parts.length - 1];
          if (/^\d+$/.test(lastPart)) {
            message = parts.slice(2, -1).join(' ').trim();
            label = lastPart;
          } else {
            message = parts.slice(2).join(' ').trim();
          }
        }
        
        return {
          timestamp: timestamp,
          username: username || 'unknown',
          message: message.trim(),
          number: label,
          success: true,
          format: 'legacy_tsv'
        };
      }
      
      // Format 2: Twitter date format, message, username, url
      // Example: "Mon Dec 04 14:38:54 +0000 2023\tPlissss lah\tlillkickity\thttps://..."
      if (parts[0].match(/^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{2}:\d{2}:\d{2}\s[+-]\d{4}\s\d{4}$/)) {
        const timestamp = parts[0];
        const message = parts[1];
        const username = parts[2];
        // parts[3] would be URL if present
        
        return {
          timestamp: timestamp,
          username: username || 'unknown',
          message: message.trim(),
          number: null,
          success: true,
          format: 'twitter_tsv'
        };
      }
      
      // Format 3: fallback - treat as timestamp, username, message
      const timestamp = parts[0];
      const username = parts[1];
      
      let message = '';
      let label = null;
      
      if (parts.length === 3) {
        message = parts[2];
      } else {
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart)) {
          message = parts.slice(2, -1).join(' ').trim();
          label = lastPart;
        } else {
          message = parts.slice(2).join(' ').trim();
        }
      }
      
      // Validate timestamp format (support multiple formats)
      const isValidTimestamp = timestamp && (
        timestamp.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/) ||  // ISO format
        timestamp.match(/^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{2}:\d{2}:\d{2}\s[+-]\d{4}\s\d{4}$/) ||  // Twitter format: Mon Dec 04 14:38:54 +0000 2023
        timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)  // ISO T format
      );
      
      if (isValidTimestamp) {
        return {
          timestamp: timestamp,
          username: username || 'unknown',
          message: message.trim(),
          number: label,
          success: true,
          format: 'legacy_tsv'
        };
      }
    }
    
    return {
      success: false,
      error: 'Invalid tab-separated format'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Tab-separated parsing error: ${error.message}`
    };
  }
}

/**
 * Parse comma-separated format
 * Format: timestamp,username,message,label
 */
function parseCommaSeparatedFormat(data) {
  try {
    // Simple CSV parsing (handles basic cases)
    const parts = data.split(',').map(part => part.replace(/^"(.*)"$/, '$1').trim());
    
    if (parts.length >= 3) {
      return {
        timestamp: parts[0],
        username: parts[1] || 'unknown',
        message: parts[2].trim(),
        number: parts[3] || null,
        success: true,
        format: 'legacy_csv'
      };
    }
    
    return {
      success: false,
      error: 'Invalid CSV format'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `CSV parsing error: ${error.message}`
    };
  }
}

/**
 * Parse space-separated format (original format)
 * Format: "2022-03-31 14:32:04+00:00 pikobar_jabar Message text here 1"
 */
function parseSpaceSeparatedFormat(cleanRawData) {
  try {
    // Regex to match timestamp, username, and message
    // Format: YYYY-MM-DD HH:MM:SS+TZ username message number
    const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s+(\w+)\s+(.*?)\s+(\d+)$/;
    const match = cleanRawData.match(regex);
    
    if (match) {
      return {
        timestamp: match[1],
        username: match[2],
        message: match[3].trim(),
        number: match[4],
        success: true,
        format: 'legacy_space'
      };
    }
    
    // Alternative parsing for different formats
    // Try to extract timestamp from beginning
    const timestampRegex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})/;
    const timestampMatch = cleanRawData.match(timestampRegex);
    
    if (timestampMatch) {
      const remaining = cleanRawData.substring(timestampMatch[1].length).trim();
      const parts = remaining.split(/\s+/);
      
      if (parts.length >= 2) {
        const username = parts[0];
        const message = parts.slice(1, -1).join(' '); // Everything except last part (usually a number)
        
        return {
          timestamp: timestampMatch[1],
          username: username,
          message: message.trim(),
          number: parts[parts.length - 1],
          success: true,
          format: 'legacy_space'
        };
      }
    }
    
    // If all parsing fails, return the raw data as message
    return {
      timestamp: null,
      username: 'unknown',
      message: cleanRawData,
      number: null,
      success: false,
      format: 'legacy_space'
    };
    
  } catch (error) {
    return {
      timestamp: null,
      username: 'unknown',
      message: cleanRawData,
      number: null,
      success: false,
      error: error.message,
      format: 'legacy_space'
    };
  }
}

/**
 * Clean message text by removing URLs, mentions, hashtags, etc.
 * @param {string} message - Raw message text
 * @returns {string} Cleaned message text
 */
function cleanMessageText(message) {
  try {
    let cleanText = message;
    
    // Remove URLs (http, https, t.co links)
    cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '');
    cleanText = cleanText.replace(/t\.co\/[^\s]+/g, '');
    
    // Remove @mentions completely
    cleanText = cleanText.replace(/@\w+/g, '');
    
    // Remove hashtags completely (including the text)
    cleanText = cleanText.replace(/#\w+/g, '');
    
    // Remove extra quotes
    cleanText = cleanText.replace(/"/g, '');
    
    // Remove RT (retweet indicators)
    cleanText = cleanText.replace(/\bRT\b/g, '');
    
    // Remove excessive whitespace and trim
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    return cleanText;
    
  } catch (error) {
    console.error('Error cleaning message text:', error);
    return message; // Return original if cleaning fails
  }
}

/**
 * Process array of raw Twitter data
 * @param {string[]} rawDataArray - Array of raw Twitter data strings
 * @returns {object[]} Array of processed data objects
 */
function processRawDataBatch(rawDataArray) {
  if (!Array.isArray(rawDataArray)) {
    throw new Error('Input must be an array of strings');
  }
  
  console.log(`🔄 Processing ${rawDataArray.length} raw data items...`);
  const startTime = Date.now();
  
  const processedItems = [];
  let validCount = 0;
  let invalidCount = 0;
  
  // Process all items synchronously for maximum speed
  for (let index = 0; index < rawDataArray.length; index++) {
    try {
      const rawData = rawDataArray[index];
      const parsed = parseRawTwitterData(rawData);
      const cleanText = cleanMessageText(parsed.message);
      
      const processedItem = {
        id: index + 1,
        rawData: rawData,
        timestamp: parsed.timestamp,
        username: parsed.username,
        originalMessage: parsed.message,
        cleanText: cleanText,
        parseSuccess: parsed.success,
        hasContent: cleanText.length > 3 // Minimum 3 characters
      };
      
      if (processedItem.hasContent) {
        processedItems.push(processedItem);
        validCount++;
      } else {
        invalidCount++;
      }
      
      // Log progress every 1000 items for large datasets
      if ((index + 1) % 1000 === 0) {
        const elapsed = Date.now() - startTime;
        const itemsPerMs = (index + 1) / elapsed;
        const remainingItems = rawDataArray.length - (index + 1);
        const estimatedTimeRemaining = Math.round(remainingItems / itemsPerMs / 1000);
        
        console.log(`📊 Processing progress: ${index + 1}/${rawDataArray.length} (${Math.round((index + 1) / rawDataArray.length * 100)}%) - Valid: ${validCount}, Invalid: ${invalidCount} - ETA: ${estimatedTimeRemaining}s`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing item ${index + 1}:`, error.message);
      invalidCount++;
    }
  }
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Processing complete: ${validCount} valid items, ${invalidCount} invalid items in ${totalTime}s`);
  
  return processedItems;
}

/**
 * Validate raw Twitter data format
 * @param {string} rawData - Raw Twitter data string
 * @returns {object} Validation result
 */
function validateRawData(rawData) {
  if (!rawData || typeof rawData !== 'string') {
    return {
      valid: false,
      error: 'Input must be a non-empty string'
    };
  }
  
  const parsed = parseRawTwitterData(rawData);
  const cleanText = cleanMessageText(parsed.message);
  
  if (cleanText.length === 0) {
    return {
      valid: false,
      error: 'No meaningful content found after cleaning'
    };
  }
  
  if (cleanText.length < 3) {
    return {
      valid: false,
      error: 'Content too short for sentiment analysis'
    };
  }
  
  return {
    valid: true,
    parsed: parsed,
    cleanText: cleanText
  };
}

module.exports = {
  parseRawTwitterData,
  cleanMessageText,
  processRawDataBatch,
  validateRawData,
  parseTabSeparatedFormat,
  parseCommaSeparatedFormat,
  parseSpaceSeparatedFormat
};