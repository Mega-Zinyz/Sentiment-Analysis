const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createKeyedMutex() {
  const locks = new Map();

  return async function withLock(key, task) {
    const lock = locks.get(key) || Promise.resolve();
    let release;
    const nextLock = new Promise((resolve) => {
      release = resolve;
    });
    locks.set(key, lock.then(() => nextLock));

    await lock;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(key) === nextLock) {
        locks.delete(key);
      }
    }
  };
}

async function withRetry(operation, options = {}) {
  const {
    retries = 2,
    baseDelayMs = 1000,
    factor = 2,
    shouldRetry = () => true,
    logger = console,
    operationName = 'operation'
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldContinue = attempt < retries && shouldRetry(error, attempt + 1);
      if (!shouldContinue) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(factor, attempt);
      logger.warn?.(`${operationName} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`, error.message || error);
      await wait(delay);
    }
  }

  throw lastError;
}

function createUserSubmissionGuard() {
  const userStates = new Map();

  return {
    tryQueue(userId) {
      if (userStates.has(userId)) {
        return false;
      }
      userStates.set(userId, 'queued');
      return true;
    },
    tryActivate(userId) {
      if (userStates.get(userId) !== 'queued') {
        return false;
      }
      userStates.set(userId, 'active');
      return true;
    },
    release(userId) {
      userStates.delete(userId);
    },
    isBusy(userId) {
      return userStates.has(userId);
    },
    getState(userId) {
      return userStates.get(userId) || null;
    }
  };
}

function createQueueAdmissionGuard({ maxActiveJobs = 1, maxQueuedJobs = 2 } = {}) {
  let activeJobs = 0;
  let queuedJobs = 0;

  return {
    tryEnter() {
      if (activeJobs + queuedJobs >= maxActiveJobs + maxQueuedJobs) {
        return false;
      }
      queuedJobs += 1;
      return true;
    },
    start() {
      if (queuedJobs > 0) {
        queuedJobs -= 1;
      }
      activeJobs += 1;
    },
    finish() {
      if (activeJobs > 0) {
        activeJobs -= 1;
      }
    },
    releaseQueued() {
      if (queuedJobs > 0) {
        queuedJobs -= 1;
      }
    },
    getState() {
      return { activeJobs, queuedJobs };
    }
  };
}

function createGlobalCooldown({ cooldownMs = 30000 } = {}) {
  let lastExecutionAt = 0;
  let queuedSince = 0;

  return async function waitForCooldown() {
    const now = Date.now();
    const elapsed = now - lastExecutionAt;
    if (elapsed < cooldownMs) {
      const waitTime = cooldownMs - elapsed;
      queuedSince = now + waitTime;
      await wait(waitTime);
    }
    lastExecutionAt = Date.now();
  };
}

module.exports = {
  createGlobalCooldown,
  createKeyedMutex,
  createQueueAdmissionGuard,
  createUserSubmissionGuard,
  withRetry
};
