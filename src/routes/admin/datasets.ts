export type EditorEntity = 'project' | 'goal' | 'timed_action';

export interface DatasetConfig {
  title: string;
  tabLabel: string;
  endpoint: string;
  requiresClientId: boolean;
}

export const DATASETS: Record<EditorEntity, DatasetConfig> = {
  project: {
    title: 'Project',
    tabLabel: 'Projects',
    endpoint: '/api/projects',
    requiresClientId: true,
  },
  goal: {
    title: 'Goal',
    tabLabel: 'Goals',
    endpoint: '/api/goals',
    requiresClientId: true,
  },
  timed_action: {
    title: 'Action',
    tabLabel: 'Actions',
    endpoint: '/api/timed-actions',
    requiresClientId: false,
  },
};

export function isEditorEntity(value: string): value is EditorEntity {
  return Object.hasOwn(DATASETS, value);
}
