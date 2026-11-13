import type { Goal, Project } from '#types/content.ts';

export function getRelatedGoals(project: Project, goals: Goal[]): Goal[] {
  if (!project?.id) return [];
  return goals.filter((goal) => goal.related_project_ids?.includes(project.id));
}
