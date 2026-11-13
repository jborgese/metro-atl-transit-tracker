import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('logs only the formatted line when no data is given', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    createLogger('Map').error('tiles failed');

    expect(consoleError.mock.calls).toEqual([
      [expect.stringMatching(/^\[Map\] \S+ ERROR: tiles failed$/)],
    ]);
  });

  it('passes data after the formatted line', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const data = { layer: 'counties' };

    createLogger('Map').info('layer added', data);

    expect(consoleInfo.mock.calls).toEqual([
      [expect.stringMatching(/^\[Map\] \S+ INFO: layer added$/), data],
    ]);
  });
});
