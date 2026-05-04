import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { ContentStoreError } from '$lib/server/content/errors';

type Profile = { identity: string; display_name: string; updated_at: string };

const requireAuthenticatedIdentity = vi.hoisted(() =>
  vi.fn(async (): Promise<{ actor: string; identity: string }> => ({
    actor: 'foo@bar.com',
    identity: 'foo@bar.com',
  }))
);
const getProfile = vi.hoisted(() =>
  vi.fn(async (_event: unknown, _identity: string): Promise<Profile | null> => null)
);
const upsertProfile = vi.hoisted(() =>
  vi.fn(async (_event: unknown, identity: string, displayName: string): Promise<Profile> => ({
    identity,
    display_name: displayName.trim(),
    updated_at: '2026-05-04T00:00:00.000Z',
  }))
);
const deleteProfile = vi.hoisted(() =>
  vi.fn(async (_event: unknown, _identity: string): Promise<void> => undefined)
);

vi.mock('$lib/server/auth/editor', () => ({ requireAuthenticatedIdentity }));
vi.mock('$lib/server/content/profiles', () => ({ getProfile, upsertProfile, deleteProfile }));

const { GET, PUT } = await import('./+server');

function makeEvent(init: { body?: string; contentLength?: number } = {}): RequestEvent {
  const url = new URL('http://example.test/api/me');
  const headers: Record<string, string> = {};
  if (init.contentLength !== undefined) {
    headers['content-length'] = String(init.contentLength);
  }
  return {
    url,
    params: {},
    request: new Request(url, {
      method: init.body !== undefined ? 'PUT' : 'GET',
      headers,
      body: init.body ?? null,
    }),
  } as unknown as RequestEvent;
}

beforeEach(() => {
  requireAuthenticatedIdentity.mockClear();
  getProfile.mockClear();
  upsertProfile.mockClear();
  deleteProfile.mockClear();
  requireAuthenticatedIdentity.mockImplementation(async () => ({ actor: 'foo@bar.com', identity: 'foo@bar.com' }));
  getProfile.mockImplementation(async () => null);
});

describe('GET /api/me', () => {
  it('returns identity, actor, and display_name=null when no profile is set', async () => {
    const res = await GET(makeEvent())!;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { identity: string; actor: string; display_name: string | null } };
    expect(body.data).toEqual({ identity: 'foo@bar.com', actor: 'foo@bar.com', display_name: null });
    expect(getProfile).toHaveBeenCalledWith(expect.anything(), 'foo@bar.com');
  });

  it('returns the saved display_name when a profile exists', async () => {
    getProfile.mockImplementationOnce(async () => ({
      identity: 'foo@bar.com',
      display_name: 'Foo Bar',
      updated_at: '2026-05-04T00:00:00.000Z',
    }));
    const res = await GET(makeEvent())!;
    const body = (await res.json()) as { data: { display_name: string | null } };
    expect(body.data.display_name).toBe('Foo Bar');
  });

  it('propagates 401 from auth helper', async () => {
    requireAuthenticatedIdentity.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 })
    );
    let caught: unknown;
    try {
      await GET(makeEvent());
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(401);
    expect(getProfile).not.toHaveBeenCalled();
  });
});

describe('PUT /api/me', () => {
  it('saves a non-empty display_name via upsertProfile', async () => {
    const res = await PUT(makeEvent({ body: JSON.stringify({ display_name: 'Foo Bar' }) }))!;
    expect(res.status).toBe(200);
    expect(upsertProfile).toHaveBeenCalledWith(expect.anything(), 'foo@bar.com', 'Foo Bar');
    expect(deleteProfile).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { display_name: string | null } };
    expect(body.data.display_name).toBe('Foo Bar');
  });

  it('clears the profile when display_name is null', async () => {
    const res = await PUT(makeEvent({ body: JSON.stringify({ display_name: null }) }))!;
    expect(res.status).toBe(200);
    expect(deleteProfile).toHaveBeenCalledWith(expect.anything(), 'foo@bar.com');
    expect(upsertProfile).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { display_name: string | null } };
    expect(body.data.display_name).toBeNull();
  });

  it('clears the profile when display_name trims to empty', async () => {
    await PUT(makeEvent({ body: JSON.stringify({ display_name: '   ' }) }))!;
    expect(deleteProfile).toHaveBeenCalledWith(expect.anything(), 'foo@bar.com');
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it('rejects non-string, non-null display_name with 400', async () => {
    let caught: unknown;
    try {
      await PUT(makeEvent({ body: JSON.stringify({ display_name: 42 }) }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(400);
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(deleteProfile).not.toHaveBeenCalled();
  });

  it('rejects non-object bodies with 400', async () => {
    let caught: unknown;
    try {
      await PUT(makeEvent({ body: JSON.stringify('not-an-object') }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(400);
  });

  it('propagates ContentStoreError from upsertProfile (e.g. validation)', async () => {
    upsertProfile.mockRejectedValueOnce(new ContentStoreError(400, 'display_name must be 64 characters or fewer'));
    let caught: unknown;
    try {
      await PUT(makeEvent({ body: JSON.stringify({ display_name: 'x'.repeat(100) }) }));
    } catch (err) {
      caught = err;
    }
    const httpErr = caught as { status?: number; body?: { message?: string } };
    expect(httpErr.status).toBe(400);
    expect(httpErr.body?.message).toContain('64 characters');
  });
});
