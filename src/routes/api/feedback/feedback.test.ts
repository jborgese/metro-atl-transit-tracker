import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const sendFeedbackEmail = vi.hoisted(() => vi.fn(async (): Promise<boolean> => false));
vi.mock('$lib/server/feedback/email', () => ({ sendFeedbackEmail }));

const { POST } = await import('./+server');

type DbCall = { sql: string; args: unknown[] };

function makeDb(calls: DbCall[]) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            run: async () => {
              calls.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
    batch: async () => [],
  };
}

function makeEvent(init: {
  body: unknown;
  limiter?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  calls?: DbCall[];
}): RequestEvent {
  const url = new URL('http://example.test/api/feedback');
  const env: Record<string, unknown> = {
    DB: makeDb(init.calls ?? []),
  };
  if (init.limiter) {
    env.FEEDBACK_LIMITER = init.limiter;
  }
  return {
    url,
    params: {},
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(init.body),
    }),
    platform: { env },
  } as unknown as RequestEvent;
}

beforeEach(() => {
  sendFeedbackEmail.mockClear();
  sendFeedbackEmail.mockImplementation(async () => false);
});

describe('POST /api/feedback', () => {
  it('stores a valid submission and returns 201 with an id', async () => {
    const calls: DbCall[] = [];
    const res = await POST(makeEvent({ body: { message: 'love the county map' }, calls }))!;
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id?: string; received: boolean } };
    expect(body.data.received).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('INSERT INTO feedback');
    expect(calls[0]!.args).toContain('203.0.113.7');
  });

  it('silently drops honeypot submissions with 201 and no side effects', async () => {
    const calls: DbCall[] = [];
    const res = await POST(
      makeEvent({ body: { message: 'totally legit', website: 'https://spam.example' }, calls })
    )!;
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id?: string; received: boolean } };
    expect(body.data.received).toBe(true);
    expect(body.data.id).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it('still returns 201 when email delivery fails, without marking email_sent', async () => {
    const calls: DbCall[] = [];
    sendFeedbackEmail.mockImplementationOnce(async () => false);
    const res = await POST(makeEvent({ body: { message: 'feedback worth keeping' }, calls }))!;
    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.sql.includes('email_sent = 1'))).toBe(false);
  });

  it('marks email_sent when delivery succeeds', async () => {
    const calls: DbCall[] = [];
    sendFeedbackEmail.mockImplementationOnce(async () => true);
    const res = await POST(makeEvent({ body: { message: 'feedback with email' }, calls }))!;
    expect(res.status).toBe(201);
    expect(calls.some((c) => c.sql.includes('email_sent = 1'))).toBe(true);
  });

  it('returns 429 with Retry-After when the feedback limiter rejects', async () => {
    const calls: DbCall[] = [];
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const res = await POST(makeEvent({ body: { message: 'rapid fire feedback' }, limiter, calls }))!;
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
    expect(calls).toHaveLength(0);
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it('fails open when no limiter binding is present', async () => {
    const res = await POST(makeEvent({ body: { message: 'no limiter configured' } }))!;
    expect(res.status).toBe(201);
  });

  it('rejects invalid payloads with 400 before touching D1', async () => {
    const calls: DbCall[] = [];
    let caught: unknown;
    try {
      await POST(makeEvent({ body: { message: 'hi' }, calls }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
