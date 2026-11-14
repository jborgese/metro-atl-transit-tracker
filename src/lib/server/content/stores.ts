import type { Goal, Project, TimedAction } from '#types/content.ts';
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
import {
  archiveTimedAction,
  createTimedAction,
  getTimedActionById,
  listTimedActions,
  restoreTimedAction,
  updateTimedAction,
} from './timedActions';

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

export const timedActionStore: ContentStore<TimedAction> = {
  list: listTimedActions,
  getById: getTimedActionById,
  create: createTimedAction,
  update: updateTimedAction,
  archive: archiveTimedAction,
  restore: restoreTimedAction,
};
