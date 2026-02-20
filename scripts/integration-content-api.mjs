import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requestJson,
  runNpm,
  runWrangler,
  startWranglerDev,
  waitForHttpReady,
} from './test-utils/cloudflare-test-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const port = 8791;
const baseUrl = `http://127.0.0.1:${port}`;
const editorToken = 'integration-test-token';
const workerOutput = path.join(repoRoot, '.svelte-kit', 'cloudflare', '_worker.js');

function authHeaders() {
  return {
    'content-type': 'application/json',
    'x-editor-token': editorToken,
  };
}

async function fetchEntityHistory(entityType, entityId, limit = 20) {
  const response = await requestJson(
    `${baseUrl}/api/history?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}&limit=${limit}`
  );
  assert.equal(response.status, 200, `GET /api/history failed: ${response.text}`);
  return response.data?.data ?? [];
}

async function expectMutationHistory(entityType, entityId, expectedLatestAction, mutate) {
  const before = await fetchEntityHistory(entityType, entityId);
  await mutate();
  const after = await fetchEntityHistory(entityType, entityId);
  assert.equal(
    after.length,
    before.length + 1,
    `Expected history count to increment by 1 for ${entityType}:${entityId}`
  );
  assert.equal(
    after[0]?.action,
    expectedLatestAction,
    `Expected latest action to be "${expectedLatestAction}" for ${entityType}:${entityId}`
  );
  return after;
}

async function run() {
  const forceBuild = process.env.INTEGRATION_FORCE_BUILD === '1';
  if (forceBuild || !fs.existsSync(workerOutput)) {
    console.log('[integration] Building app...');
    await runNpm(['run', 'build'], { cwd: repoRoot, timeoutMs: 240_000 });
  } else {
    console.log('[integration] Reusing existing build output.');
  }

  console.log('[integration] Ensuring local D1 schema is applied...');
  await runWrangler(['d1', 'migrations', 'apply', 'metro-atl-transit-prod', '--local'], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });

  console.log('[integration] Starting wrangler dev...');
  const devServer = startWranglerDev({
    cwd: repoRoot,
    port,
    vars: { EDITOR_API_TOKEN: editorToken },
  });

  try {
    await waitForHttpReady(`${baseUrl}/api/history?limit=1`, { timeoutMs: 90_000 });
    console.log('[integration] Running mutation-history invariants...');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const projectId = `int-project-${suffix}`;
    const goalId = `int-goal-${suffix}`;

    const projectPayload = {
      id: projectId,
      title: 'Integration Test Project',
      summary: 'create',
      status: 'planning',
      related_counties: [],
      modes: [],
      sources: [],
    };
    const goalPayload = {
      id: goalId,
      goal: 'Integration test goal',
      actions: 'create',
      related_counties: [],
      related_project_ids: [],
      related_orgs: [],
    };

    await expectMutationHistory('project', projectId, 'create', async () => {
      const response = await requestJson(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(projectPayload),
      });
      assert.equal(response.status, 201, `Project create failed: ${response.text}`);
    });

    await expectMutationHistory('project', projectId, 'update', async () => {
      const response = await requestJson(`${baseUrl}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ summary: 'update' }),
      });
      assert.equal(response.status, 200, `Project update failed: ${response.text}`);
    });

    await expectMutationHistory('project', projectId, 'archive', async () => {
      const response = await requestJson(`${baseUrl}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      assert.equal(response.status, 200, `Project archive failed: ${response.text}`);
    });

    const projectHistory = await expectMutationHistory('project', projectId, 'restore', async () => {
      const response = await requestJson(`${baseUrl}/api/projects/${projectId}/restore`, {
        method: 'POST',
        headers: authHeaders(),
      });
      assert.equal(response.status, 200, `Project restore failed: ${response.text}`);
    });
    assert.deepEqual(
      projectHistory.map((entry) => entry.action).slice(0, 4),
      ['restore', 'archive', 'update', 'create'],
      'Project history actions should be complete and ordered'
    );

    await expectMutationHistory('goal', goalId, 'create', async () => {
      const response = await requestJson(`${baseUrl}/api/goals`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(goalPayload),
      });
      assert.equal(response.status, 201, `Goal create failed: ${response.text}`);
    });

    await expectMutationHistory('goal', goalId, 'update', async () => {
      const response = await requestJson(`${baseUrl}/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ actions: 'update' }),
      });
      assert.equal(response.status, 200, `Goal update failed: ${response.text}`);
    });

    await expectMutationHistory('goal', goalId, 'archive', async () => {
      const response = await requestJson(`${baseUrl}/api/goals/${goalId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      assert.equal(response.status, 200, `Goal archive failed: ${response.text}`);
    });

    const goalHistory = await expectMutationHistory('goal', goalId, 'restore', async () => {
      const response = await requestJson(`${baseUrl}/api/goals/${goalId}/restore`, {
        method: 'POST',
        headers: authHeaders(),
      });
      assert.equal(response.status, 200, `Goal restore failed: ${response.text}`);
    });
    assert.deepEqual(
      goalHistory.map((entry) => entry.action).slice(0, 4),
      ['restore', 'archive', 'update', 'create'],
      'Goal history actions should be complete and ordered'
    );

    console.log('[integration] Verifying history immutability trigger...');
    const projectHistoryId = projectHistory[0]?.id;
    assert.ok(projectHistoryId, 'Expected project history to include at least one event');

    const tamperSql = `UPDATE content_history SET actor = 'tampered' WHERE id = '${projectHistoryId}';`;
    const tamperAttempt = await runWrangler(
      ['d1', 'execute', 'metro-atl-transit-prod', '--local', '--command', tamperSql],
      { cwd: repoRoot, expectFailure: true, timeoutMs: 120_000 }
    );
    const tamperOutput = `${tamperAttempt.stdout}\n${tamperAttempt.stderr}`;
    assert.match(
      tamperOutput,
      /immutable|ABORT|constraint|content_history/i,
      'Expected tamper attempt to fail due to immutable history trigger'
    );

    const afterTamperHistory = await fetchEntityHistory('project', projectId);
    assert.notEqual(
      afterTamperHistory[0]?.actor,
      'tampered',
      'History actor should remain unchanged after tamper attempt'
    );

    console.log('[integration] Integration tests passed.');
  } finally {
    await devServer.stop();
  }
}

run().catch((error) => {
  console.error('[integration] Integration tests failed.');
  console.error(error);
  process.exit(1);
});
