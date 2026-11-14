import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './spec';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument('https://example.test/');

  it('emits a 3.1.0 document with title and a server entry', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toMatch(/Metro ATL/);
    expect(doc.servers?.[0]?.url).toBe('https://example.test/');
  });

  it('registers every CRUD path for projects and goals', () => {
    const paths = Object.keys(doc.paths ?? {});
    for (const expected of [
      '/api/projects',
      '/api/projects/{id}',
      '/api/projects/{id}/restore',
      '/api/goals',
      '/api/goals/{id}',
      '/api/goals/{id}/restore',
      '/api/history',
      '/api/me',
      '/api/feedback',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('registers every timed-action path and its schema', () => {
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/api/timed-actions',
        '/api/timed-actions/{id}',
        '/api/timed-actions/{id}/restore',
      ]),
    );
    expect(Object.keys(doc.components?.schemas ?? {})).toContain('TimedAction');
  });

  it('publishes a timed-action response schema that carries id and allows extra fields', () => {
    const timedAction = doc.components?.schemas?.TimedAction;
    expect(timedAction).toMatchObject({ properties: { id: { type: 'string' } } });
    expect(timedAction).not.toHaveProperty('additionalProperties', false);
  });

  it('uses the create and replace schemas as the timed-action request bodies', () => {
    const bodySchema = (ref: string) => ({
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
    });
    expect(doc.paths?.['/api/timed-actions']?.post?.requestBody).toMatchObject(
      bodySchema('TimedActionCreate'),
    );
    expect(doc.paths?.['/api/timed-actions/{id}']?.patch?.requestBody).toMatchObject(
      bodySchema('TimedActionReplace'),
    );
    expect(doc.components?.schemas?.TimedActionCreate).toMatchObject({
      required: ['goal_id', 'description', 'expires_on'],
    });
    expect(doc.components?.schemas?.TimedActionReplace).toMatchObject({
      required: ['goal_id', 'description', 'expires_on'],
    });
  });

  it('declares 503 on every timed-action write', () => {
    const writes: Array<[string, 'post' | 'patch' | 'delete']> = [
      ['/api/timed-actions', 'post'],
      ['/api/timed-actions/{id}', 'patch'],
      ['/api/timed-actions/{id}', 'delete'],
      ['/api/timed-actions/{id}/restore', 'post'],
    ];
    for (const [path, method] of writes) {
      expect(doc.paths?.[path]?.[method]?.responses?.['503']).toBeDefined();
    }
  });

  it('publishes timed_action as a history entity type in the event and the filter', () => {
    const entityTypes = {
      anyOf: ['project', 'goal', 'timed_action'].map((value) => ({
        type: 'string',
        enum: [value],
      })),
    };
    expect(doc.components?.schemas?.HistoryEvent).toMatchObject({
      properties: { entity_type: entityTypes },
    });
    expect(doc.paths?.['/api/history']?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: 'entityType', schema: expect.objectContaining(entityTypes) }),
    );
  });

  it('marks write methods with editor auth security', () => {
    const post = doc.paths?.['/api/projects']?.post;
    expect(post?.security).toBeDefined();
    expect(post?.security?.length).toBeGreaterThan(0);

    const get = doc.paths?.['/api/projects']?.get;
    expect(get?.security).toBeUndefined();
  });

  it('shares schema components across endpoints', () => {
    const schemas = doc.components?.schemas ?? {};
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(['Project', 'Goal', 'HistoryEvent', 'Me', 'ErrorResponse']),
    );
  });

  it('declares 413 on every write that accepts a JSON body (S-11 contract)', () => {
    const writePaths: Array<[string, 'post' | 'patch']> = [
      ['/api/projects', 'post'],
      ['/api/projects/{id}', 'patch'],
      ['/api/goals', 'post'],
      ['/api/goals/{id}', 'patch'],
      ['/api/timed-actions', 'post'],
      ['/api/timed-actions/{id}', 'patch'],
    ];
    for (const [path, method] of writePaths) {
      const op = doc.paths?.[path]?.[method];
      expect(op?.responses?.['413']).toBeDefined();
    }
  });

  it('serializes to JSON without throwing', () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });
});
