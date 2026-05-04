import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAuthenticatedIdentity } from '$lib/server/auth/editor';
import { ContentStoreError } from '$lib/server/content/errors';
import { readJsonBody, toHttpError } from '$lib/server/content/http';
import { deleteProfile, getProfile, upsertProfile } from '$lib/server/content/profiles';

interface MeResponse {
  identity: string;
  actor: string;
  display_name: string | null;
}

export const GET: RequestHandler = async (event) => {
  try {
    const { actor, identity } = await requireAuthenticatedIdentity(event);
    const profile = await getProfile(event, identity);
    const body: { data: MeResponse } = {
      data: {
        identity,
        actor,
        display_name: profile?.display_name ?? null,
      },
    };
    return json(body);
  } catch (err) {
    toHttpError(err);
  }
};

export const PUT: RequestHandler = async (event) => {
  try {
    const { actor, identity } = await requireAuthenticatedIdentity(event);
    const payload = await readJsonBody(event);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ContentStoreError(400, 'request body must be a JSON object');
    }
    const candidate = (payload as { display_name?: unknown }).display_name;
    if (candidate !== null && candidate !== undefined && typeof candidate !== 'string') {
      throw new ContentStoreError(400, 'display_name must be a string or null');
    }

    let displayName: string | null;
    if (candidate === null || candidate === undefined || candidate.trim().length === 0) {
      await deleteProfile(event, identity);
      displayName = null;
    } else {
      const profile = await upsertProfile(event, identity, candidate);
      displayName = profile.display_name;
    }

    const body: { data: MeResponse } = {
      data: { identity, actor, display_name: displayName },
    };
    return json(body);
  } catch (err) {
    toHttpError(err);
  }
};
