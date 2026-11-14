import { describe, expect, it } from 'vitest';
import { isCalendarDate } from './dates';

describe('isCalendarDate', () => {
  it.each(['2026-11-14', '2026-01-01', '2026-12-31', '2026-04-30', '0001-01-01', '9999-12-31'])(
    'accepts the real day %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(true);
    },
  );

  it.each(['2024-02-29', '2000-02-29', '2400-02-29'])('accepts the leap day %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each(['2026-02-29', '1900-02-29', '2100-02-29'])(
    'rejects %s, which is not a leap year',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );

  it.each(['2026-02-30', '2026-04-31', '2026-01-32', '2026-01-00', '2026-13-01', '2026-00-10'])(
    'rejects the day that does not exist, %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );

  it.each([
    'Spring 2027',
    '2026-1-01',
    '2026-01-1',
    '26-01-01',
    '2026/01/01',
    '2026-01-01T00:00:00Z',
    ' 2026-01-01',
    '2026-01-01 ',
    '０２０２６-01-01',
    '0000-01-01',
    '+2026-01-01',
  ])('rejects %j, which is not a YYYY-MM-DD day', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each(['', '   '])('rejects the blank value %j', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
