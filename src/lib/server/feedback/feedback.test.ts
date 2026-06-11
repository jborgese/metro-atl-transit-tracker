import { describe, expect, it, vi } from 'vitest';
import { ContentStoreError } from '../content/errors';
import { buildFeedbackEmailBody, sendFeedbackEmail } from './email';
import type { FeedbackRow } from './store';
import { isHoneypotTripped, toFeedbackCreate } from './validators';

describe('toFeedbackCreate', () => {
  it('accepts a minimal payload and defaults category to general', () => {
    const parsed = toFeedbackCreate({ message: 'hello there' });
    expect(parsed).toEqual({
      message: 'hello there',
      name: undefined,
      email: undefined,
      category: 'general',
      page_url: undefined,
    });
  });

  it('keeps optional fields when provided', () => {
    const parsed = toFeedbackCreate({
      message: 'the map legend is wrong',
      name: 'Jane Rider',
      email: 'jane@example.com',
      category: 'data-correction',
      page_url: '/history',
    });
    expect(parsed.name).toBe('Jane Rider');
    expect(parsed.email).toBe('jane@example.com');
    expect(parsed.category).toBe('data-correction');
    expect(parsed.page_url).toBe('/history');
  });

  it('normalizes empty optional strings to undefined', () => {
    const parsed = toFeedbackCreate({ message: 'hello there', name: '  ', email: '' });
    expect(parsed.name).toBeUndefined();
    expect(parsed.email).toBeUndefined();
  });

  it('rejects messages shorter than 5 characters with 400', () => {
    expect(() => toFeedbackCreate({ message: 'hi' })).toThrowError(ContentStoreError);
    try {
      toFeedbackCreate({ message: 'hi' });
    } catch (err) {
      expect((err as ContentStoreError).status).toBe(400);
    }
  });

  it('rejects invalid email addresses', () => {
    expect(() => toFeedbackCreate({ message: 'hello there', email: 'not-an-email' })).toThrowError(
      ContentStoreError
    );
  });

  it('rejects names containing line breaks (header injection defense)', () => {
    expect(() =>
      toFeedbackCreate({ message: 'hello there', name: 'evil\r\nBcc: spam@example.com' })
    ).toThrowError(ContentStoreError);
  });

  it('rejects unknown categories', () => {
    expect(() => toFeedbackCreate({ message: 'hello there', category: 'rant' })).toThrowError(
      ContentStoreError
    );
  });
});

describe('isHoneypotTripped', () => {
  it('returns true when the hidden field is filled', () => {
    expect(isHoneypotTripped({ message: 'hello there', website: 'https://spam.example' })).toBe(true);
  });

  it('returns false for empty or missing honeypot values', () => {
    expect(isHoneypotTripped({ message: 'hello there' })).toBe(false);
    expect(isHoneypotTripped({ message: 'hello there', website: '' })).toBe(false);
    expect(isHoneypotTripped({ message: 'hello there', website: '   ' })).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped('nope')).toBe(false);
  });
});

const baseRow: FeedbackRow = {
  id: '00000000-0000-4000-8000-000000000000',
  message: 'the goals table is great',
  name: 'Jane Rider',
  email: 'jane@example.com',
  category: 'general',
  page_url: '/',
  client_key: '203.0.113.7',
  created_at: '2026-06-11T00:00:00.000Z',
};

class FakeEmailMessage {
  constructor(
    public from: string,
    public to: string,
    public raw: string
  ) {}
}

function makeEvent(env: Record<string, unknown>) {
  return { platform: { env } };
}

describe('sendFeedbackEmail', () => {
  it('returns false when the SEND_EMAIL binding is unavailable', async () => {
    const sent = await sendFeedbackEmail(makeEvent({}), baseRow);
    expect(sent).toBe(false);
  });

  it('returns false when FEEDBACK_EMAIL_ENABLED is "false"', async () => {
    const send = vi.fn(async () => undefined);
    const sent = await sendFeedbackEmail(
      makeEvent({ SEND_EMAIL: { send }, FEEDBACK_EMAIL_ENABLED: 'false' }),
      baseRow
    );
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a MIME message with Reply-To and returns true', async () => {
    const send = vi.fn(async (_message: unknown) => undefined);
    const sent = await sendFeedbackEmail(
      makeEvent({
        SEND_EMAIL: { send },
        FEEDBACK_FROM_ADDRESS: 'feedback@maitai.observer',
        FEEDBACK_TO_ADDRESS: 'owner@example.com',
      }),
      baseRow,
      async () => FakeEmailMessage
    );
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as FakeEmailMessage;
    expect(message.from).toBe('feedback@maitai.observer');
    expect(message.to).toBe('owner@example.com');
    expect(message.raw).toContain('Reply-To: <jane@example.com>');
    // Subject is UTF-8 base64-encoded by mimetext: "[maitai feedback] general"
    expect(message.raw).toContain('W21haXRhaSBmZWVkYmFja10gZ2VuZXJhbA==');
    expect(message.raw).toContain('the goals table is great');
  });

  it('returns false when the binding send rejects', async () => {
    const send = vi.fn(async () => {
      throw new Error('delivery refused');
    });
    const sent = await sendFeedbackEmail(
      makeEvent({ SEND_EMAIL: { send } }),
      baseRow,
      async () => FakeEmailMessage
    );
    expect(sent).toBe(false);
  });
});

describe('buildFeedbackEmailBody', () => {
  it('includes all submission fields and the message', () => {
    const body = buildFeedbackEmailBody(baseRow);
    expect(body).toContain('Category: general');
    expect(body).toContain('From: Jane Rider');
    expect(body).toContain('Email: jane@example.com');
    expect(body).toContain('Submission id: 00000000-0000-4000-8000-000000000000');
    expect(body).toContain('the goals table is great');
  });

  it('marks missing optional fields as not provided', () => {
    const body = buildFeedbackEmailBody({ ...baseRow, name: undefined, email: undefined });
    expect(body).toContain('From: (not provided)');
    expect(body).toContain('Email: (not provided)');
  });
});
