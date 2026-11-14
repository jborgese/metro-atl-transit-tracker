import { describe, expect, it } from 'vitest';
import liveProjects from './fixtures/live-projects.json';
import liveGoals from './fixtures/live-goals.json';
import liveTimedActions from './fixtures/live-timed-actions.json';
import { emptyRecord, toFormDraft, toRecord } from './draft';
import { fromJsonText, toJsonText } from './json';
import type { ContentRecord } from './types';

const projects: ContentRecord[] = liveProjects;
const goals: ContentRecord[] = liveGoals;
const timedActions: ContentRecord[] = liveTimedActions;

const draft = toFormDraft('project', {
  id: 'p1',
  title: 'T',
  geo_scope: 'corridor',
  provenance: { updated_at: 't' },
  is_archived: false,
});

it('shows the record without server-managed keys', () => {
  expect(JSON.parse(toJsonText(draft))).toEqual({ title: 'T', geo_scope: 'corridor' });
});
it('restores them when the text is applied', () => {
  const result = fromJsonText(draft, '{"title":"New","geo_scope":"corridor"}');
  expect(result.ok && toRecord(result.draft)).toEqual({
    id: 'p1',
    title: 'New',
    geo_scope: 'corridor',
    provenance: { updated_at: 't' },
    is_archived: false,
  });
});
it.each([
  ['{', /^The JSON does not parse: /],
  ['[]', /^The JSON must be an object$/],
  ['{"__proto__":{}}', /^The key __proto__ is not allowed$/],
  ['{"title":5}', /^title must be text$/],
  ['{"title":"T","sources":"x"}', /^sources must be a list$/],
])('rejects %s', (text, pattern) => {
  const result = fromJsonText(draft, text);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error).toMatch(pattern);
});
it('reports keys the form does not know', () => {
  const result = fromJsonText(draft, '{"title":"T","geo_scope":"corridor","notes":"x"}');
  expect(result.ok && result.unknownKeys).toEqual(['notes']);
});
it('refuses unknown keys on an action', () => {
  const action = toFormDraft('timed_action', emptyRecord('timed_action'));
  const result = fromJsonText(
    action,
    '{"goal_id":"g1","description":"D","link":null,"location":null,"expires_on":"2026-12-01","note":1}',
  );
  expect(!result.ok && result.error).toBe('Actions cannot have other fields: note');
});

describe('id', () => {
  it('shows an empty id on a new project so it can be typed', () => {
    expect(toJsonText(toFormDraft('project', emptyRecord('project')))).toContain('"id": ""');
  });
  it('takes the id from the text for a new record', () => {
    const fresh = toFormDraft('goal', emptyRecord('goal'));
    const result = fromJsonText(fresh, '{"id":"new-one","goal":"G"}');
    expect(result.ok && toRecord(result.draft)).toEqual({ id: 'new-one', goal: 'G' });
  });
  it('still shows the typed id of a new record after it is applied', () => {
    const fresh = toFormDraft('project', emptyRecord('project'));
    const result = fromJsonText(fresh, '{"id":"new-one","title":"T"}');
    expect(result.ok && JSON.parse(toJsonText(result.draft))).toEqual({
      id: 'new-one',
      title: 'T',
    });
  });
  it('keeps the stored id of an existing record whatever the text says', () => {
    const result = fromJsonText(draft, '{"id":"other","title":"T","geo_scope":"corridor"}');
    expect(result.ok && toRecord(result.draft)).toEqual({
      id: 'p1',
      title: 'T',
      geo_scope: 'corridor',
      provenance: { updated_at: 't' },
      is_archived: false,
    });
  });
  it('never shows the id of an action', () => {
    const stored = toFormDraft('timed_action', {
      id: 'ta-1',
      goal_id: 'g1',
      description: 'D',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
    expect(JSON.parse(toJsonText(stored))).not.toHaveProperty('id');
    expect(
      JSON.parse(toJsonText(toFormDraft('timed_action', emptyRecord('timed_action')))),
    ).toEqual({ goal_id: '', description: '', link: null, location: null, expires_on: '' });
  });
  it('refuses an id typed into a new action', () => {
    const action = toFormDraft('timed_action', emptyRecord('timed_action'));
    const result = fromJsonText(
      action,
      '{"id":"ta-x","goal_id":"g1","description":"D","link":null,"location":null,"expires_on":"2026-12-01"}',
    );
    expect(!result.ok && result.error).toBe('Actions cannot have other fields: id');
  });
});

describe('server-managed keys in the text', () => {
  it('are replaced by the stored values', () => {
    const result = fromJsonText(
      draft,
      '{"title":"T","geo_scope":"corridor","provenance":{"updated_at":"forged"},"is_archived":true,"archived_by":"x"}',
    );
    expect(result.ok && toRecord(result.draft)).toEqual({
      id: 'p1',
      title: 'T',
      geo_scope: 'corridor',
      provenance: { updated_at: 't' },
      is_archived: false,
    });
    expect(result.ok && result.unknownKeys).toEqual([]);
  });
  it('are dropped from a new record', () => {
    const fresh = toFormDraft('goal', emptyRecord('goal'));
    const result = fromJsonText(fresh, '{"id":"g","goal":"G","provenance":{},"archived_at":null}');
    expect(result.ok && toRecord(result.draft)).toEqual({ id: 'g', goal: 'G' });
  });
});

describe('wrong types', () => {
  it.each([
    ['project', '{"title":["T"]}', 'title must be text'],
    ['project', '{"start_date":5}', 'start_date must be text or null'],
    ['goal', '{"related_orgs":{}}', 'related_orgs must be a list'],
    ['project', '{"lead_org":null}', 'lead_org must be an object'],
    ['timed_action', '{"link":"https://x.test"}', 'link must be an object or null'],
  ] as const)('%s %s', (kind, text, message) => {
    const result = fromJsonText(toFormDraft(kind, emptyRecord(kind)), text);
    expect(result).toEqual({ ok: false, error: message });
  });
  it('reports the first mismatch in field order', () => {
    const result = fromJsonText(draft, '{"sources":"x","title":5}');
    expect(result).toEqual({ ok: false, error: 'title must be text' });
  });
  it('accepts null where a field allows it', () => {
    const result = fromJsonText(draft, '{"title":"T","start_date":null}');
    expect(result.ok).toBe(true);
  });
  it('rejects __proto__ inside a nested value', () => {
    const result = fromJsonText(draft, '{"title":"T","lead_org":{"name":"N","__proto__":{}}}');
    expect(result).toEqual({ ok: false, error: 'The key __proto__ is not allowed' });
  });
  it.each(['null', '"text"', '5'])('rejects %s as not an object', (text) => {
    expect(fromJsonText(draft, text)).toEqual({ ok: false, error: 'The JSON must be an object' });
  });
});

it('lists only keys that are neither known nor already stored', () => {
  const stored = toFormDraft('goal', { id: 'g1', goal: 'G', legacy: 'kept' });
  const result = fromJsonText(stored, '{"goal":"G","legacy":"kept","added":1,"another":true}');
  expect(result.ok && result.unknownKeys).toEqual(['added', 'another']);
});

it('formats the text with two-space indent and a final newline', () => {
  expect(toJsonText(draft)).toBe('{\n  "title": "T",\n  "geo_scope": "corridor"\n}\n');
});

it('does not change the draft it was given', () => {
  const before = JSON.stringify(draft);
  fromJsonText(draft, '{"title":"Changed","geo_scope":"corridor"}');
  expect(JSON.stringify(draft)).toBe(before);
});

describe.each([
  ['project', projects],
  ['goal', goals],
  ['timed_action', timedActions],
] as const)('%s fixtures through the JSON text', (kind, records) => {
  it.each(records.map((r) => [String(r.id), r] as const))('%s is unchanged', (_id, record) => {
    const stored = toFormDraft(kind, record);
    const result = fromJsonText(stored, toJsonText(stored));
    expect(result.ok).toBe(true);
    expect(result.ok && toRecord(result.draft)).toEqual(record);
    expect(result.ok && result.unknownKeys).toEqual([]);
  });
});
