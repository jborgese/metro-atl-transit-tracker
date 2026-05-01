import { error, type RequestEvent } from '@sveltejs/kit';
import { ContentStoreError } from './store';

export const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

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

export async function readJsonBody(
  event: RequestEvent,
  maxBytes: number = DEFAULT_MAX_JSON_BYTES
): Promise<unknown> {
  const contentLength = event.request.headers.get('content-length');
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ContentStoreError(413, 'request body exceeds maximum size');
    }
  }

  const buf = new Uint8Array(await event.request.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new ContentStoreError(413, 'request body exceeds maximum size');
  }
  if (buf.byteLength === 0) {
    throw new ContentStoreError(400, 'request body is empty');
  }

  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new ContentStoreError(400, 'request body is not valid JSON');
  }
}
