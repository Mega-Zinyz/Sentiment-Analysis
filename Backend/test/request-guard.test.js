const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeyedMutex, withRetry } = require('../utils/requestGuard');

test('createKeyedMutex serializes concurrent work for the same key', async () => {
  const mutex = createKeyedMutex();
  const order = [];

  await Promise.all([
    mutex('same-key', async () => {
      order.push('first-start');
      await new Promise(resolve => setTimeout(resolve, 20));
      order.push('first-end');
    }),
    mutex('same-key', async () => {
      order.push('second-start');
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push('second-end');
    })
  ]);

  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
});

test('withRetry retries transient failures and eventually succeeds', async () => {
  let attempts = 0;

  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error('temporary failure');
    }
    return 'ok';
  }, {
    retries: 3,
    baseDelayMs: 1,
    logger: { info() {}, warn() {}, error() {} }
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});
