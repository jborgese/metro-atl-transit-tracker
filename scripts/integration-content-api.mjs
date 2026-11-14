import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
    `${baseUrl}/api/history?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}&limit=${limit}`,
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
    `Expected history count to increment by 1 for ${entityType}:${entityId}`,
  );
  assert.equal(
    after[0]?.action,
    expectedLatestAction,
    `Expected latest action to be "${expectedLatestAction}" for ${entityType}:${entityId}`,
  );
  return after;
}

function atlantaDatePlus(days) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const shifted = new Date(`${today}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function editableFields(record) {
  const {
    is_archived: _isArchived,
    archived_at: _archivedAt,
    archived_by: _archivedBy,
    ...fields
  } = record;
  return fields;
}

async function sendEditorRequest(method, pathname, body) {
  return await requestJson(`${baseUrl}${pathname}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function listTimedActionIds() {
  const response = await requestJson(`${baseUrl}/api/timed-actions`);
  assert.equal(response.status, 200, `GET /api/timed-actions failed: ${response.text}`);
  return (response.data?.data ?? []).map((action) => action.id);
}

async function runLocalSqlFile(name, sql, args = []) {
  const sqlFile = path.join(os.tmpdir(), `timed-action-${name}.sql`);
  fs.writeFileSync(sqlFile, sql);
  try {
    return await runWrangler(
      ['d1', 'execute', 'metro-atl-transit-prod', '--local', ...args, '--file', sqlFile],
      { cwd: repoRoot, timeoutMs: 60_000 },
    );
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
}

async function readStoredArchiveFlag(id) {
  const result = await runLocalSqlFile(
    `${id}-select`,
    `SELECT is_archived FROM timed_actions WHERE id = '${id}';`,
    ['--json'],
  );
  const parsed = JSON.parse(result.stdout.slice(result.stdout.search(/^\[/m)));
  return parsed[0]?.results?.[0]?.is_archived;
}

async function runTimedActionChecks(suffix) {
  console.log('[integration] Running timed-action checks...');
  const goalId = `it-goal-${suffix}`;
  const ts = new Date().toISOString();
  const nextWeek = atlantaDatePlus(7);

  const goalResponse = await sendEditorRequest('POST', '/api/goals', {
    id: goalId,
    goal: 'Integration timed-action goal',
    related_counties: [],
    related_project_ids: [],
    related_orgs: [],
  });
  assert.equal(goalResponse.status, 201, `Timed-action goal create failed: ${goalResponse.text}`);

  const createBody = {
    goal_id: goalId,
    description: 'Integration timed action',
    link: { label: 'Comment', url: 'https://example.org/comment' },
    location: { label: 'City hall', address: '55 Trinity Ave SW, Atlanta, GA' },
    expires_on: nextWeek,
  };
  const created = await sendEditorRequest('POST', '/api/timed-actions', createBody);
  assert.equal(created.status, 201, `Timed action create failed: ${created.text}`);
  const actionId = created.data?.data?.id;
  assert.match(actionId ?? '', /^ta-[a-z0-9]{8}$/, `Unexpected timed action id: ${actionId}`);
  assert.deepEqual(
    (await fetchEntityHistory('timed_action', actionId)).map((entry) => entry.action),
    ['create'],
    'A new timed action should have exactly one create event',
  );

  const missingGoal = await sendEditorRequest('POST', '/api/timed-actions', {
    ...createBody,
    goal_id: `it-missing-goal-${suffix}`,
  });
  assert.equal(missingGoal.status, 400, `Create with a missing goal: ${missingGoal.text}`);
  assert.match(missingGoal.data?.message ?? '', /goal_id: goal not found/);

  assert.ok(
    (await listTimedActionIds()).includes(actionId),
    'Default list should include the new action',
  );
  const fetched = await requestJson(`${baseUrl}/api/timed-actions/${actionId}`);
  assert.equal(fetched.status, 200, `GET /api/timed-actions/:id failed: ${fetched.text}`);
  assert.equal(fetched.data?.data?.id, actionId, 'Fetched timed action id mismatch');

  const { link: _link, ...withoutLink } = editableFields(fetched.data.data);
  await expectMutationHistory('timed_action', actionId, 'update', async () => {
    const response = await sendEditorRequest(
      'PATCH',
      `/api/timed-actions/${actionId}`,
      withoutLink,
    );
    assert.equal(response.status, 200, `Timed action replace failed: ${response.text}`);
    assert.equal(response.data?.data?.link, null, 'An omitted link should be stored as null');
  });

  const partial = await sendEditorRequest('PATCH', `/api/timed-actions/${actionId}`, {
    expires_on: nextWeek,
  });
  assert.equal(partial.status, 400, `A partial replace should be a 400: ${partial.text}`);

  const historyBeforeGoalToggle = await fetchEntityHistory('timed_action', actionId);
  const goalArchive = await sendEditorRequest('DELETE', `/api/goals/${goalId}`);
  assert.equal(goalArchive.status, 200, `Goal archive failed: ${goalArchive.text}`);
  assert.ok(
    !(await listTimedActionIds()).includes(actionId),
    'Default list should omit an action whose goal is archived',
  );
  const archivedGoal = await sendEditorRequest('POST', '/api/timed-actions', createBody);
  assert.equal(archivedGoal.status, 400, `Create with an archived goal: ${archivedGoal.text}`);
  assert.match(archivedGoal.data?.message ?? '', /goal_id: goal is archived/);
  const goalArchivedRestore = await sendEditorRequest(
    'POST',
    `/api/timed-actions/${actionId}/restore`,
  );
  assert.equal(
    goalArchivedRestore.status,
    409,
    `Restore under an archived goal: ${goalArchivedRestore.text}`,
  );
  assert.match(goalArchivedRestore.data?.message ?? '', /its goal is archived or missing/);
  const goalRestore = await sendEditorRequest('POST', `/api/goals/${goalId}/restore`);
  assert.equal(goalRestore.status, 200, `Goal restore failed: ${goalRestore.text}`);
  assert.ok(
    (await listTimedActionIds()).includes(actionId),
    'Default list should include the action again once its goal is restored',
  );
  assert.equal(
    (await fetchEntityHistory('timed_action', actionId)).length,
    historyBeforeGoalToggle.length,
    'Archiving and restoring the goal should not write timed-action history',
  );

  const archived = await sendEditorRequest('DELETE', `/api/timed-actions/${actionId}`);
  assert.equal(archived.status, 200, `Timed action archive failed: ${archived.text}`);
  assert.equal(archived.data?.data?.is_archived, true, 'Archive did not set is_archived=true');
  const archivedAgain = await sendEditorRequest('DELETE', `/api/timed-actions/${actionId}`);
  assert.equal(archivedAgain.status, 200, `Second archive failed: ${archivedAgain.text}`);
  assert.equal(
    (await fetchEntityHistory('timed_action', actionId)).filter(
      (entry) => entry.action === 'archive',
    ).length,
    1,
    'Archiving an archived action should write no event',
  );

  const restored = await sendEditorRequest('POST', `/api/timed-actions/${actionId}/restore`);
  assert.equal(restored.status, 200, `Timed action restore failed: ${restored.text}`);
  assert.equal(restored.data?.data?.is_archived, false, 'Restore did not set is_archived=false');
  const restoredAgain = await sendEditorRequest('POST', `/api/timed-actions/${actionId}/restore`);
  assert.equal(restoredAgain.status, 200, `Second restore failed: ${restoredAgain.text}`);
  assert.equal(
    (await fetchEntityHistory('timed_action', actionId)).filter(
      (entry) => entry.action === 'restore',
    ).length,
    1,
    'Restoring an active action should write no event',
  );

  console.log('[integration] Checking the expiry sweep...');
  const expiredId = `ta-exp${String(Date.now()).slice(-5)}`;
  const payload = JSON.stringify({
    id: expiredId,
    goal_id: goalId,
    description: 'expired',
    link: null,
    location: null,
    expires_on: '2020-01-01',
    is_archived: false,
    archived_at: null,
    archived_by: null,
    provenance: { created_at: ts, created_by: 'it', updated_at: ts, updated_by: 'it' },
  });
  await runLocalSqlFile(
    expiredId,
    `INSERT INTO timed_actions (id, payload_json, is_archived, created_at, created_by, updated_at, updated_by) VALUES ('${expiredId}', '${payload}', 0, '${ts}', 'it', '${ts}', 'it');`,
  );

  assert.ok(
    !(await listTimedActionIds()).includes(expiredId),
    'Default list should omit an expired action',
  );
  assert.equal(
    await readStoredArchiveFlag(expiredId),
    0,
    'The default list should not archive anything',
  );

  await Promise.all([
    fetchEntityHistory('timed_action', expiredId),
    fetchEntityHistory('timed_action', expiredId),
  ]);
  assert.deepEqual(
    (await fetchEntityHistory('timed_action', expiredId)).map(({ action, actor }) => ({
      action,
      actor,
    })),
    [{ action: 'archive', actor: 'system' }],
    'Overlapping sweeps should write exactly one system archive event',
  );

  const expiredRead = await requestJson(`${baseUrl}/api/timed-actions/${expiredId}`);
  assert.equal(expiredRead.status, 200, `GET expired action failed: ${expiredRead.text}`);
  assert.equal(expiredRead.data?.data?.is_archived, true, 'The sweep should archive the row');

  const expiredRestore = await sendEditorRequest('POST', `/api/timed-actions/${expiredId}/restore`);
  assert.equal(expiredRestore.status, 409, `Restore of an expired action: ${expiredRestore.text}`);
  assert.match(expiredRestore.data?.message ?? '', /last day has passed/);

  const extended = await sendEditorRequest('PATCH', `/api/timed-actions/${expiredId}`, {
    ...editableFields(expiredRead.data.data),
    expires_on: nextWeek,
  });
  assert.equal(extended.status, 200, `Extending an expired action failed: ${extended.text}`);
  assert.equal(extended.data?.data?.is_archived, true, 'An update should not change archive state');

  const extendedRestore = await sendEditorRequest(
    'POST',
    `/api/timed-actions/${expiredId}/restore`,
  );
  assert.equal(extendedRestore.status, 200, `Restore after extending: ${extendedRestore.text}`);
  assert.ok(
    (await listTimedActionIds()).includes(expiredId),
    'Default list should include the extended, restored action',
  );

  const feed = await requestJson(`${baseUrl}/api/history?entityType=timed_action&limit=50`);
  assert.equal(feed.status, 200, `GET timed-action history failed: ${feed.text}`);
  const feedTypes = new Set((feed.data?.data ?? []).map((entry) => entry.entity_type));
  assert.deepEqual(
    [...feedTypes],
    ['timed_action'],
    'entityType=timed_action should return only timed-action events',
  );
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
    vars: { EDITOR_API_TOKEN: editorToken, EDITOR_TOKEN_AUTH_ENABLED: 'true' },
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

    const projectHistory = await expectMutationHistory(
      'project',
      projectId,
      'restore',
      async () => {
        const response = await requestJson(`${baseUrl}/api/projects/${projectId}/restore`, {
          method: 'POST',
          headers: authHeaders(),
        });
        assert.equal(response.status, 200, `Project restore failed: ${response.text}`);
      },
    );
    assert.deepEqual(
      projectHistory.map((entry) => entry.action).slice(0, 4),
      ['restore', 'archive', 'update', 'create'],
      'Project history actions should be complete and ordered',
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
      'Goal history actions should be complete and ordered',
    );

    console.log('[integration] Verifying history immutability trigger...');
    const projectHistoryId = projectHistory[0]?.id;
    assert.ok(projectHistoryId, 'Expected project history to include at least one event');

    const tamperSql = `UPDATE content_history SET actor = 'tampered' WHERE id = '${projectHistoryId}';`;
    const tamperAttempt = await runWrangler(
      ['d1', 'execute', 'metro-atl-transit-prod', '--local', '--command', tamperSql],
      { cwd: repoRoot, expectFailure: true, timeoutMs: 120_000 },
    );
    const tamperOutput = `${tamperAttempt.stdout}\n${tamperAttempt.stderr}`;
    assert.match(
      tamperOutput,
      /immutable|ABORT|constraint|content_history/i,
      'Expected tamper attempt to fail due to immutable history trigger',
    );

    const afterTamperHistory = await fetchEntityHistory('project', projectId);
    assert.notEqual(
      afterTamperHistory[0]?.actor,
      'tampered',
      'History actor should remain unchanged after tamper attempt',
    );

    await runTimedActionChecks(suffix);

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
