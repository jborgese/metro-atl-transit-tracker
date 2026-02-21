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

const port = 8789;
const baseUrl = `http://127.0.0.1:${port}`;
const editorToken = 'smoke-test-token';
const workerOutput = path.join(repoRoot, '.svelte-kit', 'cloudflare', '_worker.js');

async function run() {
  const skipBuild = process.env.SMOKE_SKIP_BUILD === '1';
  const forceBuild = process.env.SMOKE_FORCE_BUILD === '1';
  if (skipBuild) {
    console.log('[smoke] Skipping build because SMOKE_SKIP_BUILD=1.');
  } else if (!forceBuild && fs.existsSync(workerOutput)) {
    console.log('[smoke] Reusing existing build output.');
  } else {
    console.log('[smoke] Building app...');
    await runNpm(['run', 'build'], { cwd: repoRoot, timeoutMs: 240_000 });
  }

  console.log('[smoke] Ensuring local D1 schema is applied...');
  await runWrangler(['d1', 'migrations', 'apply', 'metro-atl-transit-prod', '--local'], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });

  console.log('[smoke] Starting wrangler dev...');
  const devServer = startWranglerDev({
    cwd: repoRoot,
    port,
    vars: { EDITOR_API_TOKEN: editorToken, EDITOR_TOKEN_AUTH_ENABLED: 'true' },
  });

  try {
    await waitForHttpReady(`${baseUrl}/api/history?limit=1`, { timeoutMs: 90_000 });
    console.log('[smoke] API is reachable, running checks...');

    const projectsList = await requestJson(`${baseUrl}/api/projects`);
    assert.equal(projectsList.status, 200, 'GET /api/projects should return 200');
    assert.ok(Array.isArray(projectsList.data?.data), 'GET /api/projects should return array data');

    const goalsList = await requestJson(`${baseUrl}/api/goals`);
    assert.equal(goalsList.status, 200, 'GET /api/goals should return 200');
    assert.ok(Array.isArray(goalsList.data?.data), 'GET /api/goals should return array data');

    const historyList = await requestJson(`${baseUrl}/api/history?limit=5`);
    assert.equal(historyList.status, 200, 'GET /api/history should return 200');
    assert.ok(Array.isArray(historyList.data?.data), 'GET /api/history should return array data');

    const entityId = `smoke-project-${Date.now()}`;
    const createPayload = {
      id: entityId,
      title: 'Smoke Test Project',
      summary: 'Smoke test write path',
      status: 'planning',
      related_counties: [],
      modes: [],
      sources: [],
    };
    const authHeaders = {
      'content-type': 'application/json',
      'x-editor-token': editorToken,
    };

    const createResponse = await requestJson(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(createPayload),
    });
    assert.equal(createResponse.status, 201, `POST /api/projects failed: ${createResponse.text}`);
    assert.equal(createResponse.data?.data?.id, entityId, 'Created project id mismatch');

    const updateResponse = await requestJson(`${baseUrl}/api/projects/${entityId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ summary: 'Smoke test update' }),
    });
    assert.equal(updateResponse.status, 200, `PATCH /api/projects/:id failed: ${updateResponse.text}`);

    const archiveResponse = await requestJson(`${baseUrl}/api/projects/${entityId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(archiveResponse.status, 200, `DELETE /api/projects/:id failed: ${archiveResponse.text}`);
    assert.equal(archiveResponse.data?.data?.is_archived, true, 'Archive did not set is_archived=true');

    const restoreResponse = await requestJson(`${baseUrl}/api/projects/${entityId}/restore`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(
      restoreResponse.status,
      200,
      `POST /api/projects/:id/restore failed: ${restoreResponse.text}`
    );
    assert.equal(restoreResponse.data?.data?.is_archived, false, 'Restore did not set is_archived=false');

    console.log('[smoke] Smoke tests passed.');
  } finally {
    await devServer.stop();
  }
}

run().catch((error) => {
  console.error('[smoke] Smoke tests failed.');
  console.error(error);
  process.exit(1);
});
