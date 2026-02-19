import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';

const TOKEN_HEADER = 'x-editor-token';
const ACTOR_HEADER = 'x-editor-actor';

function safeTokenMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireEditorActor(event: RequestEvent) {
  const configuredToken = env.EDITOR_API_TOKEN;
  if (!configuredToken || configuredToken.trim().length === 0) {
    throw error(
      503,
      'Editor auth is not configured. Set EDITOR_API_TOKEN to enable write operations.'
    );
  }

  const providedToken =
    event.request.headers.get(TOKEN_HEADER) ||
    event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!providedToken || !safeTokenMatch(providedToken, configuredToken)) {
    throw error(401, 'Unauthorized');
  }

  const actor = event.request.headers.get(ACTOR_HEADER);
  return actor && actor.trim().length > 0 ? actor.trim() : 'editor';
}
