import { describe, expect, it } from 'vitest';
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
    expect(DATASETS.timed_action.requiresClientId).toBe(false);
    expect(DATASETS.project.requiresClientId).toBe(true);
    expect(DATASETS.timed_action.template).toEqual({
      goal_id: '',
      description: '',
      link: { label: '', url: '' },
      location: { label: '', address: '' },
      expires_on: '',
    });
  });

  it('recognises stored entity types only', () => {
    expect(isEditorEntity('timed_action')).toBe(true);
    expect(isEditorEntity('action')).toBe(false);
  });
});
