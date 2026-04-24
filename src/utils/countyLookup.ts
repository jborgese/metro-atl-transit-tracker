export const COUNTY_NAMES: Record<string, string> = {
  '13121': 'Fulton County',
  '13089': 'DeKalb County',
  '13067': 'Cobb County',
  '13135': 'Gwinnett County',
  '13063': 'Clayton County',
  '13151': 'Henry County',
};

export const countyOrder: string[] = ['13121', '13089', '13067', '13135', '13063', '13151'];

export function getCountyName(geoid: string, overrides?: Record<string, string>): string {
  if (overrides && overrides[geoid]) {
    return overrides[geoid];
  }
  return COUNTY_NAMES[geoid] ?? `County ${geoid}`;
}

export function shortCountyName(geoid: string, overrides?: Record<string, string>): string {
  return getCountyName(geoid, overrides).replace(/ County$/, '');
}
