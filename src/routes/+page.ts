import projectsFallback from '../data/geo/projects-metadata.json';
import goalsFallback from '../data/geo/goals-metadata.json';
import type { PageLoad } from './$types';
import type { ApiListResponse, Goal, Project } from '@/types/content';

type LoadFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function loadCollection<T>(
  fetchFn: LoadFetch,
  url: string,
  fallback: T[]
): Promise<{ data: T[]; usedFallback: boolean }> {
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return { data: fallback, usedFallback: true };
    }

    const payload = (await response.json()) as ApiListResponse<T> | T[];
    if (Array.isArray(payload)) {
      return { data: payload, usedFallback: false };
    }

    if (payload && Array.isArray(payload.data)) {
      return { data: payload.data, usedFallback: false };
    }

    return { data: fallback, usedFallback: true };
  } catch {
    return { data: fallback, usedFallback: true };
  }
}

export const load: PageLoad = async ({ fetch }) => {
  const [projects, goals] = await Promise.all([
    loadCollection<Project>(fetch, '/api/projects', projectsFallback as Project[]),
    loadCollection<Goal>(fetch, '/api/goals', goalsFallback as Goal[]),
  ]);

  return {
    projects: projects.data,
    goals: goals.data,
    usingFallback: projects.usedFallback || goals.usedFallback,
  };
};
