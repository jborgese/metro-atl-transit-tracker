import type { ContentKind, ContentRecord } from './types';

export type WriteMode = 'create' | 'update';

export interface Payload {
  body: Record<string, unknown>;
  changed: boolean;
  removedKeys: string[];
}

const SERVER_MANAGED = ['provenance', 'is_archived', 'archived_at', 'archived_by'];
const ACTION_FIELDS = ['goal_id', 'description', 'link', 'location', 'expires_on'];

function copy(record: ContentRecord): ContentRecord {
  return JSON.parse(JSON.stringify(record)) as ContentRecord;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withoutKeys(record: ContentRecord, keys: string[]): ContentRecord {
  return Object.fromEntries(Object.entries(copy(record)).filter(([key]) => !keys.includes(key)));
}

function pick(record: ContentRecord, keys: string[]): ContentRecord {
  return Object.fromEntries(Object.entries(copy(record)).filter(([key]) => keys.includes(key)));
}

function differingKeys(next: ContentRecord, loaded: ContentRecord): string[] {
  return Object.keys(next).filter((key) => !sameValue(next[key], loaded[key]));
}

function actionPayload(next: ContentRecord, loaded: ContentRecord | null): Payload {
  const body = pick(next, ACTION_FIELDS);
  const stored = loaded === null ? null : pick(loaded, ACTION_FIELDS);
  const changed =
    stored === null || ACTION_FIELDS.some((key) => !sameValue(body[key], stored[key]));
  return { body, changed, removedKeys: [] };
}

function createPayload(next: ContentRecord): Payload {
  return { body: withoutKeys(next, SERVER_MANAGED), changed: true, removedKeys: [] };
}

function updatePayload(next: ContentRecord, loaded: ContentRecord): Payload {
  const sent = withoutKeys(next, SERVER_MANAGED);
  const stored = withoutKeys(loaded, SERVER_MANAGED);
  const keys = differingKeys(sent, stored).filter((key) => key !== 'id');
  return {
    body: Object.fromEntries(keys.map((key) => [key, sent[key]])),
    changed: keys.length > 0,
    removedKeys: Object.keys(stored).filter((key) => !(key in sent)),
  };
}

export function toPayload(
  kind: ContentKind,
  mode: WriteMode,
  next: ContentRecord,
  loaded: ContentRecord | null,
): Payload {
  if (kind === 'timed_action') {
    return actionPayload(next, loaded);
  }
  if (mode === 'create' || loaded === null) {
    return createPayload(next);
  }
  return updatePayload(next, loaded);
}
