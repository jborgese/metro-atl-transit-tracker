import { describe, expect, it } from 'vitest';
import { parseServerError } from './serverErrors';

describe('parseServerError', () => {
  it('reads server errors', () => {
    expect(
      parseServerError(
        400,
        { message: 'project validation failed - sources.0.url: Invalid URL' },
        '/api/projects/p1',
      ),
    ).toEqual({
      message:
        '/api/projects/p1 returned 400: project validation failed - sources.0.url: Invalid URL',
      issue: { path: 'sources.0.url', message: 'Invalid URL' },
    });
    expect(
      parseServerError(409, { message: 'project p1 already exists' }, '/api/projects').issue,
    ).toEqual({ path: 'id', message: 'project p1 already exists' });
    expect(parseServerError(429, { error: 'rate limited' }, '/api/goals/g1')).toEqual({
      message: '/api/goals/g1 returned 429: rate limited',
      issue: null,
    });
    expect(parseServerError(500, 'oops', '/api/goals')).toEqual({
      message: '/api/goals returned 500',
      issue: null,
    });
  });

  it('handles a body with neither message nor error', () => {
    expect(parseServerError(500, { other: 1 }, '/api/goals')).toEqual({
      message: '/api/goals returned 500',
      issue: null,
    });
  });

  it('handles a null body', () => {
    expect(parseServerError(502, null, '/api/goals')).toEqual({
      message: '/api/goals returned 502',
      issue: null,
    });
  });

  it('keeps everything after the first colon-space as the message', () => {
    expect(
      parseServerError(
        400,
        { message: 'project validation failed - sources.0.url: Invalid URL: bad' },
        '/api/projects/p1',
      ).issue,
    ).toEqual({ path: 'sources.0.url', message: 'Invalid URL: bad' });
  });

  it('gives a 409 that is not a duplicate no issue', () => {
    expect(
      parseServerError(409, { message: 'record was changed' }, '/api/goals/g1').issue,
    ).toBeNull();
  });
});
