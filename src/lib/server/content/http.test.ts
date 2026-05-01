import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { DEFAULT_MAX_JSON_BYTES, parseIncludeArchived, parseLimit, readJsonBody, toHttpError } from './http';
import { ContentStoreError } from './store';

function makeJsonEvent(body: string | null, init: { contentLength?: number } = {}): RequestEvent {
  const headers: Record<string, string> = {};
  if (init.contentLength !== undefined) {
    headers['content-length'] = String(init.contentLength);
  }
  return {
    request: new Request('http://example.test/api/projects', {
      method: 'POST',
      headers,
      body,
    }),
  } as unknown as RequestEvent;
}

describe('parseIncludeArchived', () => {
  it('returns false when value is null or empty', () => {
    expect(parseIncludeArchived(null)).toBe(false);
    expect(parseIncludeArchived('')).toBe(false);
  });

  it('returns true for "true" or "1"', () => {
    expect(parseIncludeArchived('true')).toBe(true);
    expect(parseIncludeArchived('1')).toBe(true);
  });

  it('returns false for any other value', () => {
    expect(parseIncludeArchived('false')).toBe(false);
    expect(parseIncludeArchived('0')).toBe(false);
    expect(parseIncludeArchived('yes')).toBe(false);
    expect(parseIncludeArchived('TRUE')).toBe(false); // case sensitive
  });
});

describe('parseLimit', () => {
  it('returns the fallback when value is null or empty', () => {
    expect(parseLimit(null)).toBe(200);
    expect(parseLimit('')).toBe(200);
    expect(parseLimit(null, 50)).toBe(50);
  });

  it('parses positive integers', () => {
    expect(parseLimit('25')).toBe(25);
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('999')).toBe(999);
  });

  it('returns the fallback for non-positive values', () => {
    expect(parseLimit('0')).toBe(200);
    expect(parseLimit('-5')).toBe(200);
    expect(parseLimit('-5', 100)).toBe(100);
  });

  it('returns the fallback for non-numeric values', () => {
    expect(parseLimit('abc')).toBe(200);
    expect(parseLimit('NaN')).toBe(200);
  });

  it('truncates fractional inputs via parseInt', () => {
    expect(parseLimit('25.7')).toBe(25);
  });
});

describe('toHttpError', () => {
  it('rethrows a ContentStoreError as a SvelteKit HttpError with status', () => {
    const sourceErr = new ContentStoreError(404, 'project xyz not found');
    let caught: unknown;
    try {
      toHttpError(sourceErr);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    // SvelteKit's `error()` returns an object with `status` and `body.message`.
    const httpErr = caught as { status?: number; body?: { message?: string } };
    expect(httpErr.status).toBe(404);
    expect(httpErr.body?.message).toBe('project xyz not found');
  });

  it('rethrows non-ContentStoreError errors unchanged', () => {
    const plain = new Error('boom');
    expect(() => toHttpError(plain)).toThrow(plain);
  });

  it('rethrows non-Error values unchanged', () => {
    expect(() => toHttpError('not-an-error')).toThrow();
  });
});

describe('readJsonBody', () => {
  it('parses a valid JSON body within the size limit', async () => {
    const event = makeJsonEvent(JSON.stringify({ id: 'a', title: 'b' }));
    const parsed = await readJsonBody(event);
    expect(parsed).toEqual({ id: 'a', title: 'b' });
  });

  it('throws ContentStoreError(413) when the body exceeds maxBytes', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(2048) });
    let caught: unknown;
    try {
      await readJsonBody(makeJsonEvent(big), 1024);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContentStoreError);
    expect((caught as ContentStoreError).status).toBe(413);
  });

  it('throws ContentStoreError(413) when content-length declares too large', async () => {
    const event = makeJsonEvent(JSON.stringify({ id: 'a' }), { contentLength: 999_999 });
    let caught: unknown;
    try {
      await readJsonBody(event, 1024);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContentStoreError);
    expect((caught as ContentStoreError).status).toBe(413);
  });

  it('throws ContentStoreError(400) on empty body', async () => {
    const event = makeJsonEvent('');
    let caught: unknown;
    try {
      await readJsonBody(event);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContentStoreError);
    expect((caught as ContentStoreError).status).toBe(400);
    expect((caught as ContentStoreError).message).toMatch(/empty/i);
  });

  it('throws ContentStoreError(400) on malformed JSON', async () => {
    const event = makeJsonEvent('{ not: json }');
    let caught: unknown;
    try {
      await readJsonBody(event);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContentStoreError);
    expect((caught as ContentStoreError).status).toBe(400);
    expect((caught as ContentStoreError).message).toMatch(/valid JSON/i);
  });

  it('uses DEFAULT_MAX_JSON_BYTES when no explicit limit is passed', async () => {
    const small = JSON.stringify({ id: 'a' });
    expect(small.length).toBeLessThan(DEFAULT_MAX_JSON_BYTES);
    const parsed = await readJsonBody(makeJsonEvent(small));
    expect(parsed).toEqual({ id: 'a' });
  });
});
