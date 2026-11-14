import { describe, expect, it } from 'vitest';
import { toFormDraft } from './draft';
import { hiddenKeys } from './hiddenKeys';

const managed = {
  provenance: { updated_by: 'AB' },
  is_archived: false,
  archived_at: null,
  archived_by: null,
};

describe('hiddenKeys', () => {
  it('lists the keys the project form does not show, in stored order', () => {
    const draft = toFormDraft('project', {
      notes: 'n',
      id: 'p',
      title: 'T',
      'Extra Key': ['x'],
      sources: [],
      extra: 1,
    });
    expect(hiddenKeys(draft)).toEqual(['notes', 'Extra Key', 'extra']);
  });

  it('lists the keys the goal form does not show', () => {
    const draft = toFormDraft('goal', { id: 'g', goal: 'G', notes: 'n', title: 'not a goal key' });
    expect(hiddenKeys(draft)).toEqual(['notes', 'title']);
  });

  it('skips the id, every known field and the server-managed fields', () => {
    const project = toFormDraft('project', {
      id: 'p',
      title: 'T',
      summary: 'S',
      status: 'planning',
      geo_scope: 'local',
      start_date: null,
      end_date: '2027-01-01',
      modes: [],
      related_counties: [],
      lead_org: { name: 'L' },
      partners: [],
      milestones: [],
      sources: [],
      ...managed,
    });
    const goal = toFormDraft('goal', {
      id: 'g',
      goal: 'G',
      status_related_projects: '',
      actions: '',
      related_counties: [],
      related_project_ids: [],
      related_orgs: [],
      ...managed,
    });
    expect(hiddenKeys(project)).toEqual([]);
    expect(hiddenKeys(goal)).toEqual([]);
  });

  it('judges each key against its own record type', () => {
    const action = toFormDraft('timed_action', {
      id: 'ta-1',
      goal_id: 'g',
      description: 'D',
      expires_on: '2026-12-01',
      link: null,
      location: null,
      title: 'x',
      ...managed,
    });
    expect(hiddenKeys(action)).toEqual(['title']);
  });

  it('does not count a name that only an object prototype has', () => {
    const draft = toFormDraft('project', { id: 'p', title: 'T', toString: 'x', constructor: 1 });
    expect(hiddenKeys(draft)).toEqual(['toString', 'constructor']);
  });
});
