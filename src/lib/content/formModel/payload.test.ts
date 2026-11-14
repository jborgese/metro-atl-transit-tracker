import { describe, expect, it } from 'vitest';
import liveGoals from './fixtures/live-goals.json';
import liveProjects from './fixtures/live-projects.json';
import liveTimedActions from './fixtures/live-timed-actions.json';
import { toFormDraft, toRecord } from './draft';
import { toPayload } from './payload';
import { validatePayload } from './validate';
import type { ContentKind, ContentRecord, FormDraft } from './types';

const goal = {
  id: 'g1',
  goal: 'G',
  actions: 'Old',
  related_counties: ['13121'],
  provenance: { updated_at: 't' },
  is_archived: false,
};

const action = {
  id: 'ta-aaaaaaaa',
  goal_id: 'g1',
  description: 'D',
  link: null,
  location: null,
  expires_on: '2026-12-01',
  provenance: {},
  is_archived: false,
  archived_at: null,
  archived_by: null,
};

const project = {
  id: 'p1',
  title: 'T',
  sources: [
    { label: 'A', url: 'https://a.example' },
    { label: 'B', url: 'https://b.example' },
  ],
  provenance: { updated_at: 't' },
};

describe('toPayload', () => {
  it('sends nothing for an untouched record', () => {
    expect(toPayload('goal', 'update', goal, goal)).toEqual({
      body: {},
      changed: false,
      removedKeys: [],
    });
  });

  it('sends only the changed keys', () => {
    expect(toPayload('goal', 'update', { ...goal, actions: 'New' }, goal).body).toEqual({
      actions: 'New',
    });
  });

  it('reports a removed key and does not send it', () => {
    const { actions: _gone, ...rest } = goal;
    expect(toPayload('goal', 'update', rest, goal)).toEqual({
      body: {},
      changed: false,
      removedKeys: ['actions'],
    });
  });

  it('creates with the id and without server-managed keys', () => {
    expect(toPayload('goal', 'create', goal, null).body).toEqual({
      id: 'g1',
      goal: 'G',
      actions: 'Old',
      related_counties: ['13121'],
    });
  });

  it('always sends exactly five fields for an action', () => {
    expect(toPayload('timed_action', 'update', { ...action, description: 'E' }, action)).toEqual({
      body: {
        goal_id: 'g1',
        description: 'E',
        link: null,
        location: null,
        expires_on: '2026-12-01',
      },
      changed: true,
      removedKeys: [],
    });
    expect(toPayload('timed_action', 'update', action, action).changed).toBe(false);
  });

  it('sends the whole sources array when one label changed, and nothing else', () => {
    const sources = [{ label: 'A2', url: 'https://a.example' }, project.sources[1]];
    expect(toPayload('project', 'update', { ...project, sources }, project)).toEqual({
      body: { sources },
      changed: true,
      removedKeys: [],
    });
  });

  it('never sends an id on update', () => {
    expect(toPayload('project', 'update', { ...project, id: 'other' }, project).body).toEqual({});
  });

  it('omits the id and server-managed keys when creating an action', () => {
    expect(toPayload('timed_action', 'create', action, null).body).toEqual({
      goal_id: 'g1',
      description: 'D',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
  });

  it('does not mutate its inputs or share objects with them', () => {
    const before = JSON.stringify([project, goal]);
    const created = toPayload('project', 'create', project, null).body;
    const updated = toPayload('project', 'update', { ...project, title: 'T2' }, project).body;
    expect(JSON.stringify([project, goal])).toBe(before);
    expect(created.sources).toEqual(project.sources);
    expect(created.sources).not.toBe(project.sources);
    expect((created.sources as unknown[])[0]).not.toBe(project.sources[0]);
    expect(updated).toEqual({ title: 'T2' });
  });

  it('ignores top-level key order', () => {
    const reordered = {
      provenance: project.provenance,
      sources: project.sources,
      title: 'T',
      id: 'p1',
    };
    expect(toPayload('project', 'update', reordered, project).changed).toBe(false);
  });
});

describe('live fixtures through the draft', () => {
  const cases: Array<[ContentKind, ContentRecord[], string[], number]> = [
    ['project', liveProjects, ['title'], 20],
    ['goal', liveGoals, ['goal'], 12],
    [
      'timed_action',
      liveTimedActions,
      ['goal_id', 'description', 'link', 'location', 'expires_on'],
      1,
    ],
  ];

  function edited(kind: ContentKind, record: ContentRecord): ContentRecord {
    const draft: FormDraft = toFormDraft(kind, record);
    if (draft.kind === 'project') {
      draft.title += ' x';
    } else if (draft.kind === 'goal') {
      draft.goal += ' x';
    } else {
      draft.description += ' x';
    }
    return toRecord(draft);
  }

  it.each(cases)(
    'round-trips every %s untouched and accepts a benign edit',
    (kind, records, keys, count) => {
      expect(records).toHaveLength(count);
      for (const record of records) {
        const untouched = toPayload(kind, 'update', toRecord(toFormDraft(kind, record)), record);
        expect(untouched.changed).toBe(false);
        if (kind !== 'timed_action') {
          expect(untouched).toEqual({ body: {}, changed: false, removedKeys: [] });
        }
        const { body, changed } = toPayload(kind, 'update', edited(kind, record), record);
        expect(changed).toBe(true);
        expect(Object.keys(body).sort()).toEqual([...keys].sort());
        const context = {
          today: '2026-11-14',
          goals: liveGoals,
          existingIds: [],
          loaded: record,
        };
        expect(validatePayload(kind, 'update', body, context)).toEqual([]);
      }
    },
  );
});
