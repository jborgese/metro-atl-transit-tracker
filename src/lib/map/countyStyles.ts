// src/lib/map/countyStyles.ts
// Use stable GEOID (state+county FIPS) for color matching to avoid issues when names change
export const metroCountyColorMatch = [
  'match',
  ['get', 'GEOID'],
  // GEOIDs (13 + county FIPS)
  '13121', '#ef4444', // Fulton
  '13089', '#f97316', // DeKalb
  '13067', '#22c55e', // Cobb
  '13135', '#a855f7', // Gwinnett
  '#3b82f6', // default
]
