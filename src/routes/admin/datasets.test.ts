import { describe, expect, it } from 'vitest';
import { emptyRecord } from '../../lib/content/formModel/draft';
import { DATASETS, isEditorEntity } from './datasets';

describe('DATASETS', () => {
  it('routes each dataset to its own endpoint', () => {
    expect(DATASETS.project.endpoint).toBe('/api/projects');
    expect(DATASETS.goal.endpoint).toBe('/api/goals');
    expect(DATASETS.timed_action.endpoint).toBe('/api/timed-actions');
  });

  it('describes the Actions tab', () => {
    expect(DATASETS.timed_action.tabLabel).toBe('Actions');
    expect(DATASETS.timed_action.title).toBe('Action');
  });

  it('describes each dataset by its title, tab label and endpoint only', () => {
    for (const config of Object.values(DATASETS)) {
      expect(Object.keys(config).sort()).toEqual(['endpoint', 'tabLabel', 'title']);
    }
  });

  it('has no template property', () => {
    for (const config of Object.values(DATASETS)) {
      expect(config).not.toHaveProperty('template');
    }
  });

  it('starts each kind from emptyRecord', () => {
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
    expect(emptyRecord('timed_action')).toEqual({
      goal_id: '',
      description: '',
      link: null,
      location: null,
      expires_on: '',
    });
  });

  it('recognizes stored entity types only', () => {
    expect(isEditorEntity('timed_action')).toBe(true);
    expect(isEditorEntity('action')).toBe(false);
  });
});
