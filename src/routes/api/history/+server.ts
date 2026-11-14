import type { RequestHandler } from '@sveltejs/kit';
import { listHistory } from '#lib/server/content/store.ts';
import { parseLimit, toHttpError } from '#lib/server/content/http.ts';
import type { ApiListResponse, ContentEntityType, ContentHistoryEvent } from '#types/content.ts';

const ENTITY_TYPES: ContentEntityType[] = ['project', 'goal', 'timed_action'];

export const GET: RequestHandler = async (event) => {
  try {
    const rawType = event.url.searchParams.get('entityType');
    const entityType = ENTITY_TYPES.find((type) => type === rawType);
    const entityId = event.url.searchParams.get('entityId') || undefined;
    const limit = parseLimit(event.url.searchParams.get('limit'), 200);

    const history = await listHistory({ entityType, entityId, limit });
    const response: ApiListResponse<ContentHistoryEvent> = {
      data: history,
      meta: { count: history.length },
    };

    return Response.json(response);
  } catch (err) {
    toHttpError(err);
  }
};
