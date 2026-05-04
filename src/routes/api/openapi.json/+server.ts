import { json, type RequestHandler } from '@sveltejs/kit';
import { buildOpenApiDocument } from '$lib/server/openapi/spec';

let cached: ReturnType<typeof buildOpenApiDocument> | null = null;

export const GET: RequestHandler = (event) => {
  if (!cached) {
    cached = buildOpenApiDocument(`${event.url.origin}/`);
  }
  return json(cached, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
};
