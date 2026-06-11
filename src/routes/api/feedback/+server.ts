import { env } from '$env/dynamic/private';
import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { checkWriteRateLimit, getClientKey, type WriteRateLimit } from '../../../hooks.server';
import { ContentStoreError } from '$lib/server/content/errors';
import { readJsonBody, toHttpError } from '$lib/server/content/http';
import { sendFeedbackEmail } from '$lib/server/feedback/email';
import { insertFeedback, markEmailSent } from '$lib/server/feedback/store';
import { isHoneypotTripped, toFeedbackCreate } from '$lib/server/feedback/validators';

// Mirror of the `simple` block on the FEEDBACK_LIMITER binding in wrangler.jsonc.
const FEEDBACK_LIMIT_WINDOW_SECONDS = 60;

function getFeedbackLimiter(event: RequestEvent): WriteRateLimit | undefined {
  const platformEnv = (event.platform as { env?: Record<string, unknown> } | undefined)?.env;
  const candidate = platformEnv?.FEEDBACK_LIMITER;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { limit?: unknown }).limit === 'function'
  ) {
    return candidate as WriteRateLimit;
  }
  return undefined;
}

export const POST: RequestHandler = async (event) => {
  try {
    const payload = await readJsonBody(event);

    // Bots that fill the hidden field get a success response with no side
    // effects, so the trap stays invisible.
    if (isHoneypotTripped(payload)) {
      return json({ data: { received: true } }, { status: 201 });
    }

    const parsed = toFeedbackCreate(payload);

    const clientKey = getClientKey(event);
    if (env.WRITE_RATE_LIMIT_ENABLED !== 'false') {
      const { allowed } = await checkWriteRateLimit(getFeedbackLimiter(event), clientKey);
      if (!allowed) {
        throw new ContentStoreError(429, 'too many feedback submissions; try again later');
      }
    }

    const row = await insertFeedback(event, { ...parsed, client_key: clientKey });

    // Email is best-effort: the D1 row is canonical, so a delivery failure
    // still returns 201 (visible later via email_sent = 0).
    const emailSent = await sendFeedbackEmail(event, row);
    if (emailSent) {
      await markEmailSent(event, row.id);
    }

    const response = json({ data: { id: row.id, received: true } }, { status: 201 });
    return response;
  } catch (err) {
    if (err instanceof ContentStoreError && err.status === 429) {
      return json(
        { message: err.message },
        { status: 429, headers: { 'Retry-After': String(FEEDBACK_LIMIT_WINDOW_SECONDS) } }
      );
    }
    toHttpError(err);
  }
};
