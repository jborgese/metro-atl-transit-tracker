import { WRITE_RATE_LIMIT_ENABLED } from '$app/env/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { checkWriteRateLimit, getClientKey, getRateLimiter } from '../../../hooks.server';
import { ContentStoreError } from '#lib/server/content/errors.ts';
import { readJsonBody, toHttpError } from '#lib/server/content/http.ts';
import { sendFeedbackEmail } from '#lib/server/feedback/email.ts';
import { insertFeedback, markEmailSent } from '#lib/server/feedback/store.ts';
import { isHoneypotTripped, toFeedbackCreate } from '#lib/server/feedback/validators.ts';

// Mirror of the `simple` block on the FEEDBACK_LIMITER binding in wrangler.jsonc.
const FEEDBACK_LIMIT_WINDOW_SECONDS = 60;

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
    if (WRITE_RATE_LIMIT_ENABLED !== 'false') {
      const { allowed } = await checkWriteRateLimit(getRateLimiter('FEEDBACK_LIMITER'), clientKey);
      if (!allowed) {
        throw new ContentStoreError(429, 'too many feedback submissions; try again later');
      }
    }

    const row = await insertFeedback({ ...parsed, client_key: clientKey });

    // Email is best-effort: the D1 row is canonical, so a delivery failure
    // still returns 201 (visible later via email_sent = 0).
    const emailSent = await sendFeedbackEmail(row);
    if (emailSent) {
      await markEmailSent(row.id);
    }

    const response = json({ data: { id: row.id, received: true } }, { status: 201 });
    return response;
  } catch (err) {
    if (err instanceof ContentStoreError && err.status === 429) {
      return json(
        { message: err.message },
        { status: 429, headers: { 'Retry-After': String(FEEDBACK_LIMIT_WINDOW_SECONDS) } },
      );
    }
    toHttpError(err);
  }
};
