import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { createProject, listProjects } from '$lib/server/content/store';
import { parseIncludeArchived, readJsonBody, toHttpError } from '$lib/server/content/http';
import type { ApiListResponse, ApiItemResponse, Project } from '@/types/content';

export const GET: RequestHandler = async (event) => {
  try {
    const includeArchived = parseIncludeArchived(event.url.searchParams.get('includeArchived'));
    const projects = await listProjects(event, { includeArchived });

    const response: ApiListResponse<Project> = {
      data: projects,
      meta: { count: projects.length },
    };

    return json(response);
  } catch (err) {
    toHttpError(err);
  }
};

export const POST: RequestHandler = async (event) => {
  try {
    const actor = await requireEditorActor(event, 'content:edit');
    const payload = await readJsonBody(event);
    const created = await createProject(event, payload, actor);

    const response: ApiItemResponse<Project> = { data: created };
    return json(response, { status: 201 });
  } catch (err) {
    toHttpError(err);
  }
};
