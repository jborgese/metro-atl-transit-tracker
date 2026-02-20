import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const TOKEN_HEADER = 'x-editor-token';
const ACTOR_HEADER = 'x-editor-actor';
const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

type AccessConfig = {
  issuer: string;
  audiences: string[];
  jwks: ReturnType<typeof createRemoteJWKSet>;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function safeTokenMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseCsv(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeTeamDomain(value: string | undefined) {
  if (!value) {
    return '';
  }
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function getAccessConfig(): AccessConfig | null {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audiences = parseCsv(env.CF_ACCESS_AUD);

  if (!teamDomain || audiences.length === 0) {
    return null;
  }

  const issuer = `https://${teamDomain}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(certsUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksCache.set(certsUrl, jwks);
  }

  return {
    issuer,
    audiences,
    jwks,
  };
}

function actorFromAccessPayload(payload: JWTPayload) {
  const email = payload.email;
  if (typeof email === 'string' && email.trim().length > 0) {
    return email.trim();
  }

  const commonName = payload.common_name;
  if (typeof commonName === 'string' && commonName.trim().length > 0) {
    return commonName.trim();
  }

  const name = payload.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim();
  }

  const sub = payload.sub;
  if (typeof sub === 'string' && sub.trim().length > 0) {
    return sub.trim();
  }

  return 'access-user';
}

async function requireAccessActor(jwtAssertion: string, config: AccessConfig) {
  const { payload } = await jwtVerify(jwtAssertion, config.jwks, {
    issuer: [config.issuer, `${config.issuer}/`],
    audience: config.audiences,
  });

  return actorFromAccessPayload(payload);
}

export async function requireEditorActor(event: RequestEvent) {
  const accessConfig = getAccessConfig();
  const jwtAssertion = event.request.headers.get(ACCESS_JWT_HEADER)?.trim();

  if (jwtAssertion) {
    if (!accessConfig) {
      throw error(
        503,
        'Access auth is not configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.'
      );
    }

    try {
      return await requireAccessActor(jwtAssertion, accessConfig);
    } catch {
      throw error(401, 'Unauthorized');
    }
  }

  const configuredToken = env.EDITOR_API_TOKEN?.trim();
  if (!configuredToken) {
    if (accessConfig) {
      throw error(401, 'Unauthorized');
    }

    throw error(
      503,
      'Editor auth is not configured. Set Access env (CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD) or EDITOR_API_TOKEN.'
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
