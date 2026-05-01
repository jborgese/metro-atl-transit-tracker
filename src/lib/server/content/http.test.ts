import { describe, expect, it } from 'vitest';
import { parseIncludeArchived, parseLimit, toHttpError } from './http';
import { ContentStoreError } from './store';

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
