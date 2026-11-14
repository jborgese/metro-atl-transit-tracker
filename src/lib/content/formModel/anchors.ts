import { fieldLabel } from './labels';
import type { ContentKind, FormDraft } from './types';

const PLAIN_LISTS = ['related_counties', 'modes', 'related_project_ids'];
const ANCHOR_PATTERN = /^(partners|milestones|sources|related_orgs)#([^.]+)(?:\.(.+))?$/;
const INDEX_PATTERN = /^\d+$/;

function rowsOf(draft: FormDraft, array: string): Array<{ key: string }> | undefined {
  if (draft.kind === 'goal') {
    return array === 'related_orgs' ? draft.related_orgs : undefined;
  }
  if (draft.kind === 'project') {
    if (array === 'partners' || array === 'milestones' || array === 'sources') {
      return draft[array];
    }
  }
  return undefined;
}

export function anchorOf(draft: FormDraft, path: string): string {
  const [array = '', position = '', ...rest] = path.split('.');
  if (!INDEX_PATTERN.test(position)) {
    return path;
  }
  if (PLAIN_LISTS.includes(array)) {
    return array;
  }
  const row = rowsOf(draft, array)?.[Number(position)];
  return row === undefined ? path : [`${array}#${row.key}`, ...rest].join('.');
}

export function pathOf(draft: FormDraft, anchor: string): string | null {
  const match = ANCHOR_PATTERN.exec(anchor);
  if (match === null) {
    return anchor;
  }
  const [, array = '', key, rest] = match;
  const index = rowsOf(draft, array)?.findIndex((row) => row.key === key) ?? -1;
  if (index === -1) {
    return null;
  }
  return rest === undefined ? `${array}.${index}` : `${array}.${index}.${rest}`;
}

function carryKeys<T extends { key: string }>(previous: Array<{ key: string }>, next: T[]): T[] {
  return next.map((row, index) => ({ ...row, key: previous[index]?.key ?? row.key }));
}

export function keepRowKeys(previous: FormDraft, next: FormDraft): FormDraft {
  if (previous.kind === 'goal' && next.kind === 'goal') {
    return { ...next, related_orgs: carryKeys(previous.related_orgs, next.related_orgs) };
  }
  if (previous.kind === 'project' && next.kind === 'project') {
    return {
      ...next,
      partners: carryKeys(previous.partners, next.partners),
      milestones: carryKeys(previous.milestones, next.milestones),
      sources: carryKeys(previous.sources, next.sources),
    };
  }
  return next;
}

export function relabel(
  kind: ContentKind,
  message: string,
  fromPath: string,
  toPath: string,
): string {
  const from = fieldLabel(kind, fromPath);
  return message.startsWith(from)
    ? `${fieldLabel(kind, toPath)}${message.slice(from.length)}`
    : message;
}
