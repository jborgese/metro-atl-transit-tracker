import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { checkWriteRateLimit, getClientKey, type WriteRateLimit } from './hooks.server';

function makeEvent(headers: Record<string, string>): RequestEvent {
  const url = new URL('http://example.test/api/projects');
  return {
    url,
    request: new Request(url, { method: 'POST', headers }),
    cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
    getClientAddress: () => 'fallback-address',
  } as unknown as RequestEvent;
}

describe('getClientKey', () => {
  it('prefers cf-connecting-ip when present', () => {
    expect(getClientKey(makeEvent({ 'cf-connecting-ip': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('falls back to the first x-forwarded-for entry', () => {
    expect(getClientKey(makeEvent({ 'x-forwarded-for': '10.0.0.6, 192.168.1.1' }))).toBe('10.0.0.6');
  });

  it('falls back to event.getClientAddress() when no relevant headers are present', () => {
    expect(getClientKey(makeEvent({}))).toBe('fallback-address');
  });

  it('trims surrounding whitespace from cf-connecting-ip', () => {
    expect(getClientKey(makeEvent({ 'cf-connecting-ip': '  10.0.0.2  ' }))).toBe('10.0.0.2');
  });

  it('returns "unknown" if the fallback throws', () => {
    const url = new URL('http://example.test/api/projects');
    const event = {
      url,
      request: new Request(url, { method: 'POST' }),
      cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
      getClientAddress: () => {
        throw new Error('no address');
      },
    } as unknown as RequestEvent;
    expect(getClientKey(event)).toBe('unknown');
  });

  it('returns "unknown" if the fallback returns null', () => {
    // The SvelteKit Cloudflare adapter returns cf-connecting-ip directly,
    // which is null under wrangler dev. Must not propagate to the rate limiter.
    const url = new URL('http://example.test/api/projects');
    const event = {
      url,
      request: new Request(url, { method: 'POST' }),
      cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
      getClientAddress: () => null as unknown as string,
    } as unknown as RequestEvent;
    expect(getClientKey(event)).toBe('unknown');
  });

  it('returns "unknown" if the fallback returns an empty string', () => {
    const url = new URL('http://example.test/api/projects');
    const event = {
      url,
      request: new Request(url, { method: 'POST' }),
      cookies: { get: () => undefined } as unknown as RequestEvent['cookies'],
      getClientAddress: () => '   ',
    } as unknown as RequestEvent;
    expect(getClientKey(event)).toBe('unknown');
  });
});

describe('checkWriteRateLimit', () => {
  it('fails open when the binding is undefined', async () => {
    const result = await checkWriteRateLimit(undefined, '10.0.0.1');
    expect(result.allowed).toBe(true);
  });

  it('returns allowed: true when the binding reports success', async () => {
    const binding: WriteRateLimit = {
      limit: async () => ({ success: true }),
    };
    expect(await checkWriteRateLimit(binding, '10.0.0.1')).toEqual({ allowed: true });
  });

  it('returns allowed: false when the binding reports failure', async () => {
    const binding: WriteRateLimit = {
      limit: async () => ({ success: false }),
    };
    expect(await checkWriteRateLimit(binding, '10.0.0.1')).toEqual({ allowed: false });
  });

  it('passes the provided key through to the binding', async () => {
    let capturedKey: string | undefined;
    const binding: WriteRateLimit = {
      limit: async ({ key }) => {
        capturedKey = key;
        return { success: true };
      },
    };
    await checkWriteRateLimit(binding, '203.0.113.7');
    expect(capturedKey).toBe('203.0.113.7');
  });

  it('treats a missing success field as denied', async () => {
    const binding = {
      limit: async () => ({}) as unknown as { success: boolean },
    } as WriteRateLimit;
    expect(await checkWriteRateLimit(binding, '10.0.0.1')).toEqual({ allowed: false });
  });
});
