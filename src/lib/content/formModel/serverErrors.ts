import type { FieldIssue } from './validate';

const VALIDATION_PATTERN = /validation failed - ([^:]+): (.*)$/;
const DUPLICATE_PATTERN = /already exists/;

function errorText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { message, error } = body as { message?: unknown; error?: unknown };
  if (typeof message === 'string') {
    return message;
  }
  return typeof error === 'string' ? error : null;
}

function issueFrom(status: number, text: string | null): FieldIssue | null {
  if (text === null) {
    return null;
  }
  const match = VALIDATION_PATTERN.exec(text);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { path: match[1], message: match[2] };
  }
  if (status === 409 && DUPLICATE_PATTERN.test(text)) {
    return { path: 'id', message: text };
  }
  return null;
}

export function parseServerError(
  status: number,
  body: unknown,
  url: string,
): { message: string; issue: FieldIssue | null } {
  const text = errorText(body);
  const prefix = `${url} returned ${status}`;
  return {
    message: text === null ? prefix : `${prefix}: ${text}`,
    issue: issueFrom(status, text),
  };
}
