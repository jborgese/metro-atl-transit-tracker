export type EditorEntity = 'project' | 'goal' | 'timed_action';

export interface DatasetConfig {
  title: string;
  tabLabel: string;
  endpoint: string;
}

export const DATASETS: Record<EditorEntity, DatasetConfig> = {
  project: {
    title: 'Project',
    tabLabel: 'Projects',
    endpoint: '/api/projects',
  },
  goal: {
    title: 'Goal',
    tabLabel: 'Goals',
    endpoint: '/api/goals',
  },
  timed_action: {
    title: 'Action',
    tabLabel: 'Actions',
    endpoint: '/api/timed-actions',
  },
};

export function isEditorEntity(value: string): value is EditorEntity {
  return Object.hasOwn(DATASETS, value);
}
