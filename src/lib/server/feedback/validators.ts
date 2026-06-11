import { z } from 'zod';
import { ContentStoreError } from '../content/errors';

export const FEEDBACK_CATEGORIES = ['general', 'bug', 'data-correction', 'feature-request'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type FeedbackCreate = {
  message: string;
  name?: string;
  email?: string;
  category: FeedbackCategory;
  page_url?: string;
};

// name and email end up in MIME headers (From display name / Reply-To), so
// CR/LF are rejected outright to rule out header injection.
const noLineBreaks = (value: string) => !/[\r\n]/.test(value);

export const feedbackCreateSchema = z.object({
  message: z.string().trim().min(5, 'must be at least 5 characters').max(4000),
  name: z
    .string()
    .trim()
    .max(120)
    .refine(noLineBreaks, 'must not contain line breaks')
    .optional(),
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).default('general'),
  page_url: z.string().trim().max(500).optional(),
});

function zodErrorToMessage(err: z.ZodError) {
  const firstIssue = err.issues[0];
  if (!firstIssue) {
    return 'invalid payload';
  }

  const path = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'payload';
  return `${path}: ${firstIssue.message}`;
}

export function toFeedbackCreate(input: unknown): FeedbackCreate {
  const parsed = feedbackCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContentStoreError(
      400,
      `feedback validation failed - ${zodErrorToMessage(parsed.error)}`
    );
  }

  const { message, name, email, category, page_url } = parsed.data;
  return {
    message,
    name: name || undefined,
    email: email || undefined,
    category,
    page_url: page_url || undefined,
  };
}

// The honeypot field is read separately from the schema so an invalid payload
// never produces a validation message that tips off bots about the trap.
export function isHoneypotTripped(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const website = (payload as { website?: unknown }).website;
  return typeof website === 'string' && website.trim().length > 0;
}
