import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runtimeConfiguration} from '../../server/configuration.js';

const root=fileURLToPath(new URL('../../',import.meta.url));

// A 20-page pair needs about 20 reading requests; the old local default of 12 refused it.
test('local and hosted runs share the same request allowance; spending stays capped by USD',()=>{
  const local=runtimeConfiguration({},root),hosted=runtimeConfiguration({VERCEL:'1',DEMO_USER_IDS:'u'},root);
  assert.equal(local.maxRequests,512);assert.equal(hosted.maxRequests,512);
  assert.equal(local.maxBudgetUsd,25);assert.equal(hosted.maxBudgetUsd,25);
  assert.equal(runtimeConfiguration({MAX_ANALYSIS_REQUESTS:'12'},root).maxRequests,12);
});
