import { json, type RequestHandler } from '@sveltejs/kit';
import { listHistory } from '$lib/server/content/store';
import { parseLimit, toHttpError } from '$lib/server/content/http';
import type { ApiListResponse, ContentEntityType, ContentHistoryEvent } from '@/types/content';

export const GET: RequestHandler = async (event) => {
  try {
    const rawType = event.url.searchParams.get('entityType');
    const entityType: ContentEntityType | undefined =
      rawType === 'project' || rawType === 'goal' ? rawType : undefined;
    const entityId = event.url.searchParams.get('entityId') || undefined;
    const limit = parseLimit(event.url.searchParams.get('limit'), 200);

    const history = await listHistory(event, { entityType, entityId, limit });
    const response: ApiListResponse<ContentHistoryEvent> = {
      data: history,
      meta: { count: history.length },
    };

    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};
