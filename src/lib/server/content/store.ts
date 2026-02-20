import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import contentProjectsSeed from '../../../../data/content/projects.json';
import contentGoalsSeed from '../../../../data/content/goals.json';
import contentHistorySeed from '../../../../data/content/history.json';
import legacyProjectsSeed from '../../../data/geo/projects-metadata.json';
import legacyGoalsSeed from '../../../data/geo/goals-metadata.json';
import type {
  ContentEntityType,
  ContentHistoryEvent,
  Goal,
  Project,
} from '@/types/content';

type StoreEvent = {
  platform?: {
    env?: Record<string, unknown>;
  };
};

type D1ResultSet<T> = {
  results: T[];
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1ResultSet<T>>;
  run<T = unknown>(): Promise<T>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
};

type StoredEntityRow = {
  id: string;
  payload_json: string;
  is_archived: number | string;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};

type StoredHistoryRow = {
  id: string;
  entity_type: ContentEntityType;
  entity_id: string;
  action: ContentHistoryEvent['action'];
  actor: string;
  timestamp: string;
  before_json: string | null;
  after_json: string | null;
};

type StoredCountsRow = {
  project_count: number | string | null;
  goal_count: number | string | null;
  history_count: number | string | null;
};

type StoredEntityWrite = {
  entity: Record<string, unknown>;
  payloadJson: string;
  isArchived: number;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

const DB_BINDING_NAME = 'DB';
const SEED_ACTOR = 'seed';
const SEED_BATCH_SIZE = 50;
const FORBIDDEN_MUTATION_FIELDS = new Set(['is_archived', 'archived_at', 'archived_by']);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const SELECT_ENTITY_COLUMNS =
  'id, payload_json, is_archived, archived_at, archived_by, created_at, created_by, updated_at, updated_by';

const INSERT_PROJECT_SQL = `
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

const INSERT_GOAL_SQL = `
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

const INSERT_HISTORY_SQL = `
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

const CREATE_PROJECT_WITH_HISTORY_SQL = `
WITH inserted AS (
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
  RETURNING id
)
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
SELECT ?10, 'project', ?1, 'create', ?11, ?12, NULL, ?13
FROM inserted
`;

const CREATE_GOAL_WITH_HISTORY_SQL = `
WITH inserted AS (
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
  RETURNING id
)
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
SELECT ?10, 'goal', ?1, 'create', ?11, ?12, NULL, ?13
FROM inserted
`;

const UPDATE_PROJECT_WITH_HISTORY_SQL = `
WITH updated AS (
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
  RETURNING id
)
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
SELECT ?10, 'project', ?9, ?11, ?12, ?13, ?14, ?15
FROM updated
`;

const UPDATE_GOAL_WITH_HISTORY_SQL = `
WITH updated AS (
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
  RETURNING id
)
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
SELECT ?10, 'goal', ?9, ?11, ?12, ?13, ?14, ?15
FROM updated
`;

const nonEmptyStringSchema = z.string().trim().min(1);
const idSchema = nonEmptyStringSchema
  .max(120)
  .regex(ID_PATTERN, 'must use lowercase letters, numbers, and hyphens only');
const nullableDateStringSchema = z.union([nonEmptyStringSchema.max(120), z.null()]);
const provenanceSchema = z.record(z.string(), z.unknown());
const genericRecordSchema = z.record(z.string(), z.unknown());

const organizationRefSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    url: z.string().trim().url().optional(),
  })
  .passthrough();

const relatedOrgSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    url: z.string().trim().url().optional(),
    contact_info: z.string().max(600).optional(),
  })
  .passthrough();

const contentSourceSchema = z
  .object({
    label: nonEmptyStringSchema.max(200),
    url: z.string().trim().url(),
    last_verified: nonEmptyStringSchema.max(120).optional(),
  })
  .passthrough();

const projectCreateSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema.max(240),
    summary: z.string().max(5000).optional(),
    status: nonEmptyStringSchema.max(120).optional(),
    lead_org: organizationRefSchema.optional(),
    partners: z.array(organizationRefSchema).optional(),
    start_date: nullableDateStringSchema.optional(),
    end_date: nullableDateStringSchema.optional(),
    milestones: z.array(genericRecordSchema).optional(),
    geo_scope: nonEmptyStringSchema.max(160).optional(),
    modes: z.array(nonEmptyStringSchema.max(120)).optional(),
    related_counties: z.array(nonEmptyStringSchema.max(120)).optional(),
    sources: z.array(contentSourceSchema).optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

const projectPatchSchema = projectCreateSchema.partial();

const goalCreateSchema = z
  .object({
    id: idSchema,
    goal: nonEmptyStringSchema.max(2000),
    status_related_projects: z.string().max(5000).optional(),
    actions: z.string().max(5000).optional(),
    related_orgs: z.array(relatedOrgSchema).optional(),
    related_project_ids: z.array(idSchema).optional(),
    related_counties: z.array(nonEmptyStringSchema.max(120)).optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

const goalPatchSchema = goalCreateSchema.partial();

let seedPromise: Promise<void> | null = null;

export class ContentStoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContentStoreError';
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return structuredClone(value);
}

function asSeedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? structuredClone(value as T[]) : [];
}

function parseIntSafe(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function zodErrorToMessage(err: z.ZodError) {
  if (err.issues.length === 0) {
    return 'invalid payload';
  }

  const firstIssue = err.issues[0];
  const path = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'payload';
  return `${path}: ${firstIssue.message}`;
}

function parseSchema<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw new ContentStoreError(400, `${label} validation failed - ${zodErrorToMessage(parsed.error)}`);
}

function assertNoForbiddenWriteFields(payload: Record<string, unknown>, label: string) {
  for (const field of FORBIDDEN_MUTATION_FIELDS) {
    if (field in payload) {
      throw new ContentStoreError(
        400,
        `${label} contains server-managed field "${field}". Use archive/restore endpoints instead.`
      );
    }
  }
}

function ensureProvenance(
  value: unknown,
  actor: string,
  timestamp: string,
  isCreate: boolean
): Record<string, unknown> {
  const provenance = isRecord(value) ? { ...value } : {};
  const createdAt = typeof provenance.created_at === 'string' ? provenance.created_at : timestamp;
  const createdBy = typeof provenance.created_by === 'string' ? provenance.created_by : actor;

  provenance.created_at = createdAt;
  provenance.created_by = createdBy;
  provenance.updated_at = timestamp;
  provenance.updated_by = actor;

  if (isCreate && typeof provenance.license !== 'string') {
    provenance.license = 'CC-BY-4.0';
  }

  return provenance;
}

function applyArchiveFields(
  entity: Record<string, unknown>,
  actor: string,
  timestamp: string,
  previousArchived: boolean
) {
  const archived = entity.is_archived === true;
  if (archived && !previousArchived) {
    entity.archived_at = timestamp;
    entity.archived_by = actor;
  }

  if (!archived && previousArchived) {
    entity.archived_at = null;
    entity.archived_by = null;
  }

  if (!archived) {
    entity.archived_at = null;
    entity.archived_by = null;
  }
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // fall through
  }

  throw new ContentStoreError(500, `${label} payload is invalid JSON`);
}

function normalizeEntityForStorage(
  entityInput: Record<string, unknown>,
  actor: string,
  timestamp: string,
  isCreate: boolean
): StoredEntityWrite {
  const id = typeof entityInput.id === 'string' && entityInput.id.trim().length > 0 ? entityInput.id : null;
  if (!id) {
    throw new ContentStoreError(500, 'entity id is missing');
  }

  const provenance = ensureProvenance(entityInput.provenance, actor, timestamp, isCreate);
  const createdAt = typeof provenance.created_at === 'string' ? provenance.created_at : timestamp;
  const createdBy = typeof provenance.created_by === 'string' ? provenance.created_by : actor;
  const updatedAt = typeof provenance.updated_at === 'string' ? provenance.updated_at : timestamp;
  const updatedBy = typeof provenance.updated_by === 'string' ? provenance.updated_by : actor;

  const archived = entityInput.is_archived === true;
  const archivedAt =
    archived && typeof entityInput.archived_at === 'string' ? entityInput.archived_at : archived ? timestamp : null;
  const archivedBy =
    archived && typeof entityInput.archived_by === 'string' ? entityInput.archived_by : archived ? actor : null;

  const normalized: Record<string, unknown> = {
    ...entityInput,
    id,
    is_archived: archived,
    archived_at: archivedAt,
    archived_by: archivedBy,
    provenance: {
      ...provenance,
      created_at: createdAt,
      created_by: createdBy,
      updated_at: updatedAt,
      updated_by: updatedBy,
    },
  };

  return {
    entity: normalized,
    payloadJson: JSON.stringify(normalized),
    isArchived: archived ? 1 : 0,
    archivedAt,
    archivedBy,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
  };
}

function rowToProject(row: StoredEntityRow): Project {
  const payload = parseJsonObject(row.payload_json, `project ${row.id}`);
  payload.id = row.id;
  payload.is_archived = parseIntSafe(row.is_archived) === 1;
  payload.archived_at = row.archived_at;
  payload.archived_by = row.archived_by;

  const provenance = isRecord(payload.provenance) ? { ...payload.provenance } : {};
  provenance.created_at = row.created_at;
  provenance.created_by = row.created_by;
  provenance.updated_at = row.updated_at;
  provenance.updated_by = row.updated_by;
  payload.provenance = provenance;

  return payload as Project;
}

function rowToGoal(row: StoredEntityRow): Goal {
  const payload = parseJsonObject(row.payload_json, `goal ${row.id}`);
  payload.id = row.id;
  payload.is_archived = parseIntSafe(row.is_archived) === 1;
  payload.archived_at = row.archived_at;
  payload.archived_by = row.archived_by;

  const provenance = isRecord(payload.provenance) ? { ...payload.provenance } : {};
  provenance.created_at = row.created_at;
  provenance.created_by = row.created_by;
  provenance.updated_at = row.updated_at;
  provenance.updated_by = row.updated_by;
  payload.provenance = provenance;

  return payload as Goal;
}

function rowToHistoryEvent(row: StoredHistoryRow): ContentHistoryEvent {
  const before = row.before_json ? parseJsonObject(row.before_json, `history ${row.id} before`) : null;
  const after = row.after_json ? parseJsonObject(row.after_json, `history ${row.id} after`) : null;

  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    actor: row.actor,
    timestamp: row.timestamp,
    before,
    after,
  };
}

function toHistoryJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value) : null;
}

function buildHistoryEvent(params: {
  entityType: ContentEntityType;
  entityId: string;
  action: ContentHistoryEvent['action'];
  actor: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  timestamp: string;
}): ContentHistoryEvent {
  return {
    id: randomUUID(),
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    actor: params.actor,
    timestamp: params.timestamp,
    before: params.before ?? null,
    after: params.after ?? null,
  };
}

function toProjectCreate(input: unknown): Project {
  const payload = parseSchema(projectCreateSchema, input, 'project');
  const summary = typeof payload.summary === 'string' ? payload.summary : '';
  const status = typeof payload.status === 'string' ? payload.status : 'planning';
  assertNoForbiddenWriteFields(payload, 'project payload');

  return {
    ...payload,
    summary,
    status,
  } as Project;
}

function toGoalCreate(input: unknown): Goal {
  const payload = parseSchema(goalCreateSchema, input, 'goal');
  assertNoForbiddenWriteFields(payload, 'goal payload');

  return {
    ...payload,
  } as Goal;
}

function toProjectPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(projectPatchSchema, input, 'project patch');
  assertNoForbiddenWriteFields(payload, 'project patch');
  return payload;
}

function toGoalPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(goalPatchSchema, input, 'goal patch');
  assertNoForbiddenWriteFields(payload, 'goal patch');
  return payload;
}

function toProjectSeed(input: unknown): Project {
  const payload = parseSchema(projectCreateSchema, input, 'project seed');
  const summary = typeof payload.summary === 'string' ? payload.summary : '';
  const status = typeof payload.status === 'string' ? payload.status : 'planning';
  return {
    ...payload,
    summary,
    status,
  } as Project;
}

function toGoalSeed(input: unknown): Goal {
  const payload = parseSchema(goalCreateSchema, input, 'goal seed');
  return {
    ...payload,
  } as Goal;
}

function toSeedHistoryEvent(input: unknown): ContentHistoryEvent {
  if (!isRecord(input)) {
    throw new ContentStoreError(500, 'history seed entry is invalid');
  }

  const entityType =
    input.entity_type === 'project' || input.entity_type === 'goal' ? input.entity_type : null;
  const action =
    input.action === 'create' ||
    input.action === 'update' ||
    input.action === 'archive' ||
    input.action === 'restore'
      ? input.action
      : null;
  const entityId = typeof input.entity_id === 'string' ? input.entity_id : null;
  const actor = typeof input.actor === 'string' && input.actor.trim().length > 0 ? input.actor.trim() : SEED_ACTOR;
  const timestamp =
    typeof input.timestamp === 'string' && input.timestamp.trim().length > 0 ? input.timestamp : nowIso();
  const id = typeof input.id === 'string' && input.id.trim().length > 0 ? input.id.trim() : randomUUID();

  if (!entityType || !action || !entityId) {
    throw new ContentStoreError(500, 'history seed entry is missing required fields');
  }

  return {
    id,
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor,
    timestamp,
    before: isRecord(input.before) ? cloneRecord(input.before) : null,
    after: isRecord(input.after) ? cloneRecord(input.after) : null,
  };
}

function getDb(event: StoreEvent): D1Database {
  const candidate = event.platform?.env?.[DB_BINDING_NAME];
  if (!candidate || !isRecord(candidate)) {
    throw new ContentStoreError(
      503,
      'D1 binding "DB" is not available for this request. Use wrangler dev/deploy with D1 bindings configured.'
    );
  }

  const prepare = (candidate as { prepare?: unknown }).prepare;
  const batch = (candidate as { batch?: unknown }).batch;
  if (typeof prepare !== 'function' || typeof batch !== 'function') {
    throw new ContentStoreError(503, 'D1 binding "DB" is invalid');
  }

  return candidate as unknown as D1Database;
}

async function executeInBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += SEED_BATCH_SIZE) {
    const chunk = statements.slice(index, index + SEED_BATCH_SIZE);
    if (chunk.length > 0) {
      await db.batch(chunk);
    }
  }
}

function selectProjectSeeds() {
  const canonical = asSeedArray<Project>(contentProjectsSeed);
  if (canonical.length > 0) {
    return canonical;
  }
  return asSeedArray<Project>(legacyProjectsSeed);
}

function selectGoalSeeds() {
  const canonical = asSeedArray<Goal>(contentGoalsSeed);
  if (canonical.length > 0) {
    return canonical;
  }
  return asSeedArray<Goal>(legacyGoalsSeed);
}

function isUniqueConstraintError(err: unknown) {
  if (!(err instanceof Error)) {
    return false;
  }
  return /unique|constraint/i.test(err.message);
}

function extractRunChanges(result: unknown): number | null {
  if (!isRecord(result)) {
    return null;
  }
  const meta = result.meta;
  if (!isRecord(meta)) {
    return null;
  }
  const changes = meta.changes;
  return typeof changes === 'number' ? changes : null;
}

async function ensureSeeded(db: D1Database) {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const counts = await db
      .prepare(
        `
SELECT
  (SELECT COUNT(*) FROM projects) AS project_count,
  (SELECT COUNT(*) FROM goals) AS goal_count,
  (SELECT COUNT(*) FROM content_history) AS history_count
`
      )
      .first<StoredCountsRow>();

    const projectCount = parseIntSafe(counts?.project_count);
    const goalCount = parseIntSafe(counts?.goal_count);
    const historyCount = parseIntSafe(counts?.history_count);

    const statements: D1PreparedStatement[] = [];

    if (projectCount === 0) {
      const seedTimestamp = nowIso();
      for (const seed of selectProjectSeeds()) {
        const seedRecord = seed as unknown as Record<string, unknown>;
        const project = toProjectSeed(seed);
        const archived = seedRecord.is_archived === true;
        const seededEntity: Project = {
          ...project,
          is_archived: archived,
          archived_at:
            archived && typeof seedRecord.archived_at === 'string'
              ? seedRecord.archived_at
              : archived
                ? seedTimestamp
                : null,
          archived_by:
            archived && typeof seedRecord.archived_by === 'string'
              ? seedRecord.archived_by
              : archived
                ? SEED_ACTOR
                : null,
          provenance: ensureProvenance(seedRecord.provenance ?? project.provenance, SEED_ACTOR, seedTimestamp, true),
        };
        const stored = normalizeEntityForStorage(
          seededEntity as unknown as Record<string, unknown>,
          SEED_ACTOR,
          seedTimestamp,
          true
        );
        statements.push(
          db
            .prepare(INSERT_PROJECT_SQL)
            .bind(
              seededEntity.id,
              stored.payloadJson,
              stored.isArchived,
              stored.archivedAt,
              stored.archivedBy,
              stored.createdAt,
              stored.createdBy,
              stored.updatedAt,
              stored.updatedBy
            )
        );
      }
    }

    if (goalCount === 0) {
      const seedTimestamp = nowIso();
      for (const seed of selectGoalSeeds()) {
        const seedRecord = seed as unknown as Record<string, unknown>;
        const goal = toGoalSeed(seed);
        const archived = seedRecord.is_archived === true;
        const seededEntity: Goal = {
          ...goal,
          is_archived: archived,
          archived_at:
            archived && typeof seedRecord.archived_at === 'string'
              ? seedRecord.archived_at
              : archived
                ? seedTimestamp
                : null,
          archived_by:
            archived && typeof seedRecord.archived_by === 'string'
              ? seedRecord.archived_by
              : archived
                ? SEED_ACTOR
                : null,
          provenance: ensureProvenance(seedRecord.provenance ?? goal.provenance, SEED_ACTOR, seedTimestamp, true),
        };
        const stored = normalizeEntityForStorage(
          seededEntity as unknown as Record<string, unknown>,
          SEED_ACTOR,
          seedTimestamp,
          true
        );
        statements.push(
          db
            .prepare(INSERT_GOAL_SQL)
            .bind(
              seededEntity.id,
              stored.payloadJson,
              stored.isArchived,
              stored.archivedAt,
              stored.archivedBy,
              stored.createdAt,
              stored.createdBy,
              stored.updatedAt,
              stored.updatedBy
            )
        );
      }
    }

    if (historyCount === 0) {
      for (const seed of asSeedArray<ContentHistoryEvent>(contentHistorySeed)) {
        const event = toSeedHistoryEvent(seed);
        statements.push(
          db
            .prepare(INSERT_HISTORY_SQL)
            .bind(
              event.id,
              event.entity_type,
              event.entity_id,
              event.action,
              event.actor,
              event.timestamp,
              toHistoryJson(event.before),
              toHistoryJson(event.after)
            )
        );
      }
    }

    if (statements.length > 0) {
      await executeInBatches(db, statements);
    }
  })();

  try {
    await seedPromise;
  } catch (err) {
    seedPromise = null;
    throw err;
  }
}

async function findProjectRow(db: D1Database, id: string) {
  return await db
    .prepare(`SELECT ${SELECT_ENTITY_COLUMNS} FROM projects WHERE id = ?1`)
    .bind(id)
    .first<StoredEntityRow>();
}

async function findGoalRow(db: D1Database, id: string) {
  return await db
    .prepare(`SELECT ${SELECT_ENTITY_COLUMNS} FROM goals WHERE id = ?1`)
    .bind(id)
    .first<StoredEntityRow>();
}

export async function listProjects(event: StoreEvent, options: { includeArchived?: boolean } = {}) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived === true;
  const sql = includeArchived
    ? `SELECT ${SELECT_ENTITY_COLUMNS} FROM projects ORDER BY rowid`
    : `SELECT ${SELECT_ENTITY_COLUMNS} FROM projects WHERE is_archived = 0 ORDER BY rowid`;

  const rows = await db.prepare(sql).all<StoredEntityRow>();
  return rows.results.map((row) => rowToProject(row));
}

export async function listGoals(event: StoreEvent, options: { includeArchived?: boolean } = {}) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived === true;
  const sql = includeArchived
    ? `SELECT ${SELECT_ENTITY_COLUMNS} FROM goals ORDER BY rowid`
    : `SELECT ${SELECT_ENTITY_COLUMNS} FROM goals WHERE is_archived = 0 ORDER BY rowid`;

  const rows = await db.prepare(sql).all<StoredEntityRow>();
  return rows.results.map((row) => rowToGoal(row));
}

export async function getProjectById(
  event: StoreEvent,
  id: string,
  options: { includeArchived?: boolean } = {}
) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived !== false;
  const row = await findProjectRow(db, id);
  if (!row) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  const project = rowToProject(row);
  if (!includeArchived && project.is_archived === true) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  return project;
}

export async function getGoalById(event: StoreEvent, id: string, options: { includeArchived?: boolean } = {}) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived !== false;
  const row = await findGoalRow(db, id);
  if (!row) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  const goal = rowToGoal(row);
  if (!includeArchived && goal.is_archived === true) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  return goal;
}

export async function createProject(event: StoreEvent, input: unknown, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const candidate = toProjectCreate(input);
  const existing = await findProjectRow(db, candidate.id);
  if (existing) {
    throw new ContentStoreError(409, `project ${candidate.id} already exists`);
  }

  const timestamp = nowIso();
  const created: Project = {
    ...candidate,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    provenance: ensureProvenance(candidate.provenance, actor, timestamp, true),
  };
  const stored = normalizeEntityForStorage(created as unknown as Record<string, unknown>, actor, timestamp, true);
  const history = buildHistoryEvent({
    entityType: 'project',
    entityId: created.id,
    action: 'create',
    actor,
    timestamp,
    before: null,
    after: cloneRecord(stored.entity),
  });

  try {
    await db
      .prepare(CREATE_PROJECT_WITH_HISTORY_SQL)
      .bind(
        created.id,
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        history.id,
        actor,
        timestamp,
        toHistoryJson(history.after)
      )
      .run();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ContentStoreError(409, `project ${created.id} already exists`);
    }
    throw err;
  }

  return stored.entity as Project;
}

export async function createGoal(event: StoreEvent, input: unknown, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const candidate = toGoalCreate(input);
  const existing = await findGoalRow(db, candidate.id);
  if (existing) {
    throw new ContentStoreError(409, `goal ${candidate.id} already exists`);
  }

  const timestamp = nowIso();
  const created: Goal = {
    ...candidate,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    provenance: ensureProvenance(candidate.provenance, actor, timestamp, true),
  };
  const stored = normalizeEntityForStorage(created as unknown as Record<string, unknown>, actor, timestamp, true);
  const history = buildHistoryEvent({
    entityType: 'goal',
    entityId: created.id,
    action: 'create',
    actor,
    timestamp,
    before: null,
    after: cloneRecord(stored.entity),
  });

  try {
    await db
      .prepare(CREATE_GOAL_WITH_HISTORY_SQL)
      .bind(
        created.id,
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        history.id,
        actor,
        timestamp,
        toHistoryJson(history.after)
      )
      .run();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ContentStoreError(409, `goal ${created.id} already exists`);
    }
    throw err;
  }

  return stored.entity as Goal;
}

export async function updateProject(event: StoreEvent, id: string, patchInput: unknown, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const patch = toProjectPatch(patchInput);
  if (typeof patch.id === 'string' && patch.id !== id) {
    throw new ContentStoreError(400, 'project id in payload does not match route id');
  }

  const existing = await findProjectRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  const previous = rowToProject(existing) as unknown as Record<string, unknown>;
  const previousArchived = previous.is_archived === true;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const merged: Record<string, unknown> = {
    ...previous,
    ...patch,
    id,
  };
  merged.provenance = ensureProvenance(merged.provenance, actor, timestamp, false);
  applyArchiveFields(merged, actor, timestamp, previousArchived);

  const stored = normalizeEntityForStorage(merged, actor, timestamp, false);
  const after = cloneRecord(stored.entity);
  const history = buildHistoryEvent({
    entityType: 'project',
    entityId: id,
    action: 'update',
    actor,
    timestamp,
    before,
    after,
  });

  const runResult = await db
    .prepare(UPDATE_PROJECT_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  return stored.entity as Project;
}

export async function updateGoal(event: StoreEvent, id: string, patchInput: unknown, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const patch = toGoalPatch(patchInput);
  if (typeof patch.id === 'string' && patch.id !== id) {
    throw new ContentStoreError(400, 'goal id in payload does not match route id');
  }

  const existing = await findGoalRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  const previous = rowToGoal(existing) as unknown as Record<string, unknown>;
  const previousArchived = previous.is_archived === true;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const merged: Record<string, unknown> = {
    ...previous,
    ...patch,
    id,
  };
  merged.provenance = ensureProvenance(merged.provenance, actor, timestamp, false);
  applyArchiveFields(merged, actor, timestamp, previousArchived);

  const stored = normalizeEntityForStorage(merged, actor, timestamp, false);
  const after = cloneRecord(stored.entity);
  const history = buildHistoryEvent({
    entityType: 'goal',
    entityId: id,
    action: 'update',
    actor,
    timestamp,
    before,
    after,
  });

  const runResult = await db
    .prepare(UPDATE_GOAL_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  return stored.entity as Goal;
}

export async function archiveProject(event: StoreEvent, id: string, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const existing = await findProjectRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  const previous = rowToProject(existing) as unknown as Record<string, unknown>;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const updated: Record<string, unknown> = {
    ...previous,
    is_archived: true,
    archived_at: timestamp,
    archived_by: actor,
    provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
  };

  const stored = normalizeEntityForStorage(updated, actor, timestamp, false);
  const history = buildHistoryEvent({
    entityType: 'project',
    entityId: id,
    action: 'archive',
    actor,
    timestamp,
    before,
    after: cloneRecord(stored.entity),
  });

  const runResult = await db
    .prepare(UPDATE_PROJECT_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  return stored.entity as Project;
}

export async function restoreProject(event: StoreEvent, id: string, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const existing = await findProjectRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  const previous = rowToProject(existing) as unknown as Record<string, unknown>;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const updated: Record<string, unknown> = {
    ...previous,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
  };

  const stored = normalizeEntityForStorage(updated, actor, timestamp, false);
  const history = buildHistoryEvent({
    entityType: 'project',
    entityId: id,
    action: 'restore',
    actor,
    timestamp,
    before,
    after: cloneRecord(stored.entity),
  });

  const runResult = await db
    .prepare(UPDATE_PROJECT_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }

  return stored.entity as Project;
}

export async function archiveGoal(event: StoreEvent, id: string, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const existing = await findGoalRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  const previous = rowToGoal(existing) as unknown as Record<string, unknown>;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const updated: Record<string, unknown> = {
    ...previous,
    is_archived: true,
    archived_at: timestamp,
    archived_by: actor,
    provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
  };

  const stored = normalizeEntityForStorage(updated, actor, timestamp, false);
  const history = buildHistoryEvent({
    entityType: 'goal',
    entityId: id,
    action: 'archive',
    actor,
    timestamp,
    before,
    after: cloneRecord(stored.entity),
  });

  const runResult = await db
    .prepare(UPDATE_GOAL_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  return stored.entity as Goal;
}

export async function restoreGoal(event: StoreEvent, id: string, actor: string) {
  const db = getDb(event);
  await ensureSeeded(db);

  const existing = await findGoalRow(db, id);
  if (!existing) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  const previous = rowToGoal(existing) as unknown as Record<string, unknown>;
  const before = cloneRecord(previous);
  const timestamp = nowIso();

  const updated: Record<string, unknown> = {
    ...previous,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
  };

  const stored = normalizeEntityForStorage(updated, actor, timestamp, false);
  const history = buildHistoryEvent({
    entityType: 'goal',
    entityId: id,
    action: 'restore',
    actor,
    timestamp,
    before,
    after: cloneRecord(stored.entity),
  });

  const runResult = await db
    .prepare(UPDATE_GOAL_WITH_HISTORY_SQL)
    .bind(
      stored.payloadJson,
      stored.isArchived,
      stored.archivedAt,
      stored.archivedBy,
      stored.createdAt,
      stored.createdBy,
      stored.updatedAt,
      stored.updatedBy,
      id,
      history.id,
      history.action,
      actor,
      timestamp,
      toHistoryJson(history.before),
      toHistoryJson(history.after)
    )
    .run();

  const changes = extractRunChanges(runResult);
  if (changes === 0) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }

  return stored.entity as Goal;
}

export async function listHistory(
  event: StoreEvent,
  options: {
    entityType?: ContentEntityType;
    entityId?: string;
    limit?: number;
  } = {}
) {
  const db = getDb(event);
  await ensureSeeded(db);

  const limit = typeof options.limit === 'number' && options.limit > 0 ? Math.floor(options.limit) : 200;
  const predicates: string[] = [];
  const values: unknown[] = [];

  if (options.entityType) {
    predicates.push('entity_type = ?');
    values.push(options.entityType);
  }

  if (options.entityId) {
    predicates.push('entity_id = ?');
    values.push(options.entityId);
  }

  let sql = `
SELECT
  id,
  entity_type,
  entity_id,
  action,
  actor,
  timestamp,
  before_json,
  after_json
FROM content_history
`;
  if (predicates.length > 0) {
    sql += ` WHERE ${predicates.join(' AND ')}`;
  }
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  values.push(limit);

  const rows = await db.prepare(sql).bind(...values).all<StoredHistoryRow>();
  return rows.results.map((row) => rowToHistoryEvent(row));
}
