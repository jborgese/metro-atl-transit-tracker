import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { consumeWriteLimit, parsePositiveInt } from './hooks.server';

function makeEvent(ip: string, opts: { path?: string; method?: string } = {}): RequestEvent {
  const url = new URL(`http://example.test${opts.path ?? '/api/projects'}`);
  return {
    url,
    request: new Request(url, {
      method: opts.method ?? 'POST',
      headers: { 'cf-connecting-ip': ip },
    }),
    cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
    getClientAddress: () => ip,
  } as unknown as RequestEvent;
}

describe('parsePositiveInt', () => {
  it('returns the fallback when value is undefined', () => {
    expect(parsePositiveInt(undefined, 30)).toBe(30);
  });

  it('parses positive integers', () => {
    expect(parsePositiveInt('5', 30)).toBe(5);
    expect(parsePositiveInt('999', 30)).toBe(999);
  });

  it('returns the fallback for zero, negative, or non-numeric input', () => {
    expect(parsePositiveInt('0', 30)).toBe(30);
    expect(parsePositiveInt('-5', 30)).toBe(30);
    expect(parsePositiveInt('abc', 30)).toBe(30);
    expect(parsePositiveInt('', 30)).toBe(30);
  });
});

describe('consumeWriteLimit', () => {
  // Each test uses a unique IP so module-scope buckets don't carry over.
  it('allows the first request and reports remaining = max - 1', () => {
    const event = makeEvent('10.0.0.1');
    const result = consumeWriteLimit(event, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetSeconds).toBeGreaterThan(0);
    expect(result.resetSeconds).toBeLessThanOrEqual(60);
  });

  it('decrements remaining on each consume within the window', () => {
    const event = makeEvent('10.0.0.2');
    const a = consumeWriteLimit(event, 3, 60);
    const b = consumeWriteLimit(event, 3, 60);
    const c = consumeWriteLimit(event, 3, 60);
    expect([a.remaining, b.remaining, c.remaining]).toEqual([2, 1, 0]);
    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, true]);
  });

  it('rejects requests after the limit is exhausted', () => {
    const event = makeEvent('10.0.0.3');
    consumeWriteLimit(event, 2, 60);
    consumeWriteLimit(event, 2, 60);
    const denied = consumeWriteLimit(event, 2, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('keys buckets by client IP', () => {
    const a = consumeWriteLimit(makeEvent('10.0.0.4'), 2, 60);
    const b = consumeWriteLimit(makeEvent('10.0.0.5'), 2, 60);
    expect(a.remaining).toBe(1);
    expect(b.remaining).toBe(1); // different IP — fresh bucket
  });

  it('falls back to x-forwarded-for when cf-connecting-ip is absent', () => {
    const url = new URL('http://example.test/api/projects');
    const event = {
      url,
      request: new Request(url, {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.0.0.6, 192.168.1.1' },
      }),
      cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
      getClientAddress: () => 'ignored',
    } as unknown as RequestEvent;
    const result = consumeWriteLimit(event, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });
});
