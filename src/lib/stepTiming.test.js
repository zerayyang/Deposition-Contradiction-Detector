import test from 'node:test';
import assert from 'node:assert/strict';
import { stepTiming, remainingLabel } from './analysisStatus.js';

// Hosted runs return all tasks each step; earlier steps come back marked reused.
const tasks = n => Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, status: i < n ? 'completed' : 'pending', reused: i < n - 1 }));

test('hosted steps count every task finished in this run, not only the newest', () => {
  const t = stepTiming(tasks(5), { requestCount: 10, cachedRequests: 0, totalRequestCount: 10 }, 510);
  assert.deepEqual(t, { processed: 5, processedThisRun: 5, remaining: 5, elapsed: 510 });
  // 102 s per step, 5 left: about 8–9 minutes, not 77.
  assert.match(remainingLabel({ status: 'running', planned: 10, completed: 5, tasks: tasks(5) }, true, 510, t), /About [89] min/);
});

test('work finished before this run started is excluded from the speed sample', () => {
  const t = stepTiming(tasks(5), { requestCount: 7, cachedRequests: 3, totalRequestCount: 10 }, 200);
  assert.equal(t.processedThisRun, 2); assert.equal(t.remaining, 5);
});
