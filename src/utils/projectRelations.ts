import type { Goal, Project } from '@/types/content';

export function getRelatedGoals(project: Project, goals: Goal[]): Goal[] {
  if (!project?.id) return [];
  return goals.filter((goal) => goal.related_project_ids?.includes(project.id));
}
