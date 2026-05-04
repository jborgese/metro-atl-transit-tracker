import type { Goal, Project } from '@/types/content';
import type { ContentStore } from './handlers';
import {
  archiveGoal,
  archiveProject,
  createGoal,
  createProject,
  getGoalById,
  getProjectById,
  listGoals,
  listProjects,
  restoreGoal,
  restoreProject,
  updateGoal,
  updateProject,
} from './service';

export const projectStore: ContentStore<Project> = {
  list: listProjects,
  getById: getProjectById,
  create: createProject,
  update: updateProject,
  archive: archiveProject,
  restore: restoreProject,
};

export const goalStore: ContentStore<Goal> = {
  list: listGoals,
  getById: getGoalById,
  create: createGoal,
  update: updateGoal,
  archive: archiveGoal,
  restore: restoreGoal,
};
