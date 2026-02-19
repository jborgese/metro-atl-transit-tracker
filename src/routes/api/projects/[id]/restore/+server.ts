import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { restoreProject } from '$lib/server/content/store';
import { toHttpError } from '$lib/server/content/http';
import type { ApiItemResponse, Project } from '@/types/content';

export const POST: RequestHandler = async (event) => {
  try {
    const actor = requireEditorActor(event);
    const restored = await restoreProject(event.params.id, actor);

    const response: ApiItemResponse<Project> = { data: restored };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};
