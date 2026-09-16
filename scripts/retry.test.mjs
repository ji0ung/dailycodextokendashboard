import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from './retry.mjs';

test('retries with exponential delays and returns attempt count', async () => {
  const delays = [];
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('temporary');
    return 'ok';
  }, { baseDelayMs: 10, sleep: async (ms) => delays.push(ms) });
  assert.deepEqual(result, { value: 'ok', attempts: 3 });
  assert.deepEqual(delays, [10, 20]);
});

test('exposes attempt count after final failure', async () => {
  await assert.rejects(
    withRetry(async () => { throw new Error('down'); }, { attempts: 2, sleep: async () => {} }),
    (error) => error.message === 'down' && error.attempts === 2,
  );
});
