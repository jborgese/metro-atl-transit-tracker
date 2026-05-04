import { describe, expect, it } from 'vitest';
import {
  applyProfileMapToEntity,
  applyProfileMapToHistoryEvent,
  resolveActorDisplay,
} from './mappers';
import type { ContentHistoryEvent } from '@/types/content';

describe('resolveActorDisplay', () => {
  it('returns the actor unchanged when no override exists', () => {
    const map = new Map<string, string>();
    expect(resolveActorDisplay('foo@bar.com', map)).toBe('foo@bar.com');
  });

  it('returns the override when one matches the lowercased actor', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    expect(resolveActorDisplay('foo@bar.com', map)).toBe('Foo Bar');
  });

  it('matches case-insensitively against the actor key', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    expect(resolveActorDisplay('Foo@Bar.com', map)).toBe('Foo Bar');
  });

  it('passes through null and undefined unchanged', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    expect(resolveActorDisplay(null, map)).toBeNull();
    expect(resolveActorDisplay(undefined, map)).toBeUndefined();
  });

  it('passes through empty/whitespace actors unchanged', () => {
    const map = new Map([['', 'Should not apply']]);
    expect(resolveActorDisplay('', map)).toBe('');
    expect(resolveActorDisplay('   ', map)).toBe('   ');
  });

  it('returns the original actor when the profile map is empty (fast path)', () => {
    expect(resolveActorDisplay('foo@bar.com', new Map())).toBe('foo@bar.com');
  });
});

describe('applyProfileMapToEntity', () => {
  it('rewrites archived_by and provenance.created_by/updated_by in place', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    const entity = {
      id: 'p1',
      archived_by: 'foo@bar.com',
      provenance: {
        created_by: 'foo@bar.com',
        updated_by: 'someone-else@example.com',
      },
    };
    applyProfileMapToEntity(entity, map);
    expect(entity.archived_by).toBe('Foo Bar');
    expect(entity.provenance.created_by).toBe('Foo Bar');
    expect(entity.provenance.updated_by).toBe('someone-else@example.com');
  });

  it('is a no-op when the profile map is empty', () => {
    const entity = {
      archived_by: 'foo@bar.com',
      provenance: { created_by: 'foo@bar.com', updated_by: 'foo@bar.com' },
    };
    const before = JSON.stringify(entity);
    applyProfileMapToEntity(entity, new Map());
    expect(JSON.stringify(entity)).toBe(before);
  });

  it('skips non-string actor fields', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    const entity = {
      archived_by: null,
      provenance: { created_by: undefined, updated_by: 42 },
    };
    applyProfileMapToEntity(entity as Record<string, unknown>, map);
    expect(entity.archived_by).toBeNull();
    expect(entity.provenance.created_by).toBeUndefined();
    expect(entity.provenance.updated_by).toBe(42);
  });
});

describe('applyProfileMapToHistoryEvent', () => {
  it('rewrites the top-level actor and recurses into before/after blobs', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    const event: ContentHistoryEvent = {
      id: 'h1',
      entity_type: 'project',
      entity_id: 'p1',
      action: 'update',
      actor: 'foo@bar.com',
      timestamp: '2026-05-04T00:00:00.000Z',
      before: {
        archived_by: 'foo@bar.com',
        provenance: { created_by: 'foo@bar.com', updated_by: 'foo@bar.com' },
      },
      after: {
        archived_by: null,
        provenance: { created_by: 'foo@bar.com', updated_by: 'foo@bar.com' },
      },
    };
    applyProfileMapToHistoryEvent(event, map);
    expect(event.actor).toBe('Foo Bar');
    expect((event.before as Record<string, unknown>).archived_by).toBe('Foo Bar');
    expect(((event.before as Record<string, unknown>).provenance as Record<string, unknown>).created_by).toBe('Foo Bar');
    expect(((event.after as Record<string, unknown>).provenance as Record<string, unknown>).updated_by).toBe('Foo Bar');
  });

  it('handles null before/after blobs gracefully', () => {
    const map = new Map([['foo@bar.com', 'Foo Bar']]);
    const event: ContentHistoryEvent = {
      id: 'h2',
      entity_type: 'goal',
      entity_id: 'g1',
      action: 'create',
      actor: 'foo@bar.com',
      timestamp: '2026-05-04T00:00:00.000Z',
      before: null,
      after: null,
    };
    applyProfileMapToHistoryEvent(event, map);
    expect(event.actor).toBe('Foo Bar');
    expect(event.before).toBeNull();
    expect(event.after).toBeNull();
  });
});
