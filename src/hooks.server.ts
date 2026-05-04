import { env } from '$env/dynamic/private';
import { json, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';

const API_PREFIX = '/api/';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const APEX_HOST = 'maitai.observer';
const WWW_HOST = 'www.maitai.observer';

// Mirror of the `simple` block on the WRITE_LIMITER binding in wrangler.jsonc.
// Public values (advertised in RateLimit-* response headers).
const WRITE_LIMIT_REQUESTS = 30;
const WRITE_LIMIT_WINDOW_SECONDS = 60;

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://api.maptiler.com",
  "connect-src 'self' https://api.maptiler.com https://*.cloudflareaccess.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// The Cloudflare-native RateLimit binding shape (see `unsafe.bindings` block
// in wrangler.jsonc). The runtime returns `{ success: true }` when within the
// configured limit and `{ success: false }` once exceeded.
export type WriteRateLimit = {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
};

function applySecurityHeaders(headers: Headers) {
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
}

function isWriteApiRequest(event: RequestEvent) {
  return event.url.pathname.startsWith(API_PREFIX) && WRITE_METHODS.has(event.request.method);
}

function isCrossOriginWrite(event: RequestEvent) {
  if (!isWriteApiRequest(event)) {
    return false;
  }
  const origin = event.request.headers.get('origin');
  if (!origin) {
    // No Origin header — non-browser client (curl/wrangler/tests).
    // Auth still required at the route level via requireEditorActor.
    return false;
  }
  try {
    return new URL(origin).host !== event.url.host;
  } catch {
    return true;
  }
}

export function getClientKey(event: RequestEvent): string {
  const cfIp = event.request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }

  const forwarded = event.request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  // The SvelteKit Cloudflare adapter implements getClientAddress() as a thin
  // wrapper around cf-connecting-ip, which returns null (not a throw) when the
  // header is missing — common under `wrangler dev` and in tests. Treat any
  // non-string / empty value as unknown so we never hand null to the rate
  // limiter binding (which rejects with "invalid key: null").
  try {
    const addr = event.getClientAddress();
    if (typeof addr === 'string' && addr.trim().length > 0) {
      return addr.trim();
    }
  } catch {
    // fall through
  }
  return 'unknown';
}

function getWriteLimiter(event: RequestEvent): WriteRateLimit | undefined {
  const platformEnv = (event.platform as { env?: Record<string, unknown> } | undefined)?.env;
  const candidate = platformEnv?.WRITE_LIMITER;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { limit?: unknown }).limit === 'function'
  ) {
    return candidate as WriteRateLimit;
  }
  return undefined;
}

export async function checkWriteRateLimit(
  binding: WriteRateLimit | undefined,
  key: string
): Promise<{ allowed: boolean }> {
  if (!binding) {
    // Binding not provisioned (e.g., local `wrangler dev` without unsafe.bindings,
    // or a Worker isolate where the runtime hasn't injected it). Fail open —
    // route-level auth still gates writes.
    return { allowed: true };
  }
  const result = await binding.limit({ key });
  return { allowed: Boolean(result?.success) };
}

function applyRateLimitHeaders(headers: Headers, allowed: boolean) {
  headers.set('RateLimit-Limit', String(WRITE_LIMIT_REQUESTS));
  headers.set('RateLimit-Policy', `${WRITE_LIMIT_REQUESTS};w=${WRITE_LIMIT_WINDOW_SECONDS}`);
  headers.set('X-RateLimit-Limit', String(WRITE_LIMIT_REQUESTS));
  if (!allowed) {
    headers.set('RateLimit-Remaining', '0');
    headers.set('X-RateLimit-Remaining', '0');
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.hostname === WWW_HOST) {
    const target = new URL(event.url);
    target.hostname = APEX_HOST;
    redirect(301, target.toString());
  }

  if (isCrossOriginWrite(event)) {
    const response = json({ error: 'Forbidden' }, { status: 403 });
    applySecurityHeaders(response.headers);
    return response;
  }

  if (!isWriteApiRequest(event)) {
    const response = await resolve(event);
    applySecurityHeaders(response.headers);
    return response;
  }

  const enabled = env.WRITE_RATE_LIMIT_ENABLED !== 'false';
  if (!enabled) {
    const response = await resolve(event);
    applySecurityHeaders(response.headers);
    return response;
  }

  const limiter = getWriteLimiter(event);
  const { allowed } = await checkWriteRateLimit(limiter, getClientKey(event));
  if (!allowed) {
    const response = json({ error: 'Too Many Requests' }, { status: 429 });
    applyRateLimitHeaders(response.headers, false);
    applySecurityHeaders(response.headers);
    response.headers.set('Retry-After', String(WRITE_LIMIT_WINDOW_SECONDS));
    return response;
  }

  const response = await resolve(event);
  applyRateLimitHeaders(response.headers, true);
  applySecurityHeaders(response.headers);
  return response;
};
