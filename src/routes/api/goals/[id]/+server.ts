import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { archiveGoal, getGoalById, updateGoal } from '$lib/server/content/store';
import { parseIncludeArchived, toHttpError } from '$lib/server/content/http';
import type { ApiItemResponse, Goal } from '@/types/content';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const includeArchivedParam = url.searchParams.get('includeArchived');
    const includeArchived =
      includeArchivedParam === null ? true : parseIncludeArchived(includeArchivedParam);
    const goal = await getGoalById(params.id, { includeArchived });

    const response: ApiItemResponse<Goal> = { data: goal };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const PATCH: RequestHandler = async (event) => {
  try {
    const actor = requireEditorActor(event);
    const payload = await event.request.json();
    const updated = await updateGoal(event.params.id, payload, actor);

    const response: ApiItemResponse<Goal> = { data: updated };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const DELETE: RequestHandler = async (event) => {
  try {
    const actor = requireEditorActor(event);
    const archived = await archiveGoal(event.params.id, actor);

    const response: ApiItemResponse<Goal> = { data: archived };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};
