import { env } from '$env/dynamic/private';
import { json, type Handle, type RequestEvent } from '@sveltejs/kit';

const API_PREFIX = '/api/';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SWEEP_INTERVAL = 100;

type RateLimitBucket = {
  count: number;
  resetAt: number;
  touchedAt: number;
};

const writeBuckets = new Map<string, RateLimitBucket>();
let requestCounter = 0;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function rateLimitConfig() {
  return {
    enabled: env.WRITE_RATE_LIMIT_ENABLED !== 'false',
    maxRequests: parsePositiveInt(env.WRITE_RATE_LIMIT_REQUESTS, 30),
    windowSeconds: parsePositiveInt(env.WRITE_RATE_LIMIT_WINDOW_SECONDS, 60),
  };
}

function isWriteApiRequest(event: RequestEvent) {
  return event.url.pathname.startsWith(API_PREFIX) && WRITE_METHODS.has(event.request.method);
}

function getClientKey(event: RequestEvent) {
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

  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

function maybeSweepBuckets(now: number, windowMs: number) {
  requestCounter += 1;
  if (requestCounter % SWEEP_INTERVAL !== 0) {
    return;
  }

  const staleBefore = now - windowMs * 2;
  for (const [key, bucket] of writeBuckets) {
    if (bucket.resetAt <= now && bucket.touchedAt <= staleBefore) {
      writeBuckets.delete(key);
    }
  }
}

function consumeWriteLimit(event: RequestEvent, maxRequests: number, windowSeconds: number) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  maybeSweepBuckets(now, windowMs);

  const key = getClientKey(event);
  let bucket = writeBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + windowMs,
      touchedAt: now,
    };
  }

  bucket.count += 1;
  bucket.touchedAt = now;
  writeBuckets.set(key, bucket);

  const remaining = Math.max(0, maxRequests - bucket.count);
  const resetSeconds = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed: bucket.count <= maxRequests,
    remaining,
    resetSeconds,
  };
}

function applyRateLimitHeaders(
  headers: Headers,
  maxRequests: number,
  remaining: number,
  resetSeconds: number,
  windowSeconds: number
) {
  headers.set('RateLimit-Limit', String(maxRequests));
  headers.set('RateLimit-Remaining', String(remaining));
  headers.set('RateLimit-Reset', String(resetSeconds));
  headers.set('RateLimit-Policy', `${maxRequests};w=${windowSeconds}`);
  headers.set('X-RateLimit-Limit', String(maxRequests));
  headers.set('X-RateLimit-Remaining', String(remaining));
  headers.set('X-RateLimit-Reset', String(resetSeconds));
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!isWriteApiRequest(event)) {
    return resolve(event);
  }

  const config = rateLimitConfig();
  if (!config.enabled) {
    return resolve(event);
  }

  const rateLimit = consumeWriteLimit(event, config.maxRequests, config.windowSeconds);
  if (!rateLimit.allowed) {
    const response = json({ error: 'Too Many Requests' }, { status: 429 });
    applyRateLimitHeaders(
      response.headers,
      config.maxRequests,
      rateLimit.remaining,
      rateLimit.resetSeconds,
      config.windowSeconds
    );
    response.headers.set('Retry-After', String(rateLimit.resetSeconds));
    return response;
  }

  const response = await resolve(event);
  applyRateLimitHeaders(
    response.headers,
    config.maxRequests,
    rateLimit.remaining,
    rateLimit.resetSeconds,
    config.windowSeconds
  );
  return response;
};
