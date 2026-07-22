const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeyedMutex, createQueueAdmissionGuard, createUserSubmissionGuard, withRetry } = require('../utils/requestGuard');

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

test('createUserSubmissionGuard blocks duplicate queued or active submissions for the same user', () => {
  const guard = createUserSubmissionGuard();

  assert.equal(guard.tryQueue('user-1'), true);
  assert.equal(guard.tryQueue('user-1'), false);
  assert.equal(guard.isBusy('user-1'), true);
  assert.equal(guard.tryActivate('user-1'), true);
  assert.equal(guard.tryQueue('user-1'), false);

  guard.release('user-1');

  assert.equal(guard.tryQueue('user-1'), true);
  assert.equal(guard.getState('user-1'), 'queued');
});

test('createQueueAdmissionGuard limits queued and active jobs', () => {
  const guard = createQueueAdmissionGuard({ maxActiveJobs: 1, maxQueuedJobs: 2 });

  assert.equal(guard.tryEnter(), true);
  assert.equal(guard.tryEnter(), true);
  assert.equal(guard.tryEnter(), true);
  assert.equal(guard.tryEnter(), false);

  guard.start();
  assert.equal(guard.tryEnter(), false);
  assert.equal(guard.getState().activeJobs, 1);
  assert.equal(guard.getState().queuedJobs, 2);

  guard.finish();
  guard.releaseQueued();
});
