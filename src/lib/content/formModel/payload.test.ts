import { describe, expect, it } from 'vitest';
import liveGoals from './fixtures/live-goals.json';
import liveProjects from './fixtures/live-projects.json';
import liveTimedActions from './fixtures/live-timed-actions.json';
import {
  emptyMilestoneRow,
  emptyOrgRow,
  emptyRecord,
  emptyRelatedOrgRow,
  emptySourceRow,
  pruneBlankRows,
  toFormDraft,
  toRecord,
} from './draft';
import { SERVER_MANAGED_KEYS, toPayload } from './payload';
import { validatePayload } from './validate';
import type { ContentKind, ContentRecord, FormDraft, GoalDraft, ProjectDraft } from './types';

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

describe('create changes', () => {
  it.each(['project', 'goal', 'timed_action'] as const)(
    'reports an untouched new %s as unchanged',
    (kind) => {
      const blank = emptyRecord(kind);
      const next = toRecord(toFormDraft(kind, blank));
      expect(toPayload(kind, 'create', next, blank).changed).toBe(false);
      expect(toPayload(kind, 'create', next, null).changed).toBe(true);
    },
  );

  it.each(['project', 'goal'] as const)('reports a typed id on a new %s', (kind) => {
    const blank = emptyRecord(kind);
    const draft = toFormDraft(kind, blank);
    if (draft.kind === 'timed_action') throw new Error('unexpected kind');
    draft.id = 'new-id';
    const payload = toPayload(kind, 'create', toRecord(draft), blank);
    expect(payload.changed).toBe(true);
    expect(payload.body.id).toBe('new-id');
  });

  it('ignores a blank row added to a new record', () => {
    const blank = emptyRecord('project');
    const draft = toFormDraft('project', blank) as ProjectDraft;
    draft.sources.push(emptySourceRow());
    expect(toPayload('project', 'create', toRecord(draft), blank).changed).toBe(false);
    const goalBlank = emptyRecord('goal');
    const goalDraft = toFormDraft('goal', goalBlank) as GoalDraft;
    goalDraft.related_orgs.push(emptyRelatedOrgRow());
    expect(toPayload('goal', 'create', toRecord(goalDraft), goalBlank).changed).toBe(false);
  });
});

describe('server-managed keys and list order', () => {
  it('sends none of the server-managed keys and reports no change', () => {
    const managed = {
      provenance: { updated_at: 'z' },
      is_archived: true,
      archived_at: 'x',
      archived_by: 'y',
    };
    expect(toPayload('goal', 'update', { ...goal, ...managed }, goal)).toEqual({
      body: {},
      changed: false,
      removedKeys: [],
    });
    const edited = toPayload('goal', 'update', { ...goal, ...managed, actions: 'New' }, goal);
    expect(edited.body).toEqual({ actions: 'New' });
    expect(SERVER_MANAGED_KEYS).toEqual([
      'provenance',
      'is_archived',
      'archived_at',
      'archived_by',
    ]);
  });

  it('treats a reordered plain list as unchanged', () => {
    const stored = { id: 'p', title: 'T', modes: ['bus', 'transit'] };
    const draft = toFormDraft('project', stored) as ProjectDraft;
    draft.modes = ['transit', 'bus'];
    expect(toRecord(draft)).toEqual(stored);
    expect(toPayload('project', 'update', toRecord(draft), stored).changed).toBe(false);
    draft.modes = ['transit'];
    expect(toRecord(draft).modes).toEqual(['transit']);
    draft.modes = ['transit', 'rail', 'bus'];
    expect(toRecord(draft).modes).toEqual(['transit', 'rail', 'bus']);
  });
});

describe('pruneBlankRows with validation', () => {
  const loaded = { id: 'p', title: 'T', sources: [{ label: 'A', url: 'https://a.example' }] };
  const context = { today: '2026-11-14', goals: [], existingIds: [], loaded };

  it('keeps issue indexes equal to the visible rows', () => {
    const draft = toFormDraft('project', loaded) as ProjectDraft;
    draft.sources.push(emptySourceRow(), { ...emptySourceRow(), label: 'Half' });
    const pruned = pruneBlankRows(draft);
    expect(pruned.sources).toHaveLength(2);
    expect(pruned.sources[1]?.label).toBe('Half');
    const { body } = toPayload('project', 'update', toRecord(pruned), loaded);
    expect(validatePayload('project', 'update', body, context).map((i) => i.path)).toEqual([
      'sources.1.url',
    ]);
  });

  it('reports a goal organisation at its visible position', () => {
    const goalLoaded = { id: 'g', goal: 'G', related_orgs: [] };
    const draft = toFormDraft('goal', goalLoaded) as GoalDraft;
    draft.related_orgs.push(emptyRelatedOrgRow(), {
      ...emptyRelatedOrgRow(),
      url: 'https://a.example',
    });
    const pruned = pruneBlankRows(draft);
    expect(pruned.related_orgs).toHaveLength(1);
    const { body } = toPayload('goal', 'update', toRecord(pruned), goalLoaded);
    const issues = validatePayload('goal', 'update', body, { ...context, loaded: goalLoaded });
    expect(issues.map((i) => i.path)).toEqual(['related_orgs.0.name']);
  });

  it('keeps row keys, does not mutate, and leaves untouched arrays alone', () => {
    const draft = toFormDraft('project', loaded) as ProjectDraft;
    draft.sources.push(emptySourceRow());
    const before = structuredClone(draft);
    const pruned = pruneBlankRows(draft);
    expect(draft).toEqual(before);
    expect(pruned.sources[0]?.key).toBe(draft.sources[0]?.key);
    const odd = toFormDraft('project', { id: 'p', title: 'T', milestones: [{}] }) as ProjectDraft;
    expect(pruneBlankRows(odd).milestones).toHaveLength(1);
    const blankAction = toFormDraft('timed_action', emptyRecord('timed_action'));
    expect(pruneBlankRows(blankAction)).toEqual(blankAction);
  });

  it('never changes what toRecord writes for a fixture with blank rows added', () => {
    const cases: Array<[ContentKind, ContentRecord[]]> = [
      ['project', liveProjects],
      ['goal', liveGoals],
    ];
    for (const [kind, records] of cases) {
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        const draft = toFormDraft(kind, record);
        if (draft.kind === 'project') {
          draft.partners.push(emptyOrgRow());
          draft.milestones.push(emptyMilestoneRow());
          draft.sources.push(emptySourceRow());
        } else if (draft.kind === 'goal') {
          draft.related_orgs.push(emptyRelatedOrgRow());
        }
        expect(toRecord(pruneBlankRows(draft))).toEqual(toRecord(draft));
      }
    }
  });
});
