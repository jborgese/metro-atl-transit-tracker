import { describe, expect, it } from 'vitest';
import { anchorOf, keepRowKeys, pathOf, relabel } from './anchors';
import { emptyRelatedOrgRow, toFormDraft, toRecord } from './draft';
import type { GoalDraft, ProjectDraft } from './types';

function goalWithOrgs(count: number): GoalDraft {
  const draft = toFormDraft('goal', { id: 'g', goal: 'G' }) as GoalDraft;
  return { ...draft, related_orgs: Array.from({ length: count }, () => emptyRelatedOrgRow()) };
}

const keys = (draft: GoalDraft) => draft.related_orgs.map((row) => row.key);

const project = toFormDraft('project', {
  id: 'p',
  title: 'T',
  partners: [{ name: 'A' }],
  milestones: [{ title: 'M', date: '2026-01-01' }],
  sources: [{ label: 'S', url: 'https://s.example' }],
}) as ProjectDraft;

const action = toFormDraft('timed_action', { goal_id: 'g' });

describe('anchorOf', () => {
  it('anchors a path into a row to the row key', () => {
    const draft = goalWithOrgs(2);
    const [first, second] = keys(draft);
    expect(anchorOf(draft, 'related_orgs.0.name')).toBe(`related_orgs#${first}.name`);
    expect(anchorOf(draft, 'related_orgs.1.contact_info')).toBe(
      `related_orgs#${second}.contact_info`,
    );
  });

  it('anchors a path to a whole row', () => {
    const draft = goalWithOrgs(1);
    expect(anchorOf(draft, 'related_orgs.0')).toBe(`related_orgs#${keys(draft)[0]}`);
  });

  it.each([
    ['partners.0.url', 'partners', project.partners],
    ['milestones.0.date', 'milestones', project.milestones],
    ['sources.0.label', 'sources', project.sources],
  ])('anchors %s to its project row', (path, array, rows) => {
    const rest = path.split('.').slice(2).join('.');
    expect(anchorOf(project, path)).toBe(`${array}#${rows[0]!.key}.${rest}`);
  });

  it.each([
    ['related_counties.2', 'related_counties'],
    ['related_project_ids.0', 'related_project_ids'],
    ['modes.1', 'modes'],
  ])('anchors an item of a plain list, %s, to the list', (path, list) => {
    expect(anchorOf(project, path)).toBe(list);
    expect(anchorOf(goalWithOrgs(0), path)).toBe(list);
  });

  it.each([
    'id',
    'goal',
    'description',
    'link.url',
    'location.address',
    'related_counties',
    'related_orgs',
    '',
  ])('returns the path %j unchanged', (path) => {
    expect(anchorOf(goalWithOrgs(1), path)).toBe(path);
    expect(anchorOf(action, path)).toBe(path);
  });

  it('returns the path unchanged when the index has no row', () => {
    expect(anchorOf(goalWithOrgs(1), 'related_orgs.3.name')).toBe('related_orgs.3.name');
  });

  it('returns the path unchanged when the index is not a number', () => {
    expect(anchorOf(goalWithOrgs(1), 'related_orgs.first.name')).toBe('related_orgs.first.name');
  });

  it('returns the path unchanged when the draft has no such rows', () => {
    expect(anchorOf(action, 'related_orgs.0.name')).toBe('related_orgs.0.name');
    expect(anchorOf(goalWithOrgs(1), 'sources.0.url')).toBe('sources.0.url');
  });
});

describe('pathOf', () => {
  it('finds the row of a key at its current index', () => {
    const draft = goalWithOrgs(3);
    const anchor = anchorOf(draft, 'related_orgs.2.name');
    expect(pathOf(draft, anchor)).toBe('related_orgs.2.name');
    const shorter = { ...draft, related_orgs: draft.related_orgs.slice(1) };
    expect(pathOf(shorter, anchor)).toBe('related_orgs.1.name');
  });

  it('finds a whole-row anchor', () => {
    const draft = goalWithOrgs(2);
    const anchor = anchorOf(draft, 'related_orgs.1');
    expect(pathOf({ ...draft, related_orgs: draft.related_orgs.slice(1) }, anchor)).toBe(
      'related_orgs.0',
    );
  });

  it('returns null when no row has the key', () => {
    const draft = goalWithOrgs(2);
    const anchor = anchorOf(draft, 'related_orgs.0.name');
    expect(pathOf({ ...draft, related_orgs: draft.related_orgs.slice(1) }, anchor)).toBeNull();
    expect(pathOf(action, anchor)).toBeNull();
  });

  it.each(['id', 'description', 'link.url', 'related_counties', 'related_orgs.0.name', ''])(
    'returns the anchor %j unchanged when it is not key-based',
    (anchor) => {
      expect(pathOf(goalWithOrgs(1), anchor)).toBe(anchor);
    },
  );

  it('round-trips a project row path', () => {
    expect(pathOf(project, anchorOf(project, 'sources.0.url'))).toBe('sources.0.url');
  });
});

describe('relabel', () => {
  it('renames the row in a message', () => {
    expect(
      relabel(
        'goal',
        'Organisation 2 name: enter a value',
        'related_orgs.1.name',
        'related_orgs.0.name',
      ),
    ).toBe('Organisation 1 name: enter a value');
  });

  it('renames a list item to its group', () => {
    expect(
      relabel(
        'goal',
        'Related project 1: use lowercase letters, numbers and hyphens only',
        'related_project_ids.0',
        'related_project_ids',
      ),
    ).toBe('Related projects: use lowercase letters, numbers and hyphens only');
  });

  it('renames a message that runs on from the label', () => {
    expect(
      relabel(
        'goal',
        'Organisation 1 name must be 160 characters or fewer',
        'related_orgs.0.name',
        'related_orgs.2.name',
      ),
    ).toBe('Organisation 3 name must be 160 characters or fewer');
  });

  it('leaves a message that does not start with the label', () => {
    expect(relabel('goal', 'Enter an id', 'id', 'id')).toBe('Enter an id');
    expect(relabel('goal', 'Something else', 'related_orgs.1.name', 'related_orgs.0.name')).toBe(
      'Something else',
    );
  });

  it('leaves a message whose path did not move', () => {
    expect(relabel('timed_action', 'Link web address: enter a value', 'link.url', 'link.url')).toBe(
      'Link web address: enter a value',
    );
  });
});

describe('anchors across row changes', () => {
  it('keeps each problem on its row when rows are added and removed', () => {
    const saved = goalWithOrgs(2);
    const anchors = ['related_orgs.0.name', 'related_orgs.1.name'].map((path) =>
      anchorOf(saved, path),
    );

    const added = { ...saved, related_orgs: [...saved.related_orgs, emptyRelatedOrgRow()] };
    expect(anchors.map((anchor) => pathOf(added, anchor))).toEqual([
      'related_orgs.0.name',
      'related_orgs.1.name',
    ]);

    const removed = { ...added, related_orgs: added.related_orgs.slice(1) };
    expect(anchors.map((anchor) => pathOf(removed, anchor))).toEqual([null, 'related_orgs.0.name']);
    expect(
      relabel(
        'goal',
        'Organisation 2 name: enter a value',
        'related_orgs.1.name',
        'related_orgs.0.name',
      ),
    ).toBe('Organisation 1 name: enter a value');
  });
});

describe('keepRowKeys', () => {
  const record = (names: string[]) => ({
    id: 'g',
    goal: 'G',
    related_orgs: names.map((name) => ({ name })),
  });

  it('gives each row the key of the row at the same index', () => {
    const previous = toFormDraft('goal', record(['A', 'B'])) as GoalDraft;
    const next = toFormDraft('goal', record(['A', 'B2', 'C'])) as GoalDraft;
    const kept = keepRowKeys(previous, next) as GoalDraft;
    expect(keys(kept).slice(0, 2)).toEqual(keys(previous));
    expect(keys(kept)[2]).toBe(keys(next)[2]);
    expect(kept.related_orgs.map((row) => row.name)).toEqual(['A', 'B2', 'C']);
    expect(new Set(keys(kept)).size).toBe(3);
  });

  it('gives a row the key of the old row with the same content when rows before it are gone', () => {
    const previous = toFormDraft('goal', record(['A', 'B', 'C'])) as GoalDraft;
    const next = toFormDraft('goal', record(['B'])) as GoalDraft;
    expect(keys(keepRowKeys(previous, next) as GoalDraft)).toEqual([keys(previous)[1]]);
  });

  it('keeps a still-invalid row on its key when an invalid row before it is removed', () => {
    const previous = toFormDraft('goal', record(['', 'B', ''])) as GoalDraft;
    previous.related_orgs[0]!.url = 'https://a.example';
    previous.related_orgs[2]!.url = 'https://c.example';
    const anchors = ['related_orgs.0.name', 'related_orgs.2.name'].map((path) =>
      anchorOf(previous, path),
    );
    const next = toFormDraft('goal', {
      ...record([]),
      related_orgs: [{ name: 'B' }, { name: '', url: 'https://c.example' }],
    });
    const kept = keepRowKeys(previous, next) as GoalDraft;
    expect(keys(kept)).toEqual([keys(previous)[1], keys(previous)[2]]);
    expect(anchors.map((anchor) => pathOf(kept, anchor))).toEqual([null, 'related_orgs.1.name']);
  });

  it('lets the keys follow the content when rows are swapped', () => {
    const previous = toFormDraft('goal', record(['A', 'B', 'C'])) as GoalDraft;
    const next = toFormDraft('goal', record(['C', 'B', 'A'])) as GoalDraft;
    const [a, b, c] = keys(previous);
    expect(keys(keepRowKeys(previous, next) as GoalDraft)).toEqual([c, b, a]);
  });

  it('matches a row the form made or edited against the same row read back from the JSON', () => {
    const previous = toFormDraft('goal', record(['A', 'B'])) as GoalDraft;
    previous.related_orgs[1]!.name = 'B edited';
    const added = { ...emptyRelatedOrgRow(), name: 'New', url: 'https://new.example' };
    previous.related_orgs.push(added);
    const [, ...rest] = toRecord(previous).related_orgs as object[];
    const next = toFormDraft('goal', { ...record([]), related_orgs: rest }) as GoalDraft;
    const kept = keepRowKeys(previous, next) as GoalDraft;
    expect(keys(kept)).toEqual(keys(previous).slice(1));
    expect(kept.related_orgs.map((row) => row.name)).toEqual(['B edited', 'New']);
  });

  it('falls back to the row at the same index only when it is not taken', () => {
    const previous = toFormDraft('goal', record(['A', 'B'])) as GoalDraft;
    const next = toFormDraft('goal', record(['B', 'Z', 'Y'])) as GoalDraft;
    const kept = keys(keepRowKeys(previous, next) as GoalDraft);
    expect(kept.slice(0, 2)).toEqual([keys(previous)[1], keys(next)[1]]);
    expect(kept[2]).toBe(keys(next)[2]);
    expect(new Set(kept).size).toBe(3);
  });

  it('gives identical rows the old keys in order', () => {
    const previous = toFormDraft('goal', record(['X', 'X', 'Y'])) as GoalDraft;
    const next = toFormDraft('goal', record(['X', 'Y', 'X'])) as GoalDraft;
    const [x1, x2, y] = keys(previous);
    expect(keys(keepRowKeys(previous, next) as GoalDraft)).toEqual([x1, y, x2]);
  });

  it('follows the content in every project row list', () => {
    const previous = toFormDraft('project', {
      id: 'p',
      title: 'T',
      partners: [{ name: 'P1' }, { name: 'P2' }],
      milestones: [{ title: 'M1' }, { title: 'M2', date: '2026-01-01' }],
      sources: [
        { label: 'S1', url: 'https://s1.example' },
        { label: 'S2', url: 'https://s2.example', last_verified: '2026-01-01' },
      ],
    }) as ProjectDraft;
    const swapped = (rows: object[]) => [rows[1], rows[0]];
    const next = toFormDraft('project', {
      id: 'p',
      title: 'T',
      partners: swapped(previous.base.partners as object[]),
      milestones: swapped(previous.base.milestones as object[]),
      sources: swapped(previous.base.sources as object[]),
    }) as ProjectDraft;
    const kept = keepRowKeys(previous, next) as ProjectDraft;
    for (const list of ['partners', 'milestones', 'sources'] as const) {
      expect(kept[list].map((row) => row.key)).toEqual(
        [...previous[list]].reverse().map((row) => row.key),
      );
    }
  });

  it('keeps the keys of every project row list', () => {
    const next = toFormDraft('project', {
      id: 'p',
      title: 'T2',
      partners: [{ name: 'A2' }],
      milestones: [{ title: 'M2', date: '2026-02-02' }],
      sources: [{ label: 'S2', url: 'https://s2.example' }],
    }) as ProjectDraft;
    const kept = keepRowKeys(project, next) as ProjectDraft;
    expect(kept.partners[0]!.key).toBe(project.partners[0]!.key);
    expect(kept.milestones[0]!.key).toBe(project.milestones[0]!.key);
    expect(kept.sources[0]!.key).toBe(project.sources[0]!.key);
    expect(kept.title).toBe('T2');
    expect(kept.sources[0]!.label).toBe('S2');
  });

  it('keeps an anchored problem on its row across a rebuilt draft', () => {
    const previous = toFormDraft('goal', record(['', 'B'])) as GoalDraft;
    const anchor = anchorOf(previous, 'related_orgs.0.name');
    const next = keepRowKeys(previous, toFormDraft('goal', record(['', 'B', 'C'])));
    expect(pathOf(next, anchor)).toBe('related_orgs.0.name');
  });

  it('returns a draft without rows as it is', () => {
    const next = toFormDraft('timed_action', { goal_id: 'g2' });
    expect(keepRowKeys(action, next)).toBe(next);
  });
});
