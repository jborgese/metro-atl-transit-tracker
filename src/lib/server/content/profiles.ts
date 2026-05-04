import { ContentStoreError } from './errors';
import { nowIso, type StoreEvent } from './mappers';
import { getDb } from './repository';

export type UserProfile = {
  identity: string;
  display_name: string;
  updated_at: string;
};

type StoredProfileRow = {
  identity: string;
  display_name: string;
  updated_at: string;
};

const DISPLAY_NAME_MAX_LENGTH = 64;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;

export function normalizeIdentity(identity: string): string {
  return identity.trim().toLowerCase();
}

function validateDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    throw new ContentStoreError(400, 'display_name must not be empty');
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new ContentStoreError(
      400,
      `display_name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`
    );
  }
  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new ContentStoreError(400, 'display_name must not contain control characters');
  }
  return trimmed;
}

function rowToProfile(row: StoredProfileRow): UserProfile {
  return {
    identity: row.identity,
    display_name: row.display_name,
    updated_at: row.updated_at,
  };
}

export async function getProfile(event: StoreEvent, identity: string): Promise<UserProfile | null> {
  const db = getDb(event);
  const key = normalizeIdentity(identity);
  if (!key) {
    return null;
  }
  try {
    const row = await db
      .prepare('SELECT identity, display_name, updated_at FROM user_profiles WHERE identity = ?1')
      .bind(key)
      .first<StoredProfileRow>();
    return row ? rowToProfile(row) : null;
  } catch (err) {
    if (isMissingTableError(err)) {
      return null;
    }
    throw err;
  }
}

export async function upsertProfile(
  event: StoreEvent,
  identity: string,
  displayName: string
): Promise<UserProfile> {
  const key = normalizeIdentity(identity);
  if (!key) {
    throw new ContentStoreError(400, 'identity must not be empty');
  }
  const validated = validateDisplayName(displayName);
  const timestamp = nowIso();
  const db = getDb(event);
  try {
    await db
      .prepare(
        `INSERT INTO user_profiles (identity, display_name, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(identity) DO UPDATE SET
           display_name = excluded.display_name,
           updated_at = excluded.updated_at`
      )
      .bind(key, validated, timestamp)
      .run();
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new ContentStoreError(
        503,
        'user profile storage is not provisioned (run migration 0002)'
      );
    }
    throw err;
  }
  return { identity: key, display_name: validated, updated_at: timestamp };
}

export async function deleteProfile(event: StoreEvent, identity: string): Promise<void> {
  const key = normalizeIdentity(identity);
  if (!key) {
    return;
  }
  const db = getDb(event);
  try {
    await db.prepare('DELETE FROM user_profiles WHERE identity = ?1').bind(key).run();
  } catch (err) {
    if (isMissingTableError(err)) {
      return;
    }
    throw err;
  }
}

export async function loadProfileMap(event: StoreEvent): Promise<Map<string, string>> {
  const db = getDb(event);
  try {
    const rows = await db
      .prepare('SELECT identity, display_name FROM user_profiles')
      .all<{ identity: string; display_name: string }>();
    const map = new Map<string, string>();
    for (const row of rows.results) {
      if (row.identity && row.display_name) {
        map.set(row.identity, row.display_name);
      }
    }
    return map;
  } catch (err) {
    // If the table is missing (e.g. a stale local D1 without migration 0002),
    // degrade gracefully to "no overrides" rather than 500-ing every read path.
    if (isMissingTableError(err)) {
      return new Map();
    }
    throw err;
  }
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /no such table:\s*user_profiles/i.test(message);
}
