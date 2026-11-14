import { describe, expect, it } from 'vitest';
import { atlantaDate, isTimedActionLive } from './timedActions';

describe('atlantaDate', () => {
  it.each([
    ['2026-12-01T04:59:59Z', '2026-11-30'],
    ['2026-12-01T05:00:00Z', '2026-12-01'],
    ['2026-07-01T03:59:59Z', '2026-06-30'],
    ['2026-07-01T04:00:00Z', '2026-07-01'],
    ['2026-03-08T04:59:59Z', '2026-03-07'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-11-01T03:59:59Z', '2026-10-31'],
    ['2026-11-01T04:00:00Z', '2026-11-01'],
  ])('atlantaDate(%s) is %s', (instant, expected) => {
    expect(atlantaDate(new Date(instant))).toBe(expected);
  });
});

describe('isTimedActionLive', () => {
  const action = { expires_on: '2026-11-30', is_archived: false };

  it('is live through the end of the last day in Atlanta', () => {
    expect(isTimedActionLive(action, true, new Date('2026-12-01T04:59:59Z'))).toBe(true);
    expect(isTimedActionLive(action, true, new Date('2026-12-01T05:00:00Z'))).toBe(false);
  });

  it('is not live when archived or when its goal is not active', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(isTimedActionLive({ ...action, is_archived: true }, true, now)).toBe(false);
    expect(isTimedActionLive(action, false, now)).toBe(false);
  });
});
