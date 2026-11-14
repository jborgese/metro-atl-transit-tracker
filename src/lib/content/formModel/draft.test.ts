import { describe, expect, it } from 'vitest';
import liveProjects from './fixtures/live-projects.json';
import liveGoals from './fixtures/live-goals.json';
import liveTimedActions from './fixtures/live-timed-actions.json';
import { emptyRecord, emptySourceRow, toFormDraft, toRecord } from './draft';
import type { ContentRecord, GoalDraft, ProjectDraft, TimedActionDraft } from './types';

const projects: ContentRecord[] = liveProjects;
const goals: ContentRecord[] = liveGoals;
const timedActions: ContentRecord[] = liveTimedActions;
const firstProject: ContentRecord = projects[0] ?? {};

describe.each([
  ['project', projects],
  ['goal', goals],
  ['timed_action', timedActions],
] as const)('%s round trip', (kind, records) => {
  it.each(records.map((r) => [String(r.id), r] as const))('%s is unchanged', (_id, record) => {
    expect(toRecord(toFormDraft(kind, record))).toEqual(record);
    expect(Object.keys(toRecord(toFormDraft(kind, record)))).toEqual(Object.keys(record));
  });
});

it('keeps values the lists do not know', () => {
  const odd = {
    id: 'p',
    title: 'T',
    status: 'on-hold',
    geo_scope: 'statewide',
    modes: ['ferry'],
    related_counties: ['13999'],
    start_date: 'Spring 2027',
    extra: { a: 1 },
  };
  expect(toRecord(toFormDraft('project', odd))).toEqual(odd);
});
it('writes null for a cleared date and nothing for a date that was never there', () => {
  const draft = toFormDraft('project', {
    id: 'p',
    title: 'T',
    start_date: '2026-01-01',
  }) as ProjectDraft;
  draft.start_date = '';
  expect(toRecord(draft)).toEqual({ id: 'p', title: 'T', start_date: null });
  expect(toRecord(toFormDraft('project', { id: 'p', title: 'T' }))).toEqual({
    id: 'p',
    title: 'T',
  });
});
it('clears goal text to an empty string', () => {
  const draft = toFormDraft('goal', { id: 'g', goal: 'G', actions: 'Old' }) as GoalDraft;
  draft.actions = '';
  expect(toRecord(draft).actions).toBe('');
});
it('keeps unknown keys inside rows and omits a blanked link', () => {
  const draft = toFormDraft('goal', {
    id: 'g',
    goal: 'G',
    related_orgs: [{ name: 'A', url: 'https://a.example', role: 'lead', contact_info: '' }],
  }) as GoalDraft;
  expect(draft.related_orgs.length).toBeGreaterThan(0);
  for (const org of draft.related_orgs) org.url = '';
  expect(toRecord(draft).related_orgs).toEqual([{ name: 'A', role: 'lead', contact_info: '' }]);
});
it('drops an all-blank new row and keeps a half-filled one', () => {
  const draft = toFormDraft('project', { id: 'p', title: 'T', sources: [] }) as ProjectDraft;
  draft.sources.push(emptySourceRow(), { ...emptySourceRow(), label: 'Only a label' });
  expect(toRecord(draft).sources).toEqual([{ label: 'Only a label' }]);
});
it('turns a blank link and location into null and keeps a half-filled link', () => {
  const draft = toFormDraft('timed_action', emptyRecord('timed_action')) as TimedActionDraft;
  expect(toRecord(draft)).toEqual({
    goal_id: '',
    description: '',
    link: null,
    location: null,
    expires_on: '',
  });
  draft.link.label = 'Go';
  expect(toRecord(draft).link).toEqual({ label: 'Go', url: '' });
});
it('gives rows unique keys', () => {
  const draft = toFormDraft('project', firstProject) as ProjectDraft;
  const keys = [...draft.sources, ...draft.milestones, ...draft.partners].map((r) => r.key);
  expect(keys.length).toBeGreaterThan(0);
  expect(new Set(keys).size).toBe(keys.length);
});
it('starts new records from the defaults', () => {
  expect(emptyRecord('project')).toEqual({
    id: '',
    title: '',
    summary: '',
    status: 'planning',
    modes: [],
    related_counties: [],
    sources: [],
  });
  expect(emptyRecord('goal')).toEqual({
    id: '',
    goal: '',
    actions: '',
    related_project_ids: [],
    related_counties: [],
    related_orgs: [],
  });
});
it('does not mutate the record or the draft', () => {
  const record = structuredClone(firstProject);
  const draft = toFormDraft('project', record) as ProjectDraft;
  draft.title = 'Changed';
  expect(draft.sources.length).toBeGreaterThan(0);
  for (const source of draft.sources) source.url = '';
  const before = structuredClone(draft);
  toRecord(draft);
  expect(record).toEqual(firstProject);
  expect(draft).toEqual(before);
});

const odd = (kind: 'project' | 'goal' | 'timed_action', record: ContentRecord) =>
  [kind, JSON.stringify(record), record] as const;

describe.each([
  odd('project', {
    id: 'p',
    title: 'T',
    summary: null,
    status: null,
    geo_scope: null,
    start_date: null,
    end_date: null,
    lead_org: null,
    partners: null,
    milestones: null,
    sources: null,
    modes: null,
    related_counties: null,
  }),
  odd('project', {
    id: 'p',
    title: 'T',
    milestones: [
      { title: 'm' },
      { title: 'm', date: null, status: 'x' },
      { name: 'm', when: 'x' },
      {},
      { title: 5, date: ['x'] },
    ],
  }),
  odd('project', {
    id: 'p',
    title: 'T',
    summary: '',
    status: '',
    geo_scope: '',
    start_date: '',
    end_date: '',
  }),
  odd('project', { id: 'p', title: 'T', lead_org: {} }),
  odd('project', { id: 'p', title: 'T', lead_org: { url: 'https://a.example' } }),
  odd('project', { id: 'p', title: 'T', lead_org: { name: 'A', url: '' } }),
  odd('project', { id: 'p', title: 'T', lead_org: { name: 'A', url: null, role: 'x' } }),
  odd('project', {
    id: 'p',
    title: 7,
    summary: { a: 1 },
    modes: 'bus',
    related_counties: [1, null],
    sources: [{ url: 'https://a.example' }, { label: 'L', url: null, last_verified: null }],
    partners: [{ url: 'u' }],
  }),
  odd('goal', {
    id: 'g',
    goal: 'G',
    status_related_projects: null,
    actions: null,
    related_orgs: null,
    related_project_ids: null,
    related_counties: null,
  }),
  odd('goal', {
    id: 'g',
    goal: 'G',
    related_orgs: [{ name: 'A', url: null, contact_info: null }, {}],
  }),
  odd('timed_action', {
    goal_id: 'g',
    description: 'D',
    expires_on: null,
    link: { label: 'x', url: 'y', extra: 1 },
    location: {},
  }),
  odd('timed_action', { goal_id: 'g', description: 'D', expires_on: '2026-12-01' }),
])('untouched save of odd %s record', (kind, label, record) => {
  it(label, () => {
    const result = toRecord(toFormDraft(kind, record));
    expect(result).toEqual(record);
    expect(JSON.stringify(result)).toBe(JSON.stringify(record));
  });
});

it('never writes a blank status or geo_scope', () => {
  const draft = toFormDraft('project', { id: 'p', title: 'T' }) as ProjectDraft;
  draft.status = '';
  draft.geo_scope = '';
  const result = toRecord(draft);
  expect(result).not.toHaveProperty('status');
  expect(result).not.toHaveProperty('geo_scope');
  const kept = toFormDraft('project', { id: 'p', title: 'T', status: 'planning' }) as ProjectDraft;
  kept.status = '';
  expect(toRecord(kept).status).toBe('planning');
});

it('edits one milestone and leaves an odd one as stored', () => {
  const draft = toFormDraft('project', {
    id: 'p',
    title: 'T',
    milestones: [{ title: 'a', date: null, note: 'n' }, { title: 'b' }],
  }) as ProjectDraft;
  const second = draft.milestones[1];
  expect(second).toBeDefined();
  if (second) second.title = 'c';
  expect(toRecord(draft).milestones).toEqual([
    { title: 'a', date: null, note: 'n' },
    { title: 'c' },
  ]);
});

it('keeps other rows verbatim when a row is removed or a blank row is added', () => {
  const record = {
    id: 'p',
    title: 'T',
    milestones: [{ title: 'a', date: null, note: 'n' }, { title: 'b' }, { title: 'c', date: 'd' }],
  };
  const removed = toFormDraft('project', record) as ProjectDraft;
  removed.milestones.splice(1, 1);
  expect(toRecord(removed).milestones).toEqual([record.milestones[0], record.milestones[2]]);
  const added = toFormDraft('project', record) as ProjectDraft;
  added.milestones.push({ key: 'new', original: {}, title: '', date: '' });
  expect(toRecord(added)).toEqual(record);
});

it('shares no object between the input, the draft and the result', () => {
  const record = {
    id: 'p',
    title: 'T',
    extra: { a: [1] },
    sources: [{ label: 'L', url: 'https://a.example', tags: ['x'] }],
  };
  const draft = toFormDraft('project', record) as ProjectDraft;
  const snapshot = structuredClone(draft);
  const result = toRecord(draft) as { extra: { a: number[] }; sources: { tags: string[] }[] };
  result.extra.a.push(2);
  result.sources[0]?.tags.push('y');
  expect(draft).toEqual(snapshot);
  const changed = toRecord({ ...draft, title: 'U' }) as { extra: { a: number[] } };
  changed.extra.a.push(3);
  expect(draft).toEqual(snapshot);
  (draft.base.extra as { a: number[] }).a.push(9);
  expect(record.extra.a).toEqual([1]);
});

const deepProxy = <T extends object>(value: T): T =>
  new Proxy(value, {
    get(target, key, receiver) {
      const got: unknown = Reflect.get(target, key, receiver);
      return typeof got === 'object' && got !== null ? deepProxy(got) : got;
    },
  });

it('works on deeply proxied records and drafts', () => {
  expect(firstProject.sources).toBeDefined();
  const plainDraft = toFormDraft('project', firstProject);
  const proxied = toFormDraft('project', deepProxy(firstProject));
  expect(toRecord(proxied)).toEqual(firstProject);
  expect(toRecord(deepProxy(plainDraft))).toEqual(toRecord(plainDraft));
  expect(toRecord(deepProxy(plainDraft))).toEqual(firstProject);
});
