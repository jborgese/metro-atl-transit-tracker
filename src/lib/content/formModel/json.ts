import { KNOWN_FIELDS, toFormDraft, toRecord, type FieldType } from './draft';
import { SERVER_MANAGED_KEYS } from './payload';
import type { FormDraft } from './types';

export type JsonResult =
  | { ok: true; draft: FormDraft; unknownKeys: string[] }
  | { ok: false; error: string };

type Plain = Record<string, unknown>;

const RESTORED_KEYS = [...SERVER_MANAGED_KEYS, 'id'];

const TYPE_WORDS: Record<FieldType, string> = {
  text: 'text',
  'text or null': 'text or null',
  list: 'a list',
  object: 'an object',
  'object or null': 'an object or null',
};

function isPlainObject(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(value: unknown, type: FieldType): boolean {
  if (type === 'text') return typeof value === 'string';
  if (type === 'text or null') return typeof value === 'string' || value === null;
  if (type === 'list') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  return value === null || isPlainObject(value);
}

function hasProtoKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasProtoKey);
  if (!isPlainObject(value)) return false;
  return Object.hasOwn(value, '__proto__') || Object.values(value).some(hasProtoKey);
}

function hasStoredId(draft: FormDraft): boolean {
  const { id } = draft.base;
  return typeof id === 'string' && id.trim() !== '';
}

function managedKeys(draft: FormDraft): string[] {
  return hasStoredId(draft) ? RESTORED_KEYS : [...SERVER_MANAGED_KEYS];
}

function withoutKeys(record: Plain, keys: string[]): Plain {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function onlyKeys(record: Plain, keys: string[]): Plain {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.includes(key)));
}

function parse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `The JSON does not parse: ${reason}` };
  }
}

function typeError(draft: FormDraft, typed: Plain): string | null {
  const wrong = Object.entries(KNOWN_FIELDS[draft.kind]).find(
    ([key, type]) => key in typed && !hasType(typed[key], type),
  );
  return wrong === undefined ? null : `${wrong[0]} must be ${TYPE_WORDS[wrong[1]]}`;
}

function extraActionError(draft: FormDraft, typed: Plain): string | null {
  if (draft.kind !== 'timed_action') return null;
  const extra = Object.keys(typed).filter((key) => !(key in KNOWN_FIELDS.timed_action));
  return extra.length === 0 ? null : `Actions cannot have other fields: ${extra.join(', ')}`;
}

function rebuild(draft: FormDraft, typed: Plain): FormDraft {
  const rebuilt = toFormDraft(draft.kind, { ...typed, ...onlyKeys(draft.base, RESTORED_KEYS) });
  if (rebuilt.kind === 'timed_action' || hasStoredId(draft) || typeof typed.id !== 'string') {
    return rebuilt;
  }
  return { ...rebuilt, id: typed.id };
}

function unknownKeys(draft: FormDraft, typed: Plain): string[] {
  const known = KNOWN_FIELDS[draft.kind];
  return Object.keys(typed).filter(
    (key) => !(key in known) && key !== 'id' && !(key in draft.base),
  );
}

export function toJsonText(draft: FormDraft): string {
  return `${JSON.stringify(withoutKeys(toRecord(draft), managedKeys(draft)), null, 2)}\n`;
}

export function fromJsonText(draft: FormDraft, text: string): JsonResult {
  const parsed = parse(text);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value)) return { ok: false, error: 'The JSON must be an object' };
  if (hasProtoKey(parsed.value)) return { ok: false, error: 'The key __proto__ is not allowed' };
  const typed = withoutKeys(parsed.value, managedKeys(draft));
  const error = typeError(draft, typed) ?? extraActionError(draft, typed);
  if (error !== null) return { ok: false, error };
  return { ok: true, draft: rebuild(draft, typed), unknownKeys: unknownKeys(draft, typed) };
}
