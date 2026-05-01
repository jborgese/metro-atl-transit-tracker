import { describe, expect, it } from 'vitest';
import {
  ContentStoreError,
  assertNoForbiddenWriteFields,
  goalCreateSchema,
  goalPatchSchema,
  projectCreateSchema,
  projectPatchSchema,
} from './store';

describe('projectCreateSchema', () => {
  const minimal = { id: 'fulton-brt-2027', title: 'Fulton BRT 2027' };

  it('accepts a minimal valid project payload', () => {
    const result = projectCreateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('accepts an enriched payload with optional fields', () => {
    const result = projectCreateSchema.safeParse({
      ...minimal,
      summary: 'Bus rapid transit corridor.',
      status: 'planning',
      lead_org: { name: 'Fulton County', url: 'https://fultoncountyga.gov/' },
      partners: [{ name: 'MARTA' }],
      start_date: '2026-01-01',
      end_date: null,
      milestones: [{ title: 'Public outreach', date: '2026-03-01' }],
      geo_scope: 'corridor',
      modes: ['transit'],
      related_counties: ['13121'],
      sources: [{ label: 'Press release', url: 'https://example.com/release' }],
      provenance: { created_by: 'tester' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(projectCreateSchema.safeParse({ title: 'No id' }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ id: 'no-title' }).success).toBe(false);
  });

  it('rejects ids that violate the lowercase-hyphen pattern', () => {
    const bad = ['Fulton-BRT', 'with space', '-leading-hyphen', 'has_underscore', '!bang'];
    for (const id of bad) {
      const result = projectCreateSchema.safeParse({ id, title: 'x' });
      expect(result.success, `expected "${id}" to fail`).toBe(false);
    }
  });

  it('rejects non-URL lead_org urls', () => {
    const result = projectCreateSchema.safeParse({
      ...minimal,
      lead_org: { name: 'Fulton', url: 'not a url' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects sources missing the URL field', () => {
    const result = projectCreateSchema.safeParse({
      ...minimal,
      sources: [{ label: 'No url provided' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty title strings (trimmed)', () => {
    expect(projectCreateSchema.safeParse({ id: 'a', title: '   ' }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ id: 'a', title: '' }).success).toBe(false);
  });

  it('rejects oversized strings', () => {
    const tooLong = 'x'.repeat(241);
    expect(projectCreateSchema.safeParse({ id: 'a', title: tooLong }).success).toBe(false);
  });

  it('passes through unknown top-level fields', () => {
    const result = projectCreateSchema.safeParse({ ...minimal, extra: 'kept' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ extra: 'kept' });
    }
  });
});

describe('projectPatchSchema', () => {
  it('makes every field optional', () => {
    expect(projectPatchSchema.safeParse({}).success).toBe(true);
    expect(projectPatchSchema.safeParse({ title: 'New title' }).success).toBe(true);
  });

  it('still validates the shape of provided fields', () => {
    const result = projectPatchSchema.safeParse({ id: 'BAD ID' });
    expect(result.success).toBe(false);
  });
});

describe('goalCreateSchema', () => {
  const minimal = { id: 'fund-marta-expansion', goal: 'Fund MARTA expansion across the metro.' };

  it('accepts a minimal valid goal payload', () => {
    expect(goalCreateSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a goal with related project ids', () => {
    const result = goalCreateSchema.safeParse({
      ...minimal,
      related_project_ids: ['fulton-brt-2027', 'cobb-bus-2026'],
      related_orgs: [
        { name: 'CobbLinc', url: 'https://cobblinc.example.com/', contact_info: 'see site' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects related_project_ids that violate the id pattern', () => {
    const result = goalCreateSchema.safeParse({
      ...minimal,
      related_project_ids: ['valid-id', 'INVALID ID'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty goal text (trimmed)', () => {
    expect(goalCreateSchema.safeParse({ id: 'a', goal: '   ' }).success).toBe(false);
  });
});

describe('goalPatchSchema', () => {
  it('accepts an empty patch', () => {
    expect(goalPatchSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an explicit patch with bad shape', () => {
    expect(goalPatchSchema.safeParse({ goal: '' }).success).toBe(false);
  });
});

describe('assertNoForbiddenWriteFields', () => {
  it('passes for payloads without server-managed fields', () => {
    expect(() => assertNoForbiddenWriteFields({ id: 'a', title: 'b' }, 'project')).not.toThrow();
  });

  it.each(['is_archived', 'archived_at', 'archived_by'])(
    'throws ContentStoreError(400) when payload contains %s',
    (field) => {
      let caught: unknown;
      try {
        assertNoForbiddenWriteFields({ id: 'a', [field]: 'x' }, 'project');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ContentStoreError);
      expect((caught as ContentStoreError).status).toBe(400);
      expect((caught as ContentStoreError).message).toContain(field);
    }
  );
});
