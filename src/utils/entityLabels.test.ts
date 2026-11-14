import { describe, expect, it } from 'vitest';
import { entityTypeLabel } from './entityLabels';

describe('entityTypeLabel', () => {
  it('labels entity types for readers', () => {
    expect(entityTypeLabel('project')).toBe('Project');
    expect(entityTypeLabel('goal')).toBe('Goal');
    expect(entityTypeLabel('timed_action')).toBe('Timed action');
    expect(entityTypeLabel('something_else')).toBe('something_else');
  });
});
