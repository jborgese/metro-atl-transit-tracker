import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MetroMap from './MetroMap.svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('../../lib/map/initMetroMap', () => ({
  initMetroMap: () => {
    throw new Error('Failed to initialize WebGL');
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MetroMap', () => {
  it('explains that the map is unavailable when it cannot start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(MetroMap);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain("couldn't start");
    expect(screen.queryByRole('button', { name: 'Select county at map center' })).toBeNull();
  });
});
