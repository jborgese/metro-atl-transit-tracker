import { describe, expect, it } from 'vitest';
import { ContentStoreError } from './errors';
import {
  selectGoalSeeds,
  selectProjectSeeds,
  toGoalCreate,
  toGoalPatch,
  toGoalSeed,
  toProjectCreate,
  toProjectPatch,
  toProjectSeed,
} from './validators';

const bad = ['javascript:alert(1)', 'data:text/html,x'];

function expectFieldError(fn: () => unknown, path: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContentStoreError);
  expect((thrown as ContentStoreError).status).toBe(400);
  expect((thrown as ContentStoreError).message).toContain(path);
}

describe('http(s)-only organisation and source links', () => {
  it.each(bad)('rejects %s as a lead organisation link', (url) => {
    expectFieldError(
      () => toProjectCreate({ id: 'p', title: 'T', lead_org: { name: 'A', url } }),
      'lead_org.url',
    );
  });

  it.each(bad)('rejects %s as a partner link', (url) => {
    expectFieldError(
      () => toProjectCreate({ id: 'p', title: 'T', partners: [{ name: 'A', url }] }),
      'partners.0.url',
    );
  });

  it.each(bad)('rejects %s as a source link', (url) => {
    expectFieldError(
      () => toProjectCreate({ id: 'p', title: 'T', sources: [{ label: 'L', url }] }),
      'sources.0.url',
    );
  });

  it.each(bad)('rejects %s as a related organisation link', (url) => {
    expectFieldError(
      () => toGoalCreate({ id: 'g', goal: 'G', related_orgs: [{ name: 'A', url }] }),
      'related_orgs.0.url',
    );
  });

  it.each(bad)('rejects %s on a project patch', (url) => {
    expectFieldError(() => toProjectPatch({ lead_org: { name: 'A', url } }), 'lead_org.url');
    expectFieldError(() => toProjectPatch({ partners: [{ name: 'A', url }] }), 'partners.0.url');
    expectFieldError(() => toProjectPatch({ sources: [{ label: 'L', url }] }), 'sources.0.url');
  });

  it.each(bad)('rejects %s on a goal patch', (url) => {
    expectFieldError(
      () => toGoalPatch({ related_orgs: [{ name: 'A', url }] }),
      'related_orgs.0.url',
    );
  });

  it('accepts http and https in every position', () => {
    expect(() =>
      toProjectCreate({
        id: 'p',
        title: 'T',
        lead_org: { name: 'A', url: 'http://a.example' },
        partners: [{ name: 'B', url: 'https://b.example' }],
        sources: [{ label: 'L', url: 'https://a.example/x' }],
      }),
    ).not.toThrow();
    expect(() =>
      toGoalCreate({
        id: 'g',
        goal: 'G',
        related_orgs: [{ name: 'A', url: 'http://a.example/y' }],
      }),
    ).not.toThrow();
  });

  it('stores a link trimmed and otherwise unchanged', () => {
    const project = toProjectCreate({
      id: 'p',
      title: 'T',
      lead_org: { name: 'A', url: '  https://A.example/Path?q=1#f \n' },
      sources: [{ label: 'L', url: '\thttps://a.example/x ' }],
    });
    expect(project.lead_org?.url).toBe('https://A.example/Path?q=1#f');
    expect(project.sources?.[0]?.url).toBe('https://a.example/x');
  });

  it('still loads every seed record', () => {
    expect(() => selectProjectSeeds().forEach(toProjectSeed)).not.toThrow();
    expect(() => selectGoalSeeds().forEach(toGoalSeed)).not.toThrow();
  });
});
