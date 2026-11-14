import { describe, expect, it } from 'vitest';
import { currentIssues, valueAt } from './issues.ts';

const issue = (path: string) => ({ path, message: `Problem with ${path}` });

describe('valueAt', () => {
  const record = { title: 'A', sources: [{ label: 'Plan' }, { label: 'Map' }], lead_org: null };

  it('reads top-level, nested and indexed values', () => {
    expect(valueAt(record, 'title')).toBe('A');
    expect(valueAt(record, 'sources.1.label')).toBe('Map');
    expect(valueAt(record, 'sources.0')).toEqual({ label: 'Plan' });
  });

  it('returns the whole record for an empty path', () => {
    expect(valueAt(record, '')).toBe(record);
  });

  it('returns undefined for anything missing', () => {
    expect(valueAt(record, 'nope')).toBeUndefined();
    expect(valueAt(record, 'sources.5.label')).toBeUndefined();
    expect(valueAt(record, 'lead_org.name')).toBeUndefined();
    expect(valueAt(record, 'title.length.x')).toBeUndefined();
  });

  it('reads own properties only', () => {
    expect(valueAt(record, 'constructor')).toBeUndefined();
    expect(valueAt(record, '__proto__')).toBeUndefined();
  });
});

describe('currentIssues', () => {
  it('keeps an issue whose value is unchanged', () => {
    expect(currentIssues([issue('title')], { title: '' }, { title: '' })).toEqual([issue('title')]);
  });

  it('drops an issue whose value changed', () => {
    expect(currentIssues([issue('title')], { title: '' }, { title: 'x' })).toEqual([]);
  });

  it('drops an issue whose row was removed', () => {
    const validated = { sources: [{ label: 'a' }, { label: '' }] };
    const current = { sources: [{ label: 'a' }] };
    expect(currentIssues([issue('sources.1.label')], validated, current)).toEqual([]);
  });

  it('keeps an issue when a different field changed', () => {
    const found = [issue('title'), issue('summary')];
    expect(currentIssues(found, { title: '', summary: '' }, { title: '', summary: 'x' })).toEqual([
      issue('title'),
    ]);
  });

  it('keeps a whole-record issue until anything changes', () => {
    expect(currentIssues([issue('')], { a: 1 }, { a: 1 })).toEqual([issue('')]);
    expect(currentIssues([issue('')], { a: 1 }, { a: 2 })).toEqual([]);
  });
});
