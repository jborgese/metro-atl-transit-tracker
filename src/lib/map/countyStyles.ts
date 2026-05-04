// src/lib/map/countyStyles.ts
// Use stable GEOID (state+county FIPS) for color matching to avoid issues when names change
// GEOIDs (state+county FIPS) for the Metro Atlanta counties we highlight
export const metroCountyGeoids = ['13121', '13089', '13067', '13135', '13063', '13151'];

// Color mapping for the highlighted metro counties. This is a MapLibre expression
// using `match` on the `GEOID` property to return a color per-county, with a
// default color for all others.
export const metroCountyColorMatch = [
  'match',
  ['get', 'GEOID'],
  // GEOID -> color pairs
  '13121', '#ef4444', // Fulton
  '13089', '#f97316', // DeKalb
  '13067', '#22c55e', // Cobb
  '13135', '#a855f7', // Gwinnett
  '13063', '#ec4899', // Clayton
  '13151', '#14b8a6', // Henry
  // default
  '#3b82f6',
];
