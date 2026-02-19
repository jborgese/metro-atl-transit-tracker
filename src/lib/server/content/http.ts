import { error } from '@sveltejs/kit';
import { ContentStoreError } from './store';

export function parseIncludeArchived(value: string | null) {
  if (!value) {
    return false;
  }
  return value === 'true' || value === '1';
}

export function parseLimit(value: string | null, fallback = 200) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function toHttpError(err: unknown): never {
  if (err instanceof ContentStoreError) {
    throw error(err.status, err.message);
  }
  throw err;
}
