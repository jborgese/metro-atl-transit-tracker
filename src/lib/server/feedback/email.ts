import { createMimeMessage, Mailbox } from 'mimetext';
import type { StoreEvent } from '../content/mappers';
import type { FeedbackRow } from './store';

const DEFAULT_FROM_ADDRESS = 'feedback@maitai.observer';
const DEFAULT_TO_ADDRESS = 'jaredborgese@gmail.com';

// The Cloudflare-native send_email binding shape (see `send_email` block in
// wrangler.jsonc). `send` accepts an EmailMessage from `cloudflare:email`.
export type SendEmailBinding = {
  send(message: unknown): Promise<void>;
};

type EmailMessageCtor = new (from: string, to: string, raw: string) => unknown;

function getPlatformEnv(event: StoreEvent): Record<string, unknown> {
  return event.platform?.env ?? {};
}

export function getSendEmailBinding(event: StoreEvent): SendEmailBinding | undefined {
  const candidate = getPlatformEnv(event).SEND_EMAIL;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { send?: unknown }).send === 'function'
  ) {
    return candidate as SendEmailBinding;
  }
  return undefined;
}

function getStringVar(event: StoreEvent, name: string, fallback: string): string {
  const value = getPlatformEnv(event)[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function buildFeedbackEmailBody(feedback: FeedbackRow): string {
  return [
    `Category: ${feedback.category}`,
    `From: ${feedback.name ?? '(not provided)'}`,
    `Email: ${feedback.email ?? '(not provided)'}`,
    `Page: ${feedback.page_url ?? '(not provided)'}`,
    `Submitted: ${feedback.created_at}`,
    `Submission id: ${feedback.id}`,
    '',
    feedback.message,
  ].join('\n');
}

// `cloudflare:email` only resolves inside workerd; a static import would break
// `vite dev` SSR and Node-based vitest. The loader is injectable so tests can
// exercise the send path without the workers runtime.
async function loadEmailMessageCtor(): Promise<EmailMessageCtor> {
  const mod = await import('cloudflare:email');
  return (mod as { EmailMessage: EmailMessageCtor }).EmailMessage;
}

export async function sendFeedbackEmail(
  event: StoreEvent,
  feedback: FeedbackRow,
  loadCtor: () => Promise<EmailMessageCtor> = loadEmailMessageCtor
): Promise<boolean> {
  if (getStringVar(event, 'FEEDBACK_EMAIL_ENABLED', 'true') === 'false') {
    console.warn('[feedback] email delivery disabled via FEEDBACK_EMAIL_ENABLED');
    return false;
  }

  const binding = getSendEmailBinding(event);
  if (!binding) {
    console.warn('[feedback] SEND_EMAIL binding unavailable; submission stored without email');
    return false;
  }

  const from = getStringVar(event, 'FEEDBACK_FROM_ADDRESS', DEFAULT_FROM_ADDRESS);
  const to = getStringVar(event, 'FEEDBACK_TO_ADDRESS', DEFAULT_TO_ADDRESS);

  try {
    const msg = createMimeMessage();
    msg.setSender({ name: 'MAI TAI Feedback', addr: from });
    msg.setRecipient(to);
    msg.setSubject(`[maitai feedback] ${feedback.category}`);
    if (feedback.email) {
      msg.setHeader('Reply-To', new Mailbox(feedback.email));
    }
    msg.addMessage({ contentType: 'text/plain', data: buildFeedbackEmailBody(feedback) });

    const EmailMessage = await loadCtor();
    await binding.send(new EmailMessage(from, to, msg.asRaw()));
    return true;
  } catch (err) {
    console.error('[feedback] email delivery failed; submission stored without email', err);
    return false;
  }
}
