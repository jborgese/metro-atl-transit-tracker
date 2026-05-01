import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { ContentStoreError } from './errors';
import { isRecord, type StoredEntityRow, type StoreEvent } from './mappers';

export const DB_BINDING_NAME = 'DB';
export const D1_LOCAL_MIGRATION_CMD =
  'npx wrangler d1 migrations apply metro-atl-transit-prod --local';
export const SEED_BATCH_SIZE = 50;

export const SELECT_ENTITY_COLUMNS =
  'id, payload_json, is_archived, archived_at, archived_by, created_at, created_by, updated_at, updated_by';

export const INSERT_PROJECT_SQL = `
INSERT INTO projects (
  id,
  payload_json,
  is_archived,
  archived_at,
  archived_by,
  created_at,
  created_by,
  updated_at,
  updated_by
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
`;

export const INSERT_GOAL_SQL = `
INSERT INTO goals (
  id,
  payload_json,
  is_archived,
  archived_at,
  archived_by,
  created_at,
  created_by,
  updated_at,
  updated_by
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
`;

export const INSERT_HISTORY_SQL = `
INSERT INTO content_history (
  id,
  entity_type,
  entity_id,
  action,
  actor,
  timestamp,
  before_json,
  after_json
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
`;

export const UPDATE_PROJECT_SQL = `
UPDATE projects
SET
  payload_json = ?1,
  is_archived = ?2,
  archived_at = ?3,
  archived_by = ?4,
  created_at = ?5,
  created_by = ?6,
  updated_at = ?7,
  updated_by = ?8
WHERE id = ?9
`;

export const UPDATE_GOAL_SQL = `
UPDATE goals
SET
  payload_json = ?1,
  is_archived = ?2,
  archived_at = ?3,
  archived_by = ?4,
  created_at = ?5,
  created_by = ?6,
  updated_at = ?7,
  updated_by = ?8
WHERE id = ?9
`;

export type { D1Database, D1PreparedStatement };

export function getDb(event: StoreEvent): D1Database {
  const candidate = event.platform?.env?.[DB_BINDING_NAME];
  if (!candidate || !isRecord(candidate)) {
    throw new ContentStoreError(
      503,
      `D1 binding "${DB_BINDING_NAME}" is not available for this request. In local dev, make sure adapter-cloudflare platform proxy points at wrangler.jsonc and restart \`npm run dev\`.`
    );
  }

  const prepare = (candidate as { prepare?: unknown }).prepare;
  const batch = (candidate as { batch?: unknown }).batch;
  if (typeof prepare !== 'function' || typeof batch !== 'function') {
    throw new ContentStoreError(503, `D1 binding "${DB_BINDING_NAME}" is invalid`);
  }

  return candidate as unknown as D1Database;
}

export async function executeInBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += SEED_BATCH_SIZE) {
    const chunk = statements.slice(index, index + SEED_BATCH_SIZE);
    if (chunk.length > 0) {
      await db.batch(chunk);
    }
  }
}

export async function findProjectRow(db: D1Database, id: string) {
  return await db
    .prepare(`SELECT ${SELECT_ENTITY_COLUMNS} FROM projects WHERE id = ?1`)
    .bind(id)
    .first<StoredEntityRow>();
}

export async function findGoalRow(db: D1Database, id: string) {
  return await db
    .prepare(`SELECT ${SELECT_ENTITY_COLUMNS} FROM goals WHERE id = ?1`)
    .bind(id)
    .first<StoredEntityRow>();
}
