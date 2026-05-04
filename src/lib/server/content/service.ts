import type {
  ContentEntityType,
  Goal,
  Project,
} from '@/types/content';
import { ContentStoreError } from './errors';
import {
  applyProfileMapToEntity,
  applyProfileMapToHistoryEvent,
  buildHistoryEvent,
  cloneRecord,
  ensureProvenance,
  applyArchiveFields,
  extractRunChanges,
  normalizeEntityForStorage,
  nowIso,
  rowToGoal,
  rowToHistoryEvent,
  rowToProject,
  toHistoryJson,
  type StoredEntityRow,
  type StoredHistoryRow,
  type StoreEvent,
} from './mappers';
import { loadProfileMap } from './profiles';
import {
  INSERT_GOAL_SQL,
  INSERT_HISTORY_SQL,
  INSERT_PROJECT_SQL,
  SELECT_ENTITY_COLUMNS,
  UPDATE_GOAL_SQL,
  UPDATE_PROJECT_SQL,
  findGoalRow,
  findProjectRow,
  getDb,
} from './repository';
import { ensureSeeded } from './seeding';
import {
  isUniqueConstraintError,
  toGoalCreate,
  toGoalPatch,
  toProjectCreate,
  toProjectPatch,
} from './validators';

export async function listProjects(event: StoreEvent, options: { includeArchived?: boolean } = {}) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived === true;
  const sql = includeArchived
    ? `SELECT ${SELECT_ENTITY_COLUMNS} FROM projects ORDER BY rowid`
    : `SELECT ${SELECT_ENTITY_COLUMNS} FROM projects WHERE is_archived = 0 ORDER BY rowid`;

  const [rows, profiles] = await Promise.all([
    db.prepare(sql).all<StoredEntityRow>(),
    loadProfileMap(event),
  ]);
  return rows.results.map((row) => applyProfileMapToEntity(rowToProject(row) as Record<string, unknown>, profiles)) as ReturnType<typeof rowToProject>[];
}

export async function listGoals(event: StoreEvent, options: { includeArchived?: boolean } = {}) {
  const db = getDb(event);
  await ensureSeeded(db);

  const includeArchived = options.includeArchived === true;
  const sql = includeArchived
    ? `SELECT ${SELECT_ENTITY_COLUMNS} FROM goals ORDER BY rowid`
    : `SELECT ${SELECT_ENTITY_COLUMNS} FROM goals WHERE is_archived = 0 ORDER BY rowid`;

  const [rows, profiles] = await Promise.all([
    db.prepare(sql).all<StoredEntityRow>(),
    loadProfileMap(event),
  ]);
  return rows.results.map((row) => applyProfileMapToEntity(rowToGoal(row) as Record<string, unknown>, profiles)) as ReturnType<typeof rowToGoal>[];
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

  const profiles = await loadProfileMap(event);
  applyProfileMapToEntity(project as unknown as Record<string, unknown>, profiles);
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

  const profiles = await loadProfileMap(event);
  applyProfileMapToEntity(goal as unknown as Record<string, unknown>, profiles);
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
    await db.batch([
      db
        .prepare(INSERT_PROJECT_SQL)
        .bind(
          created.id,
          stored.payloadJson,
          stored.isArchived,
          stored.archivedAt,
          stored.archivedBy,
          stored.createdAt,
          stored.createdBy,
          stored.updatedAt,
          stored.updatedBy
        ),
      db
        .prepare(INSERT_HISTORY_SQL)
        .bind(
          history.id,
          'project',
          created.id,
          history.action,
          actor,
          timestamp,
          null,
          toHistoryJson(history.after)
        ),
    ]);
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
    await db.batch([
      db
        .prepare(INSERT_GOAL_SQL)
        .bind(
          created.id,
          stored.payloadJson,
          stored.isArchived,
          stored.archivedAt,
          stored.archivedBy,
          stored.createdAt,
          stored.createdBy,
          stored.updatedAt,
          stored.updatedBy
        ),
      db
        .prepare(INSERT_HISTORY_SQL)
        .bind(
          history.id,
          'goal',
          created.id,
          history.action,
          actor,
          timestamp,
          null,
          toHistoryJson(history.after)
        ),
    ]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_PROJECT_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'project',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_GOAL_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'goal',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_PROJECT_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'project',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_PROJECT_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'project',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_GOAL_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'goal',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const results = await db.batch([
    db
      .prepare(UPDATE_GOAL_SQL)
      .bind(
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
        id
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'goal',
        id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after)
      ),
  ]);

  const changes = extractRunChanges(results[0]);
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

  const [rows, profiles] = await Promise.all([
    db.prepare(sql).bind(...values).all<StoredHistoryRow>(),
    loadProfileMap(event),
  ]);
  return rows.results.map((row) => applyProfileMapToHistoryEvent(rowToHistoryEvent(row), profiles));
}
