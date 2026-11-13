import type { RequestHandler } from '@sveltejs/kit';
import { buildOpenApiDocument } from '#lib/server/openapi/spec.ts';

let cached: ReturnType<typeof buildOpenApiDocument> | null = null;

export const GET: RequestHandler = (event) => {
  if (!cached) {
    cached = buildOpenApiDocument(`${event.url.origin}/`);
  }
  return Response.json(cached, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
};
