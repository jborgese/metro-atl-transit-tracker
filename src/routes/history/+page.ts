import type { PageLoad } from './$types';
import type { ApiListResponse, ContentHistoryEvent } from '@/types/content';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const res = await fetch('/api/history?limit=500');
    if (!res.ok) {
      return { history: [] as ContentHistoryEvent[] };
    }

    const payload = (await res.json()) as ApiListResponse<ContentHistoryEvent> | ContentHistoryEvent[];
    if (Array.isArray(payload)) {
      return { history: payload };
    }

    return { history: Array.isArray(payload.data) ? payload.data : [] };
  } catch {
    return { history: [] as ContentHistoryEvent[] };
  }
};
