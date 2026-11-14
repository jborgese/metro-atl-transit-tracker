export const PROJECT_STATUSES = [
  'planning',
  'public-outreach',
  'funding-application',
  'implementation',
  'completed',
  'ongoing',
] as const;

export const GEO_SCOPES = ['corridor', 'regional', 'county', 'local'] as const;

export const PROJECT_MODES = [
  'transit',
  'bus',
  'rail',
  'road',
  'bike',
  'walk',
  'multi-modal',
] as const;

const GEO_SCOPE_LABELS: Record<(typeof GEO_SCOPES)[number], string> = {
  corridor: 'Corridor',
  regional: 'Regional',
  county: 'County',
  local: 'Local',
};

const MODE_LABELS: Record<(typeof PROJECT_MODES)[number], string> = {
  transit: 'Transit',
  bus: 'Bus',
  rail: 'Rail',
  road: 'Road',
  bike: 'Bike',
  walk: 'Walk',
  'multi-modal': 'Multi-modal',
};

const PROJECT_STATUS_LABELS: Record<(typeof PROJECT_STATUSES)[number], string> = {
  planning: 'Planning',
  'public-outreach': 'Public Outreach',
  'funding-application': 'Funding Application',
  implementation: 'Implementation',
  completed: 'Completed',
  ongoing: 'Ongoing',
};

function lookupLabel(labels: Record<string, string>, value: string): string | undefined {
  return Object.hasOwn(labels, value) ? labels[value] : undefined;
}

export function projectStatusLabel(status: string): string | undefined {
  return lookupLabel(PROJECT_STATUS_LABELS, status);
}

export function geoScopeLabel(scope: string): string {
  return lookupLabel(GEO_SCOPE_LABELS, scope) ?? scope.charAt(0).toUpperCase() + scope.slice(1);
}

export function modeLabel(mode: string): string {
  return lookupLabel(MODE_LABELS, mode) ?? mode;
}
