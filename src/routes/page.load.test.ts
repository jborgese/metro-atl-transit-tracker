import { describe, expect, it, vi } from 'vitest';
import { load } from './+page';

describe('home page load', () => {
  it('returns no actions and no fallback notice when the actions fetch fails', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/timed-actions'
        ? new Response('nope', { status: 500 })
        : new Response(JSON.stringify({ data: [], meta: { count: 0 } }), { status: 200 }),
    );
    const result = await load({ fetch: fetchFn } as unknown as Parameters<typeof load>[0]);
    expect(result).toMatchObject({ timedActions: [], usingFallback: false });
  });
});
