import { KNOWN_FIELDS } from './draft';
import { SERVER_MANAGED_KEYS } from './payload';
import type { FormDraft } from './types';

const SHOWN_ELSEWHERE: readonly string[] = [...SERVER_MANAGED_KEYS, 'id'];

export function hiddenKeys(draft: FormDraft): string[] {
  const known = KNOWN_FIELDS[draft.kind];
  return Object.keys(draft.base).filter(
    (key) => !Object.hasOwn(known, key) && !SHOWN_ELSEWHERE.includes(key),
  );
}
