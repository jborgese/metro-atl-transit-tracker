import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './spec';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument('https://example.test/');

  it('emits a 3.1.0 document with title and a server entry', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toMatch(/Metro ATL/);
    expect(doc.servers?.[0].url).toBe('https://example.test/');
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
    ]) {
      expect(paths).toContain(expected);
    }
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
