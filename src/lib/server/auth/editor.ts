import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
const RBAC_ADMINS_ENV = 'CF_ACCESS_RBAC_ADMINS';
const RBAC_EDITORS_ENV = 'CF_ACCESS_RBAC_EDITORS';
const RBAC_ARCHIVERS_ENV = 'CF_ACCESS_RBAC_ARCHIVERS';

export type EditorPermission = 'content:edit' | 'content:archive' | 'admin:users';

type AccessConfig = {
  issuer: string;
  audiences: string[];
  jwks: ReturnType<typeof createRemoteJWKSet>;
};

type RbacConfig = {
  enabled: boolean;
  admins: Set<string>;
  editors: Set<string>;
  archivers: Set<string>;
};

type AccessIdentity = {
  actor: string;
  identity: string | null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

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

function parseIdentityCsv(value: string | undefined) {
  if (!value) {
    return new Set<string>();
  }

  const items = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  return new Set(items);
}

function getRbacConfig(): RbacConfig {
  const admins = parseIdentityCsv(env[RBAC_ADMINS_ENV]);
  const editors = parseIdentityCsv(env[RBAC_EDITORS_ENV]);
  const archivers = parseIdentityCsv(env[RBAC_ARCHIVERS_ENV]);
  const enabled = admins.size > 0 || editors.size > 0 || archivers.size > 0;

  return {
    enabled,
    admins,
    editors,
    archivers,
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

function identityFromAccessPayload(payload: JWTPayload) {
  const email = payload.email;
  if (typeof email === 'string' && email.trim().length > 0) {
    return email.trim().toLowerCase();
  }

  const sub = payload.sub;
  if (typeof sub === 'string' && sub.trim().length > 0) {
    return sub.trim().toLowerCase();
  }

  const commonName = payload.common_name;
  if (typeof commonName === 'string' && commonName.trim().length > 0) {
    return commonName.trim().toLowerCase();
  }

  const name = payload.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim().toLowerCase();
  }

  return null;
}

function hasPermission(
  permission: EditorPermission,
  identity: string | null,
  rbac: RbacConfig
) {
  if (!rbac.enabled) {
    return true;
  }

  if (!identity) {
    return false;
  }

  if (rbac.admins.has(identity)) {
    return true;
  }

  if (permission === 'content:edit') {
    return rbac.editors.has(identity);
  }

  if (permission === 'content:archive') {
    return rbac.archivers.has(identity);
  }

  return false;
}

async function requireAccessActor(jwtAssertion: string, config: AccessConfig): Promise<AccessIdentity> {
  const { payload } = await jwtVerify(jwtAssertion, config.jwks, {
    issuer: [config.issuer, `${config.issuer}/`],
    audience: config.audiences,
  });

  return {
    actor: actorFromAccessPayload(payload),
    identity: identityFromAccessPayload(payload),
  };
}

export async function requireEditorActor(
  event: RequestEvent,
  permission: EditorPermission = 'content:edit'
) {
  const accessConfig = getAccessConfig();
  if (!accessConfig) {
    throw error(
      503,
      'Access auth is not configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.'
    );
  }

  const jwtAssertion = event.request.headers.get(ACCESS_JWT_HEADER)?.trim();
  if (!jwtAssertion) {
    throw error(401, 'Unauthorized');
  }

  try {
    const { actor, identity } = await requireAccessActor(jwtAssertion, accessConfig);
    const rbac = getRbacConfig();
    if (!hasPermission(permission, identity, rbac)) {
      throw error(403, 'Forbidden');
    }
    return actor;
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'status' in err && (err as { status?: number }).status === 403) {
      throw err;
    }
    throw error(401, 'Unauthorized');
  }
}
