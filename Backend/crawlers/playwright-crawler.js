const { chromium } = require('playwright');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

class PlaywrightCrawler {
  constructor(config = {}) {
    this.config = {
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      // Conservative rate limit: 3-5 seconds between requests
      rateLimit: config.rateLimit || 3500,
      maxRetries: config.maxRetries || 2,
      proxy: config.proxy || null,
      userAgent: config.userAgent || this.getRandomUserAgent(),
      xUsername: config.xUsername || null,
      xPassword: config.xPassword || null,
      sinceDate: config.sinceDate || null,
      untilDate: config.untilDate || null,
      // Increased max scrolls for better coverage
      maxScrolls: config.maxScrolls || 10,
      minScrollDelay: config.minScrollDelay || 2000,
      maxScrollDelay: config.maxScrollDelay || 4500,
      ...config
    };

    this.browser = null;
    this.context = null;
    this.page = null;
    this.tweetsCollected = [];
    this.lastRequestTime = 0;
  }

  getRandomUserAgent() {
    // Modern Chrome user agents (2024) — old UA strings trigger bot detection
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Initialize browser with anti-detection measures at context level
   */
  async initialize() {
    try {
      logger.info('🌐 Initializing Playwright browser...');

      const launchOptions = {
        headless: this.config.headless,
        // Use system Chromium in Docker; falls back to Playwright's own browser in local dev
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--lang=en-US',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-default-apps',
          '--no-first-run',
          '--blink-settings=imagesEnabled=false',
        ]
      };

      if (this.config.proxy) {
        launchOptions.proxy = this.config.proxy;
      }

      this.browser = await chromium.launch(launchOptions);

      // Create browser context with realistic headers and locale
      const contextOptions = {
        userAgent: this.config.userAgent,
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        }
      };

      if (this.config.proxy) {
        contextOptions.proxy = this.config.proxy;
      }

      this.context = await this.browser.newContext(contextOptions);

      // Inject anti-detection scripts into every page in this context
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        // Spoof chrome runtime to look like a real browser
        window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
      });

      logger.info('✅ Browser initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize browser:', error);
      throw error;
    }
  }

  async createPage() {
    try {
      this.page = await this.context.newPage();

      // Block images, fonts, and media — not needed for text scraping, saves CPU/bandwidth
      await this.page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      logger.info('✅ New page created (images/media/fonts blocked)');
    } catch (error) {
      logger.error('❌ Failed to create page:', error);
      throw error;
    }
  }

  /**
   * Main crawl function — fixed tweet accumulation and scroll logic
   */
  async crawlTweets(keyword, maxResults = 100, onProgress = null) {
    try {
      await this.initialize();
      await this.createPage();
      await this.attemptLoginIfRequired();

      const safeMaxResults = Math.min(maxResults, 500);

      logger.info(`🔍 Starting crawl for keyword: "${keyword}" (target: ${safeMaxResults} tweets)`);
      logger.info(`⚠️  Rate limit: ${this.config.rateLimit}ms | Max scrolls: ${this.config.maxScrolls}`);

      const searchUrl = this.buildSearchUrl(keyword);

      // Use a Set for deduplication and an array for ordered results
      const seenIds = new Set();
      const allTweets = [];
      let retries = 0;

      while (allTweets.length < safeMaxResults && retries < this.config.maxRetries) {
        if (this.config.cancelCheck && this.config.cancelCheck()) {
          logger.info('🛑 Crawl cancelled by user request — stopping retry loop');
          break;
        }
        try {
          await this.enforceRateLimit();

          logger.info(`📄 Navigating to search (attempt ${retries + 1}/${this.config.maxRetries})...`);

          // Use 'domcontentloaded' — X.com never reaches 'networkidle' as a SPA
          await this.page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeout
          });

          // Give React time to render — historical date-filtered searches can be slower
          await this.page.waitForTimeout(5000);

          // Detect login wall: URL redirect
          const currentUrl = this.page.url();
          if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
            logger.warn('⚠️  Redirected to login — X.com credentials required for search');
            break;
          }

          // Detect login wall: dialog overlay (X.com shows this without changing the URL)
          const loginDialog = await this.page.locator(
            '[data-testid="sheetDialog"], [aria-label="Sign in to X"], [data-testid="LoginForm"]'
          ).first().isVisible({ timeout: 2000 }).catch(() => false);
          if (loginDialog) {
            logger.warn('⚠️  X.com login wall detected — valid credentials required to search');
            break;
          }

          // Wait for tweets to appear — use longer timeout for historical date-filtered searches
          const tweetSelector = 'article[data-testid="tweet"]';
          const tweetsLoaded = await this.page.waitForSelector(tweetSelector, { timeout: 25000 })
            .then(() => true)
            .catch(() => false);

          if (!tweetsLoaded) {
            const pageTitle = await this.page.title().catch(() => '?');
            // Check if X.com is showing an empty state (no results) vs a rendering failure
            const emptyState = await this.page.locator('[data-testid="empty_state_header_text"]')
              .isVisible({ timeout: 2000 }).catch(() => false);
            if (emptyState) {
              logger.warn(`⚠️  X.com returned no results for this query/date range (page: "${pageTitle}")`);
              break; // Genuine empty — no point retrying
            }
            logger.warn(`⚠️  No tweets loaded on this attempt (page: "${pageTitle}")`);
            retries++;
            await this.randomDelay(this.config.rateLimit, retries);
            continue;
          }

          // Scroll loop — properly accumulates tweets across all scrolls
          let scrolls = 0;
          let consecutiveEmptyScrolls = 0;

          while (allTweets.length < safeMaxResults && scrolls < this.config.maxScrolls) {
            // Check for external cancellation signal between scrolls
            if (this.config.cancelCheck && this.config.cancelCheck()) {
              logger.info('🛑 Crawl cancelled by user request — stopping scroll loop');
              break;
            }

            const pageTweets = await this.extractTweets();

            let newCount = 0;
            for (const tweet of pageTweets) {
              if (tweet.id && !seenIds.has(tweet.id)) {
                seenIds.add(tweet.id);
                allTweets.push(tweet);
                newCount++;
                if (allTweets.length >= safeMaxResults) break;
              }
            }

            logger.info(`📊 Collected ${allTweets.length}/${safeMaxResults} tweets (${newCount} new, scroll ${scrolls})`);

            if (onProgress) {
              onProgress({
                collected: allTweets.length,
                total: safeMaxResults,
                progress: Math.round((allTweets.length / safeMaxResults) * 100)
              });
            }

            if (allTweets.length >= safeMaxResults) break;

            if (newCount === 0) {
              consecutiveEmptyScrolls++;
              if (consecutiveEmptyScrolls >= 2) {
                logger.warn('⚠️  No new tweets after 2 consecutive scrolls, stopping');
                break;
              }
            } else {
              consecutiveEmptyScrolls = 0;
            }

            const scrollDelay = this.config.minScrollDelay +
              Math.random() * (this.config.maxScrollDelay - this.config.minScrollDelay);

            logger.info(`⏱️  Waiting ${Math.round(scrollDelay)}ms before scroll ${scrolls + 1}...`);
            await this.page.waitForTimeout(scrollDelay);

            // Scroll to bottom of page (more effective than fixed pixel amounts)
            await this.page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });

            await this.page.waitForTimeout(1500 + Math.random() * 1000);
            scrolls++;
          }

          retries = this.config.maxRetries; // success — exit retry loop

        } catch (error) {
          retries++;
          logger.error(`❌ Crawl error (attempt ${retries}/${this.config.maxRetries}):`, error.message);

          if (error.message.includes('429') || error.message.includes('rate limit')) {
            logger.warn('⚠️  Rate limit hit, backing off...');
            await this.randomDelay(this.config.rateLimit * 3, retries);
          } else if (retries < this.config.maxRetries) {
            await this.randomDelay(this.config.rateLimit, retries);
          }
        }
      }

      this.tweetsCollected = allTweets.slice(0, safeMaxResults);

      if (this.tweetsCollected.length === 0) {
        logger.warn('⚠️  No tweets collected. Provide X.com credentials for better results.');
      }

      logger.info(`✅ Crawl done. Collected: ${this.tweetsCollected.length} tweets`);
      return this.tweetsCollected;

    } catch (error) {
      logger.error('❌ Fatal crawl error:', error);
      throw error;
    } finally {
      await this.close();
    }
  }

  buildSearchUrl(keyword) {
    let query = keyword;
    if (this.config.sinceDate) query += ` since:${this.config.sinceDate}`;
    if (this.config.untilDate) {
      // until: is exclusive, so add 1 day to include tweets from that date
      const d = new Date(this.config.untilDate);
      d.setDate(d.getDate() + 1);
      const inclusive = d.toISOString().slice(0, 10);
      query += ` until:${inclusive}`;
    }
    const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    logger.info(`🔗 Search URL: ${url}`);
    return url;
  }

  /**
   * Login to X.com — handles multi-step flow including "unusual activity" check
   */
  async attemptLoginIfRequired() {
    if (!this.config.xUsername && !this.config.xCookies) {
      logger.info('ℹ️  No credentials provided, proceeding without login');
      return;
    }

    // Cookie-based login (preferred — bypasses bot detection entirely)
    if (this.config.xCookies) {
      try {
        const raw = typeof this.config.xCookies === 'string'
          ? JSON.parse(this.config.xCookies)
          : this.config.xCookies;

        // Normalize cookies to Playwright's required format
        const sameSiteMap = {
          'no_restriction': 'None', 'none': 'None',
          'lax': 'Lax', 'strict': 'Strict',
          'unspecified': 'Lax', '': 'Lax'
        };
        const cookies = raw.map(c => {
          const normalized = {
            name: c.name,
            value: c.value,
            domain: c.domain || '.x.com',
            path: c.path || '/',
            sameSite: sameSiteMap[(c.sameSite || '').toLowerCase()] || 'Lax',
            secure: c.secure || false,
            httpOnly: c.httpOnly || false,
          };
          // Playwright requires expires as Unix timestamp (seconds); skip -1 (session cookies)
          if (c.expirationDate && c.expirationDate > 0) {
            normalized.expires = Math.floor(c.expirationDate);
          } else if (c.expires && c.expires > 0) {
            normalized.expires = Math.floor(c.expires);
          }
          return normalized;
        });

        await this.context.addCookies(cookies);
        logger.info(`🍪 Loaded ${cookies.length} cookies — verifying session...`);
        await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: this.config.timeout });
        await this.page.waitForTimeout(2000);
        const homeUrl = this.page.url();
        if (homeUrl.includes('/home') || homeUrl.includes('/feed')) {
          logger.info('✅ Logged in via cookies successfully');
          return;
        }
        logger.warn('⚠️  Cookie login failed (expired?) — falling back to password login');
      } catch (cookieErr) {
        logger.warn('⚠️  Cookie load error: ' + cookieErr.message);
      }
    }

    if (!this.config.xUsername || !this.config.xPassword) {
      logger.info('ℹ️  No password credentials, proceeding without login');
      return;
    }

    try {
      logger.info('🔐 Attempting X.com login...');

      await this.page.goto('https://x.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout
      });

      // Wait for React/jf components to mount — poll until an input appears (max 20s)
      await this.page.waitForSelector(
        'input[autocomplete="username"], input[name="text"], input[type="text"]:not([readonly])',
        { timeout: 20000 }
      ).catch(() => {});
      await this.page.waitForTimeout(1000);

      const loginPageUrl = this.page.url();
      const loginPageTitle = await this.page.title().catch(() => '?');
      logger.info(`📄 Login page: "${loginPageTitle}" (${loginPageUrl})`);

      // Step 1: Enter username — try multiple selectors (X.com changes these periodically)
      const usernameSelectors = [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[type="text"]:not([readonly]):not([disabled])',
      ];

      let usernameField = null;
      for (const selector of usernameSelectors) {
        const loc = this.page.locator(selector).first();
        const visible = await loc.isVisible({ timeout: 4000 }).catch(() => false);
        if (visible) {
          usernameField = loc;
          logger.info(`Found username field: ${selector}`);
          break;
        }
      }

      if (!usernameField) {
        throw new Error(`Username input not found on "${loginPageTitle}" — bot detection or login UI changed`);
      }

      // Type username char-by-char to simulate human input (fill() is too instant)
      await usernameField.click();
      await this.page.waitForTimeout(300 + Math.random() * 200);
      await this.page.keyboard.type(this.config.xUsername, { delay: 80 + Math.random() * 40 });
      await this.page.waitForTimeout(600 + Math.random() * 400);

      // Advance to password step — prefer login-specific selectors
      const nextBtnSelectors = [
        'button:has-text("Next")',
        '[role="button"]:has-text("Next")',
        'button[type="submit"]',
        'button:has-text("Continue")',
        '.jf-button',
        'button:not([disabled]):not([aria-hidden="true"])',
      ];
      let advanced = false;
      for (const sel of nextBtnSelectors) {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          advanced = true;
          logger.info(`Advanced username step with: ${sel}`);
          break;
        }
      }
      if (!advanced) {
        logger.warn('No Next button found — trying Tab+Enter');
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
        await this.page.keyboard.press('Enter');
      }
      // Wait for jf SPA to navigate to the password step (URL hash changes to #/s/login_enter_password)
      await this.page.waitForURL(
        url => url.includes('login_enter_password') || url.includes('enter_password'),
        { timeout: 10000 }
      ).catch(() => {});
      await this.page.waitForTimeout(800);

      const afterUsernameUrl = this.page.url();
      logger.info(`📄 After username step: (${afterUsernameUrl})`);

      // Detect if we ended up in signup flow instead of login (account not found)
      if (afterUsernameUrl.includes('signup') || afterUsernameUrl.includes('#/s/')) {
        logger.warn(`⚠️  Redirected to signup — account "${this.config.xUsername}" not found on X.com. Trying legacy login flow...`);
        await this.page.goto('https://x.com/i/flow/login', {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeout
        });
        await this.page.waitForFunction(() => document.title.length > 0, { timeout: 15000 }).catch(() => {});
        await this.page.waitForTimeout(2000);
        // Legacy flow uses autocomplete="username"
        const legacyUsername = this.page.locator('input[autocomplete="username"]').first();
        if (await legacyUsername.isVisible({ timeout: 8000 }).catch(() => false)) {
          await legacyUsername.fill(this.config.xUsername);
          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(2500);
        } else {
          throw new Error(`X.com account "${this.config.xUsername}" not found — verify credentials in Profile settings`);
        }
      }

      // Step 1.5: X.com may ask for phone/email verification ("unusual activity")
      const verificationInput = this.page.locator('input[data-testid="ocfEnterTextTextInput"]');
      if (await verificationInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        logger.warn('⚠️  Unusual login activity check — entering username as verification');
        await verificationInput.fill(this.config.xUsername);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(2000);
      }

      await this.page.waitForTimeout(1000);

      // DEBUG: scan ALL jf elements including non-inputs (custom password widget)
      const inputDebug = await this.page.evaluate(() => {
        const sel = '.jf-float-input, .jf-element, [tabindex="0"], [role="textbox"], [contenteditable]';
        return Array.from(document.querySelectorAll(sel)).slice(0, 20).map(el => ({
          tag: el.tagName,
          name: el.name || el.getAttribute('name') || '',
          type: el.type || el.getAttribute('type') || '',
          id: el.id,
          cls: el.className.substring(0, 80),
          ariaHidden: el.getAttribute('aria-hidden'),
          tabIndex: el.tabIndex,
          role: el.getAttribute('role') || '',
          w: el.offsetWidth, h: el.offsetHeight,
          val: el.value ? `[${el.value.length}ch]` : (el.textContent?.trim().substring(0, 10) || '')
        }));
      });
      logger.info('JF elements at password step: ' + JSON.stringify(inputDebug));

      // If URL changed to login_enter_password, wait for the modal's password input
      if (afterUsernameUrl.includes('login_enter_password') || afterUsernameUrl.includes('enter_password')) {
        await this.page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 8000 }).catch(() => {});
        await this.page.waitForTimeout(500);
      }

      // Step 2: Wait for password field
      let passwordField = null;
      const pwSelectors = [
        'input[name="password"]:not([aria-hidden="true"])',
        'input[type="password"]:not([aria-hidden="true"])',
        'input[type="password"].jf-float-input',
        'input[id*="password"]:not([aria-hidden="true"])',
        'input[name="password"]',
      ];
      for (const sel of pwSelectors) {
        const loc = this.page.locator(sel).first();
        if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) {
          passwordField = loc;
          logger.info(`Found password field with: ${sel}`);
          break;
        }
      }
      if (!passwordField) {
        throw new Error(`Password field not found — check X.com credentials for "${this.config.xUsername}" in Profile settings`);
      }

      // jf form uses aria-hidden inputs as decoration — click via raw mouse coords
      // so the jf framework's own click handler activates, then type via keyboard
      const pwBox = await passwordField.boundingBox();
      if (pwBox) {
        await this.page.mouse.click(pwBox.x + pwBox.width / 2, pwBox.y + pwBox.height / 2);
      } else {
        // fallback: remove aria-hidden and focus via JS
        await this.page.evaluate(() => {
          const el = document.querySelector('input[type="password"], input[name="password"]');
          if (el) { el.removeAttribute('aria-hidden'); el.focus(); }
        });
      }
      await this.page.waitForTimeout(300);
      // Clear any existing value then type password char-by-char to trigger jf state
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.press('Delete');
      await this.page.keyboard.type(this.config.xPassword, { delay: 50 });
      await this.page.waitForTimeout(500 + Math.random() * 500);
      logger.info('Password filled via mouse.click + keyboard.type');

      // Click "Log in" button or press Enter
      const loginBtnSelectors = [
        '[data-testid="LoginForm_Login_Button"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button[type="submit"]',
        '.jf-button',
      ];
      let loginClicked = false;
      for (const sel of loginBtnSelectors) {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          loginClicked = true;
          logger.info(`Clicked login button: ${sel}`);
          break;
        }
      }
      if (!loginClicked) {
        logger.info('No login button found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      // Wait until we leave the login flow (up to 20s)
      await this.page.waitForURL(
        url => !url.toString().includes('/login') && !url.toString().includes('/i/flow') && !url.toString().includes('/i/jf'),
        { timeout: 20000 }
      ).catch(() => {});

      await this.page.waitForTimeout(2000);

      const postLoginUrl = this.page.url();
      const postLoginTitle = await this.page.title().catch(() => '?');
      logger.info(`📄 After login attempt: "${postLoginTitle}" (${postLoginUrl})`);

      if (await this.isLoggedIn()) {
        logger.info('✅ X.com login successful');
      } else {
        // Check for error message on page
        const errorMsg = await this.page.locator('[data-testid="toast"], [role="alert"]').first()
          .textContent({ timeout: 2000 }).catch(() => null);
        logger.warn(`⚠️  Login failed — page: "${postLoginTitle}" | error on page: ${errorMsg || 'none detected'}`);
      }
    } catch (error) {
      logger.warn('⚠️  X.com login failed: ' + (error.message || String(error)));
    }
  }

  async isLoggedIn() {
    const indicator = this.page.locator('[data-testid="AppTabBar_Home_Link"], a[href="/home"]');
    return (await indicator.count()) > 0;
  }

  async verifyXCredentials() {
    if (!this.config.xUsername || !this.config.xPassword) {
      throw new Error('X.com username and password must be provided');
    }
    try {
      await this.initialize();
      await this.createPage();
      await this.attemptLoginIfRequired();
      return await this.isLoggedIn();
    } finally {
      await this.close();
    }
  }

  /**
   * Extract tweets from current page — improved ID and username extraction
   */
  async extractTweets() {
    try {
      const tweets = await this.page.$$eval('article[data-testid="tweet"]', articles => {
        return articles.map(article => {
          try {
            const textElement = article.querySelector('[data-testid="tweetText"]');
            const text = textElement ? textElement.innerText.trim() : '';

            // Prefer the status link for reliable ID and username extraction
            const tweetLink = article.querySelector('a[href*="/status/"]');
            const tweetUrl = tweetLink ? tweetLink.href : '';

            // Extract tweet ID — strip query params
            const statusPart = tweetUrl.split('/status/')[1];
            const tweetId = statusPart ? statusPart.split('?')[0].split('/')[0] : '';

            // Username is the path segment before /status/
            const urlParts = tweetUrl.split('/');
            const statusIndex = urlParts.indexOf('status');
            const username = statusIndex > 0 ? urlParts[statusIndex - 1] : 'unknown';

            const timeElement = article.querySelector('time');
            const timestamp = timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString();

            if (!text || !tweetId) return null;

            return {
              id: tweetId,
              text,
              username,
              created_at: timestamp,
              url: tweetUrl,
              source: 'playwright_crawler'
            };
          } catch (e) {
            return null;
          }
        }).filter(tweet => tweet !== null);
      });

      return tweets;
    } catch (error) {
      logger.warn('⚠️  Failed to extract tweets:', error.message);
      return [];
    }
  }

  randomDelay(ms, retryCount = 0) {
    let delayMs = ms;
    if (retryCount > 0) {
      delayMs = ms * Math.pow(2, retryCount - 1);
    }
    const jitter = delayMs * 0.2;
    const finalDelay = delayMs + (Math.random() - 0.5) * jitter * 2;
    logger.info(`⏱️  Waiting ${Math.round(finalDelay)}ms...`);
    return new Promise(resolve => setTimeout(resolve, finalDelay));
  }

  async enforceRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.config.rateLimit) {
      await this.randomDelay(this.config.rateLimit - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  async close() {
    try {
      if (this.context) await this.context.close();
      if (this.browser) {
        await this.browser.close();
        logger.info('🔌 Browser closed');
      }
    } catch (error) {
      logger.error('❌ Error closing browser:', error);
    }
  }
}

module.exports = PlaywrightCrawler;
