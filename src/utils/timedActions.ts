import type { TimedAction } from '#types/content.ts';

const atlantaDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function atlantaDate(now: Date): string {
  return atlantaDateFormat.format(now);
}

export function isTimedActionLive(
  action: Pick<TimedAction, 'expires_on' | 'is_archived'>,
  goalIsActive: boolean,
  now: Date,
): boolean {
  return goalIsActive && !action.is_archived && action.expires_on >= atlantaDate(now);
}
