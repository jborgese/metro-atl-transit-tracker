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
  for (const source of draft.sources) source.url = '';
  const before = structuredClone(draft);
  toRecord(draft);
  expect(record).toEqual(firstProject);
  expect(draft).toEqual(before);
});
