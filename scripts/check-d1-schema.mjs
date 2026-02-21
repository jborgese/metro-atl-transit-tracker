import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './test-utils/cloudflare-test-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const databaseName = process.env.D1_LOCAL_DATABASE ?? 'metro-atl-transit-prod';

function normalizeSql(sql = '') {
  return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseWranglerJson(stdout, context) {
  const raw = String(stdout ?? '').trim();
  if (!raw) {
    throw new Error(`[schema] ${context}: empty JSON output from wrangler.`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`[schema] ${context}: failed to parse wrangler JSON output.\n${raw}`);
    }
    return JSON.parse(raw.slice(start, end + 1));
  }
}

async function executeSql(sql) {
  const commandArg =
    process.platform === 'win32' ? `"${sql.replace(/"/g, '\\"')}"` : sql;

  const output = await runWrangler(
    ['d1', 'execute', databaseName, '--local', '--command', commandArg, '--json'],
    { cwd: repoRoot, timeoutMs: 120_000 }
  );

  const parsed = parseWranglerJson(output.stdout, `sql "${sql}"`);
  const firstResult = Array.isArray(parsed) ? parsed[0] : null;

  if (!firstResult?.success) {
    throw new Error(`[schema] D1 query failed: ${sql}\n${output.stdout}\n${output.stderr}`);
  }

  return firstResult.results ?? [];
}

function quoteForSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function run() {
  const expectedObjects = [
    {
      type: 'table',
      name: 'projects',
      sqlIncludes: [
        'create table projects',
        'payload_json text not null check (json_valid(payload_json))',
        'is_archived integer not null default 0 check (is_archived in (0, 1))',
        'created_at text not null',
        'updated_at text not null',
      ],
    },
    {
      type: 'table',
      name: 'goals',
      sqlIncludes: [
        'create table goals',
        'payload_json text not null check (json_valid(payload_json))',
        'is_archived integer not null default 0 check (is_archived in (0, 1))',
        'created_at text not null',
        'updated_at text not null',
      ],
    },
    {
      type: 'table',
      name: 'content_history',
      sqlIncludes: [
        'create table content_history',
        "entity_type text not null check (entity_type in ('project', 'goal'))",
        "action text not null check (action in ('create', 'update', 'archive', 'restore'))",
        'before_json text check (before_json is null or json_valid(before_json))',
        'after_json text check (after_json is null or json_valid(after_json))',
      ],
    },
    {
      type: 'index',
      name: 'idx_projects_archive_state',
      sqlIncludes: ['on projects (is_archived, updated_at desc)'],
    },
    {
      type: 'index',
      name: 'idx_goals_archive_state',
      sqlIncludes: ['on goals (is_archived, updated_at desc)'],
    },
    {
      type: 'index',
      name: 'idx_content_history_entity',
      sqlIncludes: ['on content_history (entity_type, entity_id, timestamp desc)'],
    },
    {
      type: 'index',
      name: 'idx_content_history_timestamp',
      sqlIncludes: ['on content_history (timestamp desc)'],
    },
    {
      type: 'trigger',
      name: 'trg_content_history_immutable_update',
      sqlIncludes: [
        'before update on content_history',
        "raise(abort, 'content_history is immutable')",
      ],
    },
    {
      type: 'trigger',
      name: 'trg_content_history_immutable_delete',
      sqlIncludes: [
        'before delete on content_history',
        "raise(abort, 'content_history is immutable')",
      ],
    },
  ];

  console.log(`[schema] Applying local migrations for "${databaseName}"...`);
  await runWrangler(['d1', 'migrations', 'apply', databaseName, '--local'], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });

  const quotedNames = expectedObjects.map((item) => quoteForSql(item.name)).join(', ');
  const rows = await executeSql(
    `SELECT type, name, sql FROM sqlite_master WHERE name IN (${quotedNames}) ORDER BY name;`
  );
  const byName = new Map(rows.map((row) => [String(row.name), row]));

  for (const expected of expectedObjects) {
    const row = byName.get(expected.name);
    assert.ok(row, `[schema] Missing ${expected.type} "${expected.name}".`);
    assert.equal(
      String(row.type),
      expected.type,
      `[schema] "${expected.name}" should be type "${expected.type}" but was "${row.type}".`
    );

    const normalizedSql = normalizeSql(row.sql);
    for (const snippet of expected.sqlIncludes) {
      assert.ok(
        normalizedSql.includes(snippet),
        `[schema] "${expected.name}" is missing SQL fragment: ${snippet}`
      );
    }
  }

  console.log(`[schema] Schema checks passed for "${databaseName}".`);
}

run().catch((error) => {
  console.error('[schema] Schema checks failed.');
  console.error(error);
  process.exit(1);
});
