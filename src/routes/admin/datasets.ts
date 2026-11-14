export type EditorEntity = 'project' | 'goal' | 'timed_action';

export interface DatasetConfig {
  title: string;
  tabLabel: string;
  endpoint: string;
  requiresClientId: boolean;
  template: Record<string, unknown>;
}

export const DATASETS: Record<EditorEntity, DatasetConfig> = {
  project: {
    title: 'Project',
    tabLabel: 'Projects',
    endpoint: '/api/projects',
    requiresClientId: true,
    template: {
      id: '',
      title: '',
      summary: '',
      status: 'planning',
      modes: [],
      related_counties: [],
      sources: [],
    },
  },
  goal: {
    title: 'Goal',
    tabLabel: 'Goals',
    endpoint: '/api/goals',
    requiresClientId: true,
    template: {
      id: '',
      goal: '',
      actions: '',
      related_project_ids: [],
      related_counties: [],
      related_orgs: [],
    },
  },
  timed_action: {
    title: 'Action',
    tabLabel: 'Actions',
    endpoint: '/api/timed-actions',
    requiresClientId: false,
    template: {
      goal_id: '',
      description: '',
      link: { label: '', url: '' },
      location: { label: '', address: '' },
      expires_on: '',
    },
  },
};

export function isEditorEntity(value: string): value is EditorEntity {
  return Object.hasOwn(DATASETS, value);
}
