import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as server from '#lib/server/content/validators.ts';
import * as shared from './schemas';
import { timedActionWindowError } from './schemas';

describe('shared schemas', () => {
  it('is the same object the server validates with', () => {
    expect(server.projectCreateSchema).toBe(shared.projectCreateSchema);
    expect(server.goalPatchSchema).toBe(shared.goalPatchSchema);
    expect(server.timedActionReplaceSchema).toBe(shared.timedActionReplaceSchema);
  });

  it('imports nothing server-only and no data files', () => {
    const source = readFileSync('src/lib/content/schemas.ts', 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*server/);
    expect(source).not.toMatch(/\.json['"]/);
  });

  it('reports the expiry window', () => {
    expect(timedActionWindowError('2026-11-13', '2026-11-14')).toBe(
      'must be between 2026-11-14 and 2027-11-15',
    );
    expect(timedActionWindowError('2027-11-16', '2026-11-14')).toBe(
      'must be between 2026-11-14 and 2027-11-15',
    );
    expect(timedActionWindowError('2026-11-14', '2026-11-14')).toBeNull();
    expect(timedActionWindowError('2026-11-01', '2026-11-14', '2026-11-01')).toBeNull();
  });

  it('shares the field limits with the timed action schemas', () => {
    expect(shared.FIELD_LIMITS).toEqual({ description: 300, label: 40, address: 200 });
    const base = {
      goal_id: 'g',
      link: null,
      location: null,
      expires_on: '2026-11-14',
    };
    const over = shared.timedActionInputSchema.safeParse({
      ...base,
      description: 'x'.repeat(shared.FIELD_LIMITS.description + 1),
    });
    expect(over.success).toBe(false);
    const ok = shared.timedActionInputSchema.safeParse({
      ...base,
      description: 'x'.repeat(shared.FIELD_LIMITS.description),
    });
    expect(ok.success).toBe(true);
  });

  it('adds days across month ends', () => {
    expect(shared.addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});
