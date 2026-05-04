import { randomUUID } from 'node:crypto';
import type {
  ContentEntityType,
  ContentHistoryEvent,
  Goal,
  Project,
} from '@/types/content';
import { ContentStoreError } from './errors';
import { parseIntSafe, SEED_ACTOR } from './validators';

export type StoreEvent = {
  platform?: {
    env?: Record<string, unknown>;
  };
};

export type StoredEntityRow = {
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

export type StoredHistoryRow = {
  id: string;
  entity_type: ContentEntityType;
  entity_id: string;
  action: ContentHistoryEvent['action'];
  actor: string;
  timestamp: string;
  before_json: string | null;
  after_json: string | null;
};

export type StoredCountsRow = {
  project_count: number | string | null;
  goal_count: number | string | null;
  history_count: number | string | null;
};

export type StoredEntityWrite = {
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

export function nowIso() {
  return new Date().toISOString();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return structuredClone(value);
}

export function parseJsonObject(raw: string, label: string): Record<string, unknown> {
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

export function ensureProvenance(
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

export function applyArchiveFields(
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

export function normalizeEntityForStorage(
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

export function rowToProject(row: StoredEntityRow): Project {
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

export function rowToGoal(row: StoredEntityRow): Goal {
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

export function rowToHistoryEvent(row: StoredHistoryRow): ContentHistoryEvent {
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

export function toHistoryJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value) : null;
}

export function buildHistoryEvent(params: {
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

export function toSeedHistoryEvent(input: unknown): ContentHistoryEvent {
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

export function resolveActorDisplay(
  actor: string | null | undefined,
  profiles: Map<string, string>
): string | null | undefined {
  if (typeof actor !== 'string' || actor.trim().length === 0) {
    return actor;
  }
  if (profiles.size === 0) {
    return actor;
  }
  const key = actor.trim().toLowerCase();
  return profiles.get(key) ?? actor;
}

const PROVENANCE_ACTOR_FIELDS = ['created_by', 'updated_by'] as const;

export function applyProfileMapToEntity<T extends Record<string, unknown>>(
  entity: T,
  profiles: Map<string, string>
): T {
  if (profiles.size === 0) {
    return entity;
  }
  const target = entity as Record<string, unknown>;
  if (typeof target.archived_by === 'string') {
    const resolved = resolveActorDisplay(target.archived_by, profiles);
    if (typeof resolved === 'string') {
      target.archived_by = resolved;
    }
  }
  const provenance = target.provenance;
  if (isRecord(provenance)) {
    for (const field of PROVENANCE_ACTOR_FIELDS) {
      const current = provenance[field];
      if (typeof current === 'string') {
        const resolved = resolveActorDisplay(current, profiles);
        if (typeof resolved === 'string') {
          provenance[field] = resolved;
        }
      }
    }
  }
  return entity;
}

export function applyProfileMapToHistoryEvent(
  event: ContentHistoryEvent,
  profiles: Map<string, string>
): ContentHistoryEvent {
  if (profiles.size === 0) {
    return event;
  }
  const resolvedActor = resolveActorDisplay(event.actor, profiles);
  if (typeof resolvedActor === 'string') {
    event.actor = resolvedActor;
  }
  if (isRecord(event.before)) {
    applyProfileMapToEntity(event.before, profiles);
  }
  if (isRecord(event.after)) {
    applyProfileMapToEntity(event.after, profiles);
  }
  return event;
}

export function extractRunChanges(result: unknown): number | null {
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
