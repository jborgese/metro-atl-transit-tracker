import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { restoreGoal } from '$lib/server/content/store';
import { toHttpError } from '$lib/server/content/http';
import type { ApiItemResponse, Goal } from '@/types/content';

export const POST: RequestHandler = async (event) => {
  try {
    const actor = await requireEditorActor(event);
    const restored = await restoreGoal(event.params.id, actor);

    const response: ApiItemResponse<Goal> = { data: restored };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};
