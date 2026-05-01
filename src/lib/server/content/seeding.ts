import contentHistorySeed from '../../../../data/content/history.json';
import type { ContentHistoryEvent, Goal, Project } from '@/types/content';
import { ContentStoreError } from './errors';
import {
  ensureProvenance,
  nowIso,
  normalizeEntityForStorage,
  toHistoryJson,
  toSeedHistoryEvent,
  type StoredCountsRow,
} from './mappers';
import {
  D1_LOCAL_MIGRATION_CMD,
  INSERT_GOAL_SQL,
  INSERT_HISTORY_SQL,
  INSERT_PROJECT_SQL,
  executeInBatches,
  type D1Database,
  type D1PreparedStatement,
} from './repository';
import {
  asSeedArray,
  isMissingTableError,
  parseIntSafe,
  SEED_ACTOR,
  selectGoalSeeds,
  selectProjectSeeds,
  toGoalSeed,
  toProjectSeed,
} from './validators';

let seedPromise: Promise<void> | null = null;

const COUNTS_SQL = `
SELECT
  (SELECT COUNT(*) FROM projects) AS project_count,
  (SELECT COUNT(*) FROM goals) AS goal_count,
  (SELECT COUNT(*) FROM content_history) AS history_count
`;

async function readCounts(db: D1Database): Promise<StoredCountsRow | null> {
  try {
    return await db.prepare(COUNTS_SQL).first<StoredCountsRow>();
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new ContentStoreError(
        503,
        `D1 schema is missing. Apply migrations and reload: \`${D1_LOCAL_MIGRATION_CMD}\`.`
      );
    }
    throw err;
  }
}

function buildProjectSeedStatement(
  db: D1Database,
  seed: Project,
  seedTimestamp: string
): D1PreparedStatement {
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
  return db
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
    );
}

function buildGoalSeedStatement(
  db: D1Database,
  seed: Goal,
  seedTimestamp: string
): D1PreparedStatement {
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
  return db
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
    );
}

function buildHistorySeedStatement(
  db: D1Database,
  event: ContentHistoryEvent
): D1PreparedStatement {
  return db
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
    );
}

export function seedProjectsIfEmpty(db: D1Database, count: number): D1PreparedStatement[] {
  if (count > 0) return [];
  const seedTimestamp = nowIso();
  return selectProjectSeeds().map((seed) => buildProjectSeedStatement(db, seed, seedTimestamp));
}

export function seedGoalsIfEmpty(db: D1Database, count: number): D1PreparedStatement[] {
  if (count > 0) return [];
  const seedTimestamp = nowIso();
  return selectGoalSeeds().map((seed) => buildGoalSeedStatement(db, seed, seedTimestamp));
}

export function seedHistoryIfEmpty(db: D1Database, count: number): D1PreparedStatement[] {
  if (count > 0) return [];
  return asSeedArray<ContentHistoryEvent>(contentHistorySeed).map((seed) =>
    buildHistorySeedStatement(db, toSeedHistoryEvent(seed))
  );
}

export async function ensureSeeded(db: D1Database) {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const counts = await readCounts(db);
    const statements: D1PreparedStatement[] = [
      ...seedProjectsIfEmpty(db, parseIntSafe(counts?.project_count)),
      ...seedGoalsIfEmpty(db, parseIntSafe(counts?.goal_count)),
      ...seedHistoryIfEmpty(db, parseIntSafe(counts?.history_count)),
    ];

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
