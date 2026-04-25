const MEDIUM_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const FULL_DATETIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return MEDIUM_DATE.format(date);
}

export function formatTimestamp(value: string | null | undefined, reference: number = Date.now()): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diff = reference - date.getTime();
  const absDiff = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absDiff < 45_000) return 'just now';
  if (absDiff < hour) {
    const mins = Math.round(absDiff / minute);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (absDiff < day) {
    const hrs = Math.round(absDiff / hour);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }
  if (absDiff < 7 * day) {
    const days = Math.round(absDiff / day);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return FULL_DATETIME.format(date);
}
