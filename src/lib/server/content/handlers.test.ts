import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { ContentStoreError } from './errors';

const requireEditorActor = vi.hoisted(() => vi.fn(async () => 'tester@example.test'));

vi.mock('$lib/server/auth/editor', () => ({
  requireEditorActor,
}));

const { makeCollectionHandlers, makeItemHandlers, makeRestoreHandler } = await import('./handlers');

type Item = { id: string; name: string };

function makeStore() {
  return {
    list: vi.fn(async (_event: unknown, _options?: { includeArchived?: boolean }) => [
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'bravo' },
    ] as Item[]),
    getById: vi.fn(async (_event: unknown, id: string) => ({ id, name: 'found' }) as Item),
    create: vi.fn(async (_event: unknown, input: unknown, actor: string) => ({
      id: (input as { id: string }).id,
      name: actor,
    }) as Item),
    update: vi.fn(async (_event: unknown, id: string, _patch: unknown, actor: string) => ({
      id,
      name: actor,
    }) as Item),
    archive: vi.fn(async (_event: unknown, id: string, actor: string) => ({
      id,
      name: `archived:${actor}`,
    }) as Item),
    restore: vi.fn(async (_event: unknown, id: string, actor: string) => ({
      id,
      name: `restored:${actor}`,
    }) as Item),
  };
}

function makeEvent(init: {
  search?: string;
  body?: string;
  contentLength?: number;
  params?: Record<string, string | undefined>;
} = {}): RequestEvent {
  const url = new URL(`http://example.test/api/items${init.search ?? ''}`);
  const headers: Record<string, string> = {};
  if (init.contentLength !== undefined) {
    headers['content-length'] = String(init.contentLength);
  }
  return {
    url,
    params: init.params ?? { id: 'x' },
    request: new Request(url, {
      method: init.body !== undefined ? 'POST' : 'GET',
      headers,
      body: init.body ?? null,
    }),
  } as unknown as RequestEvent;
}

beforeEach(() => {
  requireEditorActor.mockClear();
  requireEditorActor.mockImplementation(async () => 'tester@example.test');
});

describe('makeCollectionHandlers', () => {
  it('GET forwards includeArchived=false by default and returns list with count meta', async () => {
    const store = makeStore();
    const { GET } = makeCollectionHandlers<Item>(store);
    const res = await GET(makeEvent())!;
    expect(store.list).toHaveBeenCalledWith(expect.anything(), { includeArchived: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Item[]; meta: { count: number } };
    expect(body.meta.count).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it('GET parses includeArchived=true', async () => {
    const store = makeStore();
    const { GET } = makeCollectionHandlers<Item>(store);
    await GET(makeEvent({ search: '?includeArchived=true' }))!;
    expect(store.list).toHaveBeenCalledWith(expect.anything(), { includeArchived: true });
  });

  it('POST authenticates with content:edit, parses body, returns 201', async () => {
    const store = makeStore();
    const { POST } = makeCollectionHandlers<Item>(store);
    const res = await POST(makeEvent({ body: JSON.stringify({ id: 'new' }) }))!;
    expect(requireEditorActor).toHaveBeenCalledWith(expect.anything(), 'content:edit');
    expect(store.create).toHaveBeenCalledWith(expect.anything(), { id: 'new' }, 'tester@example.test');
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Item };
    expect(body.data).toEqual({ id: 'new', name: 'tester@example.test' });
  });

  it('POST with body exceeding 64 KB throws 413 (S-11 absorption)', async () => {
    const store = makeStore();
    const { POST } = makeCollectionHandlers<Item>(store);
    const big = JSON.stringify({ id: 'big', payload: 'x'.repeat(70 * 1024) });
    let caught: unknown;
    try {
      await POST(makeEvent({ body: big }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(413);
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe('makeItemHandlers', () => {
  it('GET defaults includeArchived to true when no query param', async () => {
    const store = makeStore();
    const { GET } = makeItemHandlers<Item>(store);
    await GET(makeEvent({ params: { id: 'abc' } }))!;
    expect(store.getById).toHaveBeenCalledWith(expect.anything(), 'abc', { includeArchived: true });
  });

  it('GET respects explicit includeArchived=false', async () => {
    const store = makeStore();
    const { GET } = makeItemHandlers<Item>(store);
    await GET(makeEvent({ params: { id: 'abc' }, search: '?includeArchived=false' }))!;
    expect(store.getById).toHaveBeenCalledWith(expect.anything(), 'abc', { includeArchived: false });
  });

  it('GET with missing id throws 400', async () => {
    const store = makeStore();
    const { GET } = makeItemHandlers<Item>(store);
    let caught: unknown;
    try {
      await GET(makeEvent({ params: { id: undefined } }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(400);
    expect(store.getById).not.toHaveBeenCalled();
  });

  it('PATCH authenticates with content:edit', async () => {
    const store = makeStore();
    const { PATCH } = makeItemHandlers<Item>(store);
    await PATCH(makeEvent({ params: { id: 'abc' }, body: JSON.stringify({ name: 'updated' }) }))!;
    expect(requireEditorActor).toHaveBeenCalledWith(expect.anything(), 'content:edit');
    expect(store.update).toHaveBeenCalledWith(
      expect.anything(),
      'abc',
      { name: 'updated' },
      'tester@example.test',
    );
  });

  it('DELETE authenticates with content:archive', async () => {
    const store = makeStore();
    const { DELETE } = makeItemHandlers<Item>(store);
    const res = await DELETE(makeEvent({ params: { id: 'abc' } }))!;
    expect(requireEditorActor).toHaveBeenCalledWith(expect.anything(), 'content:archive');
    expect(store.archive).toHaveBeenCalledWith(expect.anything(), 'abc', 'tester@example.test');
    expect(res.status).toBe(200);
  });

  it('converts ContentStoreError from store into a SvelteKit HttpError', async () => {
    const store = makeStore();
    store.getById.mockRejectedValueOnce(new ContentStoreError(404, 'not found'));
    const { GET } = makeItemHandlers<Item>(store);
    let caught: unknown;
    try {
      await GET(makeEvent({ params: { id: 'abc' } }));
    } catch (err) {
      caught = err;
    }
    const httpErr = caught as { status?: number; body?: { message?: string } };
    expect(httpErr.status).toBe(404);
    expect(httpErr.body?.message).toBe('not found');
  });
});

describe('makeRestoreHandler', () => {
  it('POST authenticates with content:archive and calls store.restore', async () => {
    const store = makeStore();
    const { POST } = makeRestoreHandler<Item>(store);
    const res = await POST(makeEvent({ params: { id: 'abc' } }))!;
    expect(requireEditorActor).toHaveBeenCalledWith(expect.anything(), 'content:archive');
    expect(store.restore).toHaveBeenCalledWith(expect.anything(), 'abc', 'tester@example.test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Item };
    expect(body.data).toEqual({ id: 'abc', name: 'restored:tester@example.test' });
  });

  it('POST with missing id throws 400', async () => {
    const store = makeStore();
    const { POST } = makeRestoreHandler<Item>(store);
    let caught: unknown;
    try {
      await POST(makeEvent({ params: { id: undefined } }));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status).toBe(400);
    expect(store.restore).not.toHaveBeenCalled();
  });
});
