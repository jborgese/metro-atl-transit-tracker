import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentStoreError } from './errors';
import {
  ARCHIVE_TIMED_ACTION_SQL,
  INSERT_TIMED_ACTION_ARCHIVE_EVENT_SQL,
  type D1Database,
} from './repository';
import { SYSTEM_ACTOR, isMissingTimedActionsTable, sweepExpiredTimedActions } from './timedActions';

function expiredRow(id: string) {
  return {
    id,
    payload_json: JSON.stringify({
      id,
      goal_id: 'regional-goal',
      description: 'Comment on the study.',
      link: null,
      location: null,
      expires_on: '2026-11-12',
    }),
    is_archived: 0,
    archived_at: null,
    archived_by: null,
    created_at: '2026-11-01T00:00:00.000Z',
    created_by: 'editor@example.test',
    updated_at: '2026-11-01T00:00:00.000Z',
    updated_by: 'editor@example.test',
  };
}

function manyRows(count: number) {
  return Array.from({ length: count }, (_, index) =>
    expiredRow(`ta-${String(index).padStart(8, '0')}`),
  );
}

function echoBatch() {
  return vi.fn(async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } })));
}

function fakeDb(rows: Array<ReturnType<typeof expiredRow>>, batch: ReturnType<typeof vi.fn>) {
  const bound: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => {
        bound.push({ sql, values });
        return { sql, values, all: async () => ({ results: rows }) };
      },
    }),
    batch,
  } as unknown as D1Database;
  return { db, bound };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sweepExpiredTimedActions', () => {
  it('logs and returns 0 instead of throwing when the database fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = {
      prepare: () => {
        throw new Error('D1 is unavailable');
      },
    } as unknown as D1Database;

    await expect(sweepExpiredTimedActions(db)).resolves.toBe(0);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('timed action sweep failed'),
      expect.any(Error),
    );
  });

  it('selects by the Atlanta date, archives as system, and counts only rows it changed', async () => {
    const { db, bound } = fakeDb(
      [expiredRow('ta-aaaaaaaa'), expiredRow('ta-bbbbbbbb')],
      vi
        .fn()
        .mockResolvedValueOnce([
          { meta: { changes: 1 } },
          { meta: { changes: 1 } },
          { meta: { changes: 0 } },
          { meta: { changes: 0 } },
        ]),
    );

    const archived = await sweepExpiredTimedActions(db, new Date('2026-11-14T03:00:00Z'));

    expect(archived).toBe(1);
    expect(bound[0]?.values).toEqual(['2026-11-13']);
    expect(
      bound
        .filter(({ sql }) => sql.includes('INSERT INTO content_history'))
        .map(({ values }) => [values[1], values[2]]),
    ).toEqual([
      ['ta-aaaaaaaa', SYSTEM_ACTOR],
      ['ta-bbbbbbbb', SYSTEM_ACTOR],
    ]);
  });

  it('binds the expiry guard to the Atlanta date in both statements of every pair', async () => {
    const { db, bound } = fakeDb([expiredRow('ta-aaaaaaaa')], echoBatch());

    await sweepExpiredTimedActions(db, new Date('2026-11-14T03:00:00Z'));

    const guarded = bound.slice(1);
    expect(guarded).toHaveLength(2);
    expect(guarded.map(({ values }) => values.at(-1))).toEqual(['2026-11-13', '2026-11-13']);
    expect(guarded[0]?.sql).toBe(INSERT_TIMED_ACTION_ARCHIVE_EVENT_SQL);
    expect(guarded[1]?.sql).toBe(ARCHIVE_TIMED_ACTION_SQL);
  });

  it('carries an optional expiry guard in the archive statements', () => {
    for (const sql of [INSERT_TIMED_ACTION_ARCHIVE_EVENT_SQL, ARCHIVE_TIMED_ACTION_SQL]) {
      expect(sql).toContain("(?7 IS NULL OR json_extract(payload_json, '$.expires_on') < ?7)");
      expect(sql).toContain('is_archived = 0');
    }
  });

  it('groups sixty expired rows into three batches of at most fifty statements', async () => {
    const batch = echoBatch();
    const { db } = fakeDb(manyRows(60), batch);

    await expect(sweepExpiredTimedActions(db)).resolves.toBe(60);

    expect(batch).toHaveBeenCalledTimes(3);
    expect(batch.mock.calls.map(([statements]) => (statements as unknown[]).length)).toEqual([
      50, 50, 20,
    ]);
  });

  it('waits for every chunk when one rejects, logs its ids, and counts the others', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let lateBatchSettled = false;
    const echo = echoBatch();
    const { db } = fakeDb(
      manyRows(60),
      vi
        .fn()
        .mockImplementationOnce(echo)
        .mockRejectedValueOnce(new Error('batch failed'))
        .mockImplementationOnce(async (statements: unknown[]) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          lateBatchSettled = true;
          return echo(statements);
        }),
    );

    await expect(sweepExpiredTimedActions(db)).resolves.toBe(35);
    expect(lateBatchSettled).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('ta-00000025'),
      expect.any(Error),
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('ta-00000049'),
      expect.any(Error),
    );
  });
});

describe('isMissingTimedActionsTable', () => {
  it('matches a plain missing-table error but never a ContentStoreError', () => {
    expect(
      isMissingTimedActionsTable(new Error('D1_ERROR: no such table: timed_actions: SQLITE_ERROR')),
    ).toBe(true);
    expect(
      isMissingTimedActionsTable(
        new ContentStoreError(404, 'timed action no such table: timed_actions not found'),
      ),
    ).toBe(false);
  });
});
