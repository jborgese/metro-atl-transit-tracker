import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditorActor } from '$lib/server/auth/editor';
import { ContentStoreError } from './errors';
import { parseIncludeArchived, readJsonBody, toHttpError } from './http';
import type { StoreEvent } from './mappers';
import type { ApiItemResponse, ApiListResponse } from '@/types/content';

export interface ContentStore<T> {
  list(event: StoreEvent, options?: { includeArchived?: boolean }): Promise<T[]>;
  getById(event: StoreEvent, id: string, options?: { includeArchived?: boolean }): Promise<T>;
  create(event: StoreEvent, input: unknown, actor: string): Promise<T>;
  update(event: StoreEvent, id: string, patchInput: unknown, actor: string): Promise<T>;
  archive(event: StoreEvent, id: string, actor: string): Promise<T>;
  restore(event: StoreEvent, id: string, actor: string): Promise<T>;
}

function requireId(value: string | undefined): string {
  if (!value) {
    throw new ContentStoreError(400, 'missing id');
  }
  return value;
}

export function makeCollectionHandlers<T>(
  store: Pick<ContentStore<T>, 'list' | 'create'>,
): { GET: RequestHandler; POST: RequestHandler } {
  const GET: RequestHandler = async (event) => {
    try {
      const includeArchived = parseIncludeArchived(event.url.searchParams.get('includeArchived'));
      const items = await store.list(event, { includeArchived });
      const response: ApiListResponse<T> = { data: items, meta: { count: items.length } };
      return json(response);
    } catch (err) {
      toHttpError(err);
    }
  };

  const POST: RequestHandler = async (event) => {
    try {
      const actor = await requireEditorActor(event, 'content:edit');
      const payload = await readJsonBody(event);
      const created = await store.create(event, payload, actor);
      const response: ApiItemResponse<T> = { data: created };
      return json(response, { status: 201 });
    } catch (err) {
      toHttpError(err);
    }
  };

  return { GET, POST };
}

export function makeItemHandlers<T>(
  store: Pick<ContentStore<T>, 'getById' | 'update' | 'archive'>,
): { GET: RequestHandler; PATCH: RequestHandler; DELETE: RequestHandler } {
  const GET: RequestHandler = async (event) => {
    try {
      const id = requireId(event.params.id);
      const includeArchivedParam = event.url.searchParams.get('includeArchived');
      const includeArchived =
        includeArchivedParam === null ? true : parseIncludeArchived(includeArchivedParam);
      const item = await store.getById(event, id, { includeArchived });
      const response: ApiItemResponse<T> = { data: item };
      return json(response);
    } catch (err) {
      toHttpError(err);
    }
  };

  const PATCH: RequestHandler = async (event) => {
    try {
      const id = requireId(event.params.id);
      const actor = await requireEditorActor(event, 'content:edit');
      const payload = await readJsonBody(event);
      const updated = await store.update(event, id, payload, actor);
      const response: ApiItemResponse<T> = { data: updated };
      return json(response);
    } catch (err) {
      toHttpError(err);
    }
  };

  const DELETE: RequestHandler = async (event) => {
    try {
      const id = requireId(event.params.id);
      const actor = await requireEditorActor(event, 'content:archive');
      const archived = await store.archive(event, id, actor);
      const response: ApiItemResponse<T> = { data: archived };
      return json(response);
    } catch (err) {
      toHttpError(err);
    }
  };

  return { GET, PATCH, DELETE };
}

export function makeRestoreHandler<T>(
  store: Pick<ContentStore<T>, 'restore'>,
): { POST: RequestHandler } {
  const POST: RequestHandler = async (event) => {
    try {
      const id = requireId(event.params.id);
      const actor = await requireEditorActor(event, 'content:archive');
      const restored = await store.restore(event, id, actor);
      const response: ApiItemResponse<T> = { data: restored };
      return json(response);
    } catch (err) {
      toHttpError(err);
    }
  };

  return { POST };
}
