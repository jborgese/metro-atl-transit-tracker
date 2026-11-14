import type { TimedAction } from '#types/content.ts';

const atlantaDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function atlantaDate(now: Date): string {
  const parts = Object.fromEntries(
    atlantaDateFormat.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const tagMonths = [
  'Jan.',
  'Feb.',
  'March',
  'April',
  'May',
  'June',
  'July',
  'Aug.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dec.',
];

export function expiryTag(expiresOn: string, now: Date): string {
  const today = atlantaDate(now);
  if (expiresOn === today) return 'Expires today';
  const [year, month, day] = expiresOn.split('-');
  const yearSuffix = year === today.slice(0, 4) ? '' : `, ${year}`;
  return `Closes ${tagMonths[Number(month) - 1]} ${Number(day)}${yearSuffix}`;
}

function isSurrogateUnit(char: string): boolean {
  const code = char.charCodeAt(0);
  return char.length === 1 && code >= 0xd800 && code <= 0xdfff;
}

export function hasLoneSurrogate(text: string): boolean {
  return Array.from(text).some(isSurrogateUnit);
}

export function mapsSearchUrl(address: string): string {
  const wellFormed = Array.from(address)
    .filter((char) => !isSurrogateUnit(char))
    .join('');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wellFormed)}`;
}

export function isTimedActionLive(
  action: Pick<TimedAction, 'expires_on' | 'is_archived'>,
  goalIsActive: boolean,
  now: Date,
): boolean {
  return goalIsActive && !action.is_archived && action.expires_on >= atlantaDate(now);
}
