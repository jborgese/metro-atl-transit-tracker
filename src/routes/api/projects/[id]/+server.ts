import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import {
  archiveProject,
  getProjectById,
  updateProject,
} from '$lib/server/content/store';
import { parseIncludeArchived, toHttpError } from '$lib/server/content/http';
import type { ApiItemResponse, Project } from '@/types/content';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const includeArchivedParam = url.searchParams.get('includeArchived');
    const includeArchived =
      includeArchivedParam === null ? true : parseIncludeArchived(includeArchivedParam);
    const project = await getProjectById(params.id, { includeArchived });

    const response: ApiItemResponse<Project> = { data: project };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const PATCH: RequestHandler = async (event) => {
  try {
    const actor = requireEditorActor(event);
    const payload = await event.request.json();
    const updated = await updateProject(event.params.id, payload, actor);

    const response: ApiItemResponse<Project> = { data: updated };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const DELETE: RequestHandler = async (event) => {
  try {
    const actor = requireEditorActor(event);
    const archived = await archiveProject(event.params.id, actor);

    const response: ApiItemResponse<Project> = { data: archived };
    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};
