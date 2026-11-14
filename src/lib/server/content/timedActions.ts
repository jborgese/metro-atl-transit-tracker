import type { TimedAction } from '#types/content.ts';
import { createLogger } from '#utils/logger.ts';
import { atlantaDate } from '#utils/timedActions.ts';
import { ContentStoreError } from './errors';
import {
  applyProfileMapToEntity,
  buildHistoryEvent,
  cloneRecord,
  ensureProvenance,
  extractRunChanges,
  normalizeEntityForStorage,
  nowIso,
  rowToTimedAction,
  toHistoryJson,
  type StoredEntityRow,
  type StoredEntityWrite,
} from './mappers';
import { loadProfileMap } from './profiles';
import {
  ARCHIVE_TIMED_ACTION_SQL,
  INSERT_HISTORY_SQL,
  INSERT_TIMED_ACTION_ARCHIVE_EVENT_SQL,
  INSERT_TIMED_ACTION_SQL,
  SELECT_ALL_TIMED_ACTIONS_SQL,
  SELECT_EXPIRED_TIMED_ACTIONS_SQL,
  SELECT_LIVE_TIMED_ACTIONS_SQL,
  UPDATE_TIMED_ACTION_CONTENT_SQL,
  UPDATE_TIMED_ACTION_SQL,
  findGoalRow,
  findTimedActionRow,
  getDb,
  type D1Database,
  type D1PreparedStatement,
} from './repository';
import { ensureSeeded } from './seeding';
import {
  generateTimedActionId,
  isUniqueConstraintError,
  parseIntSafe,
  toTimedActionCreate,
  toTimedActionReplace,
  type TimedActionInput,
} from './validators';

export const SYSTEM_ACTOR = 'system';
const SWEEP_CHUNK_SIZE = 25;

const log = createLogger('TimedActions');

type GoalState = 'active' | 'archived' | 'missing';

type TimedActionWrite = {
  previous: TimedAction;
  next: TimedAction;
  action: 'update' | 'restore';
  actor: string;
  timestamp: string;
  writeRow: (stored: StoredEntityWrite) => D1PreparedStatement;
};

export function isMissingTimedActionsTable(err: unknown): boolean {
  return (
    err instanceof Error &&
    !(err instanceof ContentStoreError) &&
    /no such table: timed_actions/i.test(err.message)
  );
}

function notFound(id: string): ContentStoreError {
  return new ContentStoreError(404, `timed action ${id} not found`);
}

async function withTimedActionsTable<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isMissingTimedActionsTable(err)) {
      throw new ContentStoreError(503, 'timed actions are not available yet');
    }
    throw err;
  }
}

function withDisplayNames(action: TimedAction, profiles: Map<string, string>): TimedAction {
  return applyProfileMapToEntity({ ...action }, profiles);
}

async function openSweptDatabase(): Promise<D1Database> {
  const db = getDb();
  await ensureSeeded(db);
  await sweepExpiredTimedActions(db);
  return db;
}

async function readGoalState(db: D1Database, goalId: string): Promise<GoalState> {
  const goal = await findGoalRow(db, goalId);
  if (!goal) {
    return 'missing';
  }
  return parseIntSafe(goal.is_archived) === 1 ? 'archived' : 'active';
}

async function assertGoalAcceptsActions(db: D1Database, goalId: string) {
  const state = await readGoalState(db, goalId);
  if (state === 'missing') {
    throw new ContentStoreError(400, 'timed action validation failed - goal_id: goal not found');
  }
  if (state === 'archived') {
    throw new ContentStoreError(400, 'timed action validation failed - goal_id: goal is archived');
  }
}

async function requireTimedAction(db: D1Database, id: string): Promise<TimedAction> {
  const row = await findTimedActionRow(db, id);
  if (!row) {
    throw notFound(id);
  }
  return rowToTimedAction(row);
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function archiveStatements(
  db: D1Database,
  previous: TimedAction,
  actor: string,
  timestamp: string,
  expiredBefore: string | null,
) {
  const stored = normalizeEntityForStorage(
    {
      ...previous,
      is_archived: true,
      archived_at: timestamp,
      archived_by: actor,
      provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
    },
    actor,
    timestamp,
    false,
  );
  const history = buildHistoryEvent({
    entityType: 'timed_action',
    entityId: previous.id,
    action: 'archive',
    actor,
    timestamp,
    before: cloneRecord({ ...previous }),
    after: cloneRecord(stored.entity),
  });

  const statements = [
    db
      .prepare(INSERT_TIMED_ACTION_ARCHIVE_EVENT_SQL)
      .bind(
        history.id,
        previous.id,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after),
        expiredBefore,
      ),
    db
      .prepare(ARCHIVE_TIMED_ACTION_SQL)
      .bind(
        stored.payloadJson,
        stored.archivedAt,
        stored.archivedBy,
        stored.updatedAt,
        stored.updatedBy,
        previous.id,
        expiredBefore,
      ),
  ];
  return { statements, archived: stored.entity as unknown as TimedAction };
}

async function writeArchive(
  db: D1Database,
  previous: TimedAction,
  actor: string,
  timestamp: string,
): Promise<TimedAction | null> {
  const { statements, archived } = archiveStatements(db, previous, actor, timestamp, null);
  const results = await db.batch(statements);
  return extractRunChanges(results[1]) === 1 ? archived : null;
}

async function archiveExpiredChunk(
  db: D1Database,
  actions: TimedAction[],
  timestamp: string,
  today: string,
): Promise<number> {
  const results = await db.batch(
    actions.flatMap(
      (action) => archiveStatements(db, action, SYSTEM_ACTOR, timestamp, today).statements,
    ),
  );
  return results.filter((result, index) => index % 2 === 1 && extractRunChanges(result) === 1)
    .length;
}

async function writeTimedAction(db: D1Database, change: TimedActionWrite): Promise<TimedAction> {
  const { previous, next, action, actor, timestamp, writeRow } = change;
  const stored = normalizeEntityForStorage({ ...next }, actor, timestamp, false);
  const history = buildHistoryEvent({
    entityType: 'timed_action',
    entityId: previous.id,
    action,
    actor,
    timestamp,
    before: cloneRecord({ ...previous }),
    after: cloneRecord(stored.entity),
  });

  const results = await db.batch([
    writeRow(stored),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'timed_action',
        previous.id,
        history.action,
        actor,
        timestamp,
        toHistoryJson(history.before),
        toHistoryJson(history.after),
      ),
  ]);

  if (extractRunChanges(results[0]) === 0) {
    throw notFound(previous.id);
  }
  return stored.entity as unknown as TimedAction;
}

async function insertTimedAction(
  db: D1Database,
  input: TimedActionInput,
  actor: string,
): Promise<TimedAction> {
  const id = generateTimedActionId();
  const timestamp = nowIso();
  const stored = normalizeEntityForStorage(
    {
      id,
      ...input,
      is_archived: false,
      archived_at: null,
      archived_by: null,
      provenance: ensureProvenance(undefined, actor, timestamp, true),
    },
    actor,
    timestamp,
    true,
  );
  const history = buildHistoryEvent({
    entityType: 'timed_action',
    entityId: id,
    action: 'create',
    actor,
    timestamp,
    before: null,
    after: cloneRecord(stored.entity),
  });

  await db.batch([
    db
      .prepare(INSERT_TIMED_ACTION_SQL)
      .bind(
        id,
        stored.payloadJson,
        stored.isArchived,
        stored.archivedAt,
        stored.archivedBy,
        stored.createdAt,
        stored.createdBy,
        stored.updatedAt,
        stored.updatedBy,
      ),
    db
      .prepare(INSERT_HISTORY_SQL)
      .bind(
        history.id,
        'timed_action',
        id,
        history.action,
        actor,
        timestamp,
        null,
        toHistoryJson(history.after),
      ),
  ]);

  return stored.entity as unknown as TimedAction;
}

async function selectLiveRows(db: D1Database) {
  return await db
    .prepare(SELECT_LIVE_TIMED_ACTIONS_SQL)
    .bind(atlantaDate(new Date()))
    .all<StoredEntityRow>();
}

async function selectAllRowsAfterSweep(db: D1Database) {
  await sweepExpiredTimedActions(db);
  return await db.prepare(SELECT_ALL_TIMED_ACTIONS_SQL).all<StoredEntityRow>();
}

export async function sweepExpiredTimedActions(
  db: D1Database,
  now: Date = new Date(),
): Promise<number> {
  try {
    const today = atlantaDate(now);
    const rows = await db
      .prepare(SELECT_EXPIRED_TIMED_ACTIONS_SQL)
      .bind(today)
      .all<StoredEntityRow>();
    const expired = rows.results.map(rowToTimedAction);
    const timestamp = now.toISOString();
    const chunks = chunk(expired, SWEEP_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunks.map((actions) => archiveExpiredChunk(db, actions, timestamp, today)),
    );
    return results.reduce((total, result, index) => {
      if (result.status === 'rejected') {
        const ids = (chunks[index] ?? []).map((action) => action.id).join(', ');
        log.error(`timed action sweep could not archive ${ids}`, result.reason);
        return total;
      }
      return total + result.value;
    }, 0);
  } catch (err) {
    log.error('timed action sweep failed', err);
    return 0;
  }
}

export async function listTimedActions(
  options: { includeArchived?: boolean } = {},
): Promise<TimedAction[]> {
  const db = getDb();
  await ensureSeeded(db);

  try {
    const [rows, profiles] = await Promise.all([
      options.includeArchived === true ? selectAllRowsAfterSweep(db) : selectLiveRows(db),
      loadProfileMap(),
    ]);
    return rows.results.map((row) => withDisplayNames(rowToTimedAction(row), profiles));
  } catch (err) {
    if (isMissingTimedActionsTable(err)) {
      return [];
    }
    throw err;
  }
}

export async function getTimedActionById(
  id: string,
  options: { includeArchived?: boolean } = {},
): Promise<TimedAction> {
  const db = await openSweptDatabase();

  try {
    const action = await requireTimedAction(db, id);
    if (options.includeArchived === false && action.is_archived === true) {
      throw notFound(id);
    }
    return withDisplayNames(action, await loadProfileMap());
  } catch (err) {
    if (isMissingTimedActionsTable(err)) {
      throw notFound(id);
    }
    throw err;
  }
}

export async function createTimedAction(input: unknown, actor: string): Promise<TimedAction> {
  return await withTimedActionsTable(async () => {
    const db = await openSweptDatabase();
    const candidate = toTimedActionCreate(input, atlantaDate(new Date()));
    await assertGoalAcceptsActions(db, candidate.goal_id);

    const created = await insertTimedAction(db, candidate, actor).catch((err: unknown) => {
      if (isUniqueConstraintError(err)) {
        return insertTimedAction(db, candidate, actor);
      }
      throw err;
    });
    return withDisplayNames(created, await loadProfileMap());
  });
}

export async function updateTimedAction(
  id: string,
  input: unknown,
  actor: string,
): Promise<TimedAction> {
  return await withTimedActionsTable(async () => {
    const db = await openSweptDatabase();
    const previous = await requireTimedAction(db, id);
    const replacement = toTimedActionReplace(
      input,
      id,
      previous.expires_on,
      atlantaDate(new Date()),
    );
    if (replacement.goal_id !== previous.goal_id) {
      await assertGoalAcceptsActions(db, replacement.goal_id);
    }

    const timestamp = nowIso();
    const updated = await writeTimedAction(db, {
      previous,
      next: {
        id,
        ...replacement,
        is_archived: previous.is_archived === true,
        archived_at: previous.archived_at ?? null,
        archived_by: previous.archived_by ?? null,
        provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
      },
      action: 'update',
      actor,
      timestamp,
      writeRow: (stored) =>
        db
          .prepare(UPDATE_TIMED_ACTION_CONTENT_SQL)
          .bind(stored.payloadJson, stored.updatedAt, stored.updatedBy, id),
    });
    return withDisplayNames(updated, await loadProfileMap());
  });
}

export async function archiveTimedAction(id: string, actor: string): Promise<TimedAction> {
  return await withTimedActionsTable(async () => {
    const db = await openSweptDatabase();
    const previous = await requireTimedAction(db, id);
    const current =
      previous.is_archived === true
        ? previous
        : ((await writeArchive(db, previous, actor, nowIso())) ??
          (await requireTimedAction(db, id)));
    return withDisplayNames(current, await loadProfileMap());
  });
}

export async function restoreTimedAction(id: string, actor: string): Promise<TimedAction> {
  return await withTimedActionsTable(async () => {
    const db = await openSweptDatabase();
    const previous = await requireTimedAction(db, id);
    if (previous.expires_on < atlantaDate(new Date())) {
      throw new ContentStoreError(
        409,
        'last day has passed; set a new expires_on, save, then restore',
      );
    }
    if ((await readGoalState(db, previous.goal_id)) !== 'active') {
      throw new ContentStoreError(409, 'its goal is archived or missing');
    }
    if (previous.is_archived !== true) {
      return withDisplayNames(previous, await loadProfileMap());
    }

    const timestamp = nowIso();
    const restored = await writeTimedAction(db, {
      previous,
      next: {
        ...previous,
        is_archived: false,
        archived_at: null,
        archived_by: null,
        provenance: ensureProvenance(previous.provenance, actor, timestamp, false),
      },
      action: 'restore',
      actor,
      timestamp,
      writeRow: (stored) =>
        db
          .prepare(UPDATE_TIMED_ACTION_SQL)
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
          ),
    });
    return withDisplayNames(restored, await loadProfileMap());
  });
}
