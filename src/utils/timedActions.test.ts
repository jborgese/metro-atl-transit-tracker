import { describe, expect, it } from 'vitest';
import {
  atlantaDate,
  expiryTag,
  hasLoneSurrogate,
  isTimedActionLive,
  mapsSearchUrl,
} from './timedActions';

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

describe('expiryTag', () => {
  it('tags the last day and earlier days', () => {
    expect(expiryTag('2026-11-30', new Date('2026-11-30T15:00:00Z'))).toBe('Expires today');
    expect(expiryTag('2026-11-30', new Date('2026-11-20T15:00:00Z'))).toBe('Closes Nov. 30');
    expect(expiryTag('2026-05-04', new Date('2026-04-20T15:00:00Z'))).toBe('Closes May 4');
    expect(expiryTag('2027-01-15', new Date('2026-12-20T15:00:00Z'))).toBe('Closes Jan. 15, 2027');
  });
});

describe('mapsSearchUrl', () => {
  it('builds a Google Maps search link', () => {
    expect(mapsSearchUrl('1050 Murphy Ave SW, Atlanta, GA')).toBe(
      'https://www.google.com/maps/search/?api=1&query=1050%20Murphy%20Ave%20SW%2C%20Atlanta%2C%20GA',
    );
    expect(mapsSearchUrl('5th & Main #2, Décatur')).toBe(
      'https://www.google.com/maps/search/?api=1&query=5th%20%26%20Main%20%232%2C%20D%C3%A9catur',
    );
  });

  it('drops lone surrogates instead of throwing and keeps paired emoji', () => {
    expect(mapsSearchUrl('A\ud83dB')).toBe(mapsSearchUrl('AB'));
    expect(mapsSearchUrl('A\ude00B')).toBe(mapsSearchUrl('AB'));
    expect(mapsSearchUrl('A\u{1F600}B')).toContain('%F0%9F%98%80');
  });
});

describe('hasLoneSurrogate', () => {
  it('detects ill-formed text only', () => {
    expect(hasLoneSurrogate('A\ud83dB')).toBe(true);
    expect(hasLoneSurrogate('\ude00')).toBe(true);
    expect(hasLoneSurrogate('A\u{1F600}B')).toBe(false);
    expect(hasLoneSurrogate('plain')).toBe(false);
  });
});
