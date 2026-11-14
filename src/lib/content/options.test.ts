import { describe, expect, it } from 'vitest';
import { GEO_SCOPES, PROJECT_MODES, PROJECT_STATUSES, geoScopeLabel, modeLabel } from './options';
import { statusLabel } from '#utils/statusHelpers.ts';

describe('option lists', () => {
  it('lists the options the forms offer', () => {
    expect(PROJECT_STATUSES).toEqual([
      'planning',
      'public-outreach',
      'funding-application',
      'implementation',
      'completed',
      'ongoing',
    ]);
    expect(GEO_SCOPES).toEqual(['corridor', 'regional', 'county', 'local']);
    expect(PROJECT_MODES).toEqual([
      'transit',
      'bus',
      'rail',
      'road',
      'bike',
      'walk',
      'multi-modal',
    ]);
    expect(geoScopeLabel('corridor')).toBe('Corridor');
    expect(modeLabel('multi-modal')).toBe('Multi-modal');
    expect(modeLabel('ferry')).toBe('ferry');
    for (const status of PROJECT_STATUSES) expect(statusLabel(status)).not.toBe(status);
  });

  it('keeps the existing scope label for unknown scopes', () => {
    expect(geoScopeLabel('metro')).toBe('Metro');
  });
});
