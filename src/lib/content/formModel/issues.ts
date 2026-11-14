import { sameValue } from './draft.ts';
import type { ContentRecord } from './types.ts';
import type { FieldIssue } from './validate.ts';

export function valueAt(record: ContentRecord, path: string): unknown {
  if (path === '') {
    return record;
  }
  let found: unknown = record;
  for (const segment of path.split('.')) {
    if (typeof found !== 'object' || found === null) {
      return undefined;
    }
    found = Object.hasOwn(found, segment) ? (found as Record<string, unknown>)[segment] : undefined;
  }
  return found;
}

export function currentIssues(
  issues: FieldIssue[],
  validated: ContentRecord,
  current: ContentRecord,
): FieldIssue[] {
  return issues.filter((issue) =>
    sameValue(valueAt(validated, issue.path), valueAt(current, issue.path)),
  );
}
