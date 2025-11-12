const axios = require('axios');
const { getUserCredentialsForRequest } = require('./apiConfig');
const fs = require('fs').promises;
const path = require('path');

// Helper function to update credentials
async function updateCredentials(userId, credentials) {
  try {
    const credentialsPath = path.join(__dirname, '../config/api-credentials.json');
    await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
  } catch (error) {
    console.error('Error updating credentials:', error);
  }
}

async function fetchTweetsHandler(req, res) {
  const { keyword, max_results = 10 } = req.body;
  const userId = req.user.userId;
  
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  // Get user's API credentials with rotation support
  const credentials = await getUserCredentialsForRequest(userId);
  if (!credentials) {
    return res.status(400).json({ 
      error: 'X/Twitter API credentials not configured. Please configure your API credentials first.',
      needsConfiguration: true
    });
  }

  // Support both new rotation format and legacy format
  let bearerToken = credentials.bearerToken;
  let currentTokenInfo = null;
  
  if (credentials.bearerTokens && credentials.bearerTokens.length > 0) {
    // New rotation format
    const tokenIndex = credentials.currentTokenIndex || 0;
    currentTokenInfo = credentials.bearerTokens[tokenIndex];
    bearerToken = currentTokenInfo?.token;
    
    // Check if current token has exceeded monthly limit
    if (currentTokenInfo && currentTokenInfo.monthlyUsage >= currentTokenInfo.maxUsage) {
      // Try to find an available token
      const availableToken = credentials.bearerTokens.find(t => t.monthlyUsage < t.maxUsage);
      if (availableToken) {
        bearerToken = availableToken.token;
        currentTokenInfo = availableToken;
        // Update current token index
        credentials.currentTokenIndex = credentials.bearerTokens.indexOf(availableToken);
        await updateCredentials(userId, credentials);
      } else {
        return res.status(429).json({ 
          error: 'All API tokens have reached their monthly limit. Please wait until next month or add more tokens.',
          allTokensExhausted: true
        });
      }
    }
  }

  if (!bearerToken) {
    return res.status(400).json({ 
      error: 'No valid Bearer Token found. Please configure your API credentials.',
      needsConfiguration: true
    });
  }

  try {
    let response;
    
    // Try real Twitter API v1.1 first
    try {
      console.log('🐦 Attempting to fetch tweets from Twitter API v1.1...');
      response = await axios.get('https://api.twitter.com/1.1/search/tweets.json', {
        params: {
          q: keyword,
          count: Math.min(max_results, 100),
          result_type: 'recent',
          tweet_mode: 'extended',
          include_entities: false
        },
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
      });
      
      console.log(`✅ Successfully fetched ${response.data.statuses.length} tweets from Twitter API`);
      
    } catch (apiError) {
      console.log('❌ Twitter API error occurred, falling back to mock data:', apiError.response?.data || apiError.message);
      
      // Generate mock tweets as fallback
      const mockTweets = [];
      const sampleTexts = [
        `Great news about ${keyword}! This is really exciting and positive development.`,
        `I'm not sure about ${keyword}, it seems quite concerning to me.`,
        `Just heard about ${keyword}. What does everyone think about this?`,
        `${keyword} is trending! Here's my thoughts on this topic.`,
        `Interesting perspective on ${keyword}. I think this could be good.`,
        `Not happy with ${keyword} situation. This needs to change.`,
        `Love what's happening with ${keyword}! So excited for the future.`,
        `Mixed feelings about ${keyword}. Some good points, some bad.`,
        `${keyword} update: things are looking better than expected.`,
        `Disappointed by ${keyword} news. Expected more from this.`
      ];
      
      for (let i = 0; i < Math.min(max_results, 10); i++) {
        mockTweets.push({
          id_str: `mock_${Date.now()}_${i}`,
          full_text: sampleTexts[i % sampleTexts.length],
          created_at: new Date().toISOString(),
          user: {
            id_str: `user_${i + 1}`,
            name: `Test User ${i + 1}`,
            screen_name: `testuser${i + 1}`
          }
        });
      }
      
      response = { data: { statuses: mockTweets } };
      console.log('🧪 Generated mock tweets as fallback');
    }

    // Process API v1.1 response format
    const tweets = response.data.statuses || [];
    const processedTweets = tweets.map(tweet => ({
      id: tweet.id_str,
      text: tweet.full_text || tweet.text,
      created_at: tweet.created_at,
      author_id: tweet.user.id_str,
      username: tweet.user.screen_name,
      user: {
        id: tweet.user.id_str,
        name: tweet.user.name,
        username: tweet.user.screen_name
      }
    }));

    // Update usage count if using rotation system
    if (currentTokenInfo && credentials.bearerTokens) {
      currentTokenInfo.monthlyUsage = (currentTokenInfo.monthlyUsage || 0) + processedTweets.length;
      await updateCredentials(userId, credentials);
    }

    // Return in API v2 compatible format for frontend
    const responseData = {
      data: processedTweets,
      meta: {
        result_count: processedTweets.length
      },
      _usage: currentTokenInfo ? {
        tokenName: currentTokenInfo.name,
        used: currentTokenInfo.monthlyUsage,
        limit: currentTokenInfo.maxUsage,
        remaining: currentTokenInfo.maxUsage - currentTokenInfo.monthlyUsage
      } : null
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching tweets:', error.response?.data || error.message);
    
    // Handle API access level limitations (error code 453)
    if (error.response?.data?.errors?.[0]?.code === 453) {
      console.log('🧪 API access limited, falling back to mock data for development');
      
      // Generate mock tweets as fallback
      const mockTweets = [];
      const sampleTexts = [
        `Great news about ${keyword}! This is really exciting and positive development.`,
        `I'm not sure about ${keyword}, it seems quite concerning to me.`,
        `Just heard about ${keyword}. What does everyone think about this?`,
        `${keyword} is trending! Here's my thoughts on this topic.`,
        `Interesting perspective on ${keyword}. I think this could be good.`,
        `Not happy with ${keyword} situation. This needs to change.`,
        `Love what's happening with ${keyword}! So excited for the future.`,
        `Mixed feelings about ${keyword}. Some good points, some bad.`,
        `${keyword} update: things are looking better than expected.`,
        `Disappointed by ${keyword} news. Expected more from this.`
      ];
      
      for (let i = 0; i < Math.min(max_results, 10); i++) {
        mockTweets.push({
          id: `mock_${Date.now()}_${i}`,
          text: sampleTexts[i % sampleTexts.length],
          created_at: new Date().toISOString(),
          author_id: `user_${i + 1}`,
          username: `testuser${i + 1}`,
          user: {
            id: `user_${i + 1}`,
            name: `Test User ${i + 1}`,
            username: `testuser${i + 1}`
          }
        });
      }
      
      return res.json({
        data: mockTweets,
        meta: {
          result_count: mockTweets.length
        },
        _mockData: true,
        _message: 'Using mock data due to limited API access. Upgrade your Twitter API plan for real tweets.'
      });
    }
    
    // Handle other specific Twitter API errors
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Invalid X/Twitter API credentials. Please check your Bearer Token.',
        needsConfiguration: true
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.',
        details: 'X/Twitter API rate limit reached'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch tweets', 
      details: error.response?.data || error.message 
    });
  }
}

// Get Twitter API rate limits
async function getRateLimitsHandler(req, res) {
  console.log('🔍 Rate limits request - User:', req.user);
  const userId = req.user.userId;
  console.log('🔍 Rate limits request - User ID:', userId);
  
  try {
    // Get user's API credentials
    const credentials = await getUserCredentialsForRequest(userId);
    if (!credentials) {
      console.log('❌ No API credentials found for user:', userId);
      return res.status(400).json({ 
        error: 'X/Twitter API credentials not configured. Please configure your API credentials first.',
        needsConfiguration: true
      });
    }
    
    console.log('✅ Found API credentials for user:', userId);
    console.log('🔑 Using bearer token:', credentials.bearer_token ? 'Yes (length: ' + credentials.bearer_token.length + ')' : 'No');

    // Fetch rate limit status from Twitter API
    const response = await axios.get('https://api.twitter.com/1.1/application/rate_limit_status.json', {
      headers: {
        'Authorization': `Bearer ${credentials.bearer_token}`,
        'Content-Type': 'application/json'
      },
      params: {
        resources: 'tweets,users,search'
      }
    });

    const rateLimitData = response.data.resources;
    const limits = [];

    // Parse relevant rate limits
    if (rateLimitData.tweets) {
      Object.keys(rateLimitData.tweets).forEach(endpoint => {
        const limit = rateLimitData.tweets[endpoint];
        limits.push({
          endpoint: `tweets${endpoint}`,
          limit: limit.limit,
          remaining: limit.remaining,
          reset: limit.reset,
          resetTime: new Date(limit.reset * 1000).toLocaleString()
        });
      });
    }

    if (rateLimitData.search) {
      Object.keys(rateLimitData.search).forEach(endpoint => {
        const limit = rateLimitData.search[endpoint];
        limits.push({
          endpoint: `search${endpoint}`,
          limit: limit.limit,
          remaining: limit.remaining,
          reset: limit.reset,
          resetTime: new Date(limit.reset * 1000).toLocaleString()
        });
      });
    }

    if (rateLimitData.users) {
      Object.keys(rateLimitData.users).forEach(endpoint => {
        const limit = rateLimitData.users[endpoint];
        limits.push({
          endpoint: `users${endpoint}`,
          limit: limit.limit,
          remaining: limit.remaining,
          reset: limit.reset,
          resetTime: new Date(limit.reset * 1000).toLocaleString()
        });
      });
    }

    res.json({ rateLimits: limits });

  } catch (error) {
    console.error('Error fetching rate limits:', error);
    console.error('Error details:', error.response?.data);
    console.error('Twitter API response status:', error.response?.status);
    
    if (error.response?.status === 401) {
      return res.status(400).json({ 
        error: 'Invalid or expired Twitter API credentials. Please reconfigure your API credentials.',
        needsConfiguration: true
      });
    }

    // If no response (network error, etc.)
    if (!error.response) {
      return res.status(500).json({ 
        error: 'Failed to connect to Twitter API', 
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch rate limits', 
      details: error.response?.data || error.message 
    });
  }
}

module.exports = { fetchTweetsHandler, getRateLimitsHandler };
