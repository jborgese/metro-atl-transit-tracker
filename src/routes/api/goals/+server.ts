import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { createGoal, listGoals } from '$lib/server/content/store';
import { parseIncludeArchived, toHttpError } from '$lib/server/content/http';
import type { ApiItemResponse, ApiListResponse, Goal } from '@/types/content';

export const GET: RequestHandler = async (event) => {
  try {
    const includeArchived = parseIncludeArchived(event.url.searchParams.get('includeArchived'));
    const goals = await listGoals(event, { includeArchived });

    const response: ApiListResponse<Goal> = {
      data: goals,
      meta: { count: goals.length },
    };

    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const POST: RequestHandler = async (event) => {
  try {
    const actor = await requireEditorActor(event);
    const payload = await event.request.json();
    const created = await createGoal(event, payload, actor);

    const response: ApiItemResponse<Goal> = { data: created };
    return json(response, { status: 201 });
  } catch (err) {
    toHttpError(err);
  }
};
