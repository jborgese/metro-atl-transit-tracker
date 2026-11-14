import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import RowsHarness from './RowsHarness.svelte';

type Row = { key: string; label: string };
type Registry = { rows?: Row[] };

function renderRows(
  props: { initial?: string[]; reorder?: boolean; hint?: string } = {},
): Registry {
  const registry: Registry = {};
  render(RowsHarness, { props: { ...props, registry } });
  return registry;
}

async function addRows(count: number, labels: string[] = []) {
  for (let index = 0; index < count; index += 1) {
    const name = index === 0 ? 'Add a source' : 'Add another source';
    await fireEvent.click(screen.getByRole('button', { name }));
    const label = labels[index];
    if (label !== undefined) {
      const group = screen.getByRole('group', { name: `Source ${index + 1}` });
      await fireEvent.input(within(group).getByLabelText('Label'), { target: { value: label } });
    }
  }
}

function labelsInOrder() {
  return (screen.getAllByLabelText('Label') as HTMLInputElement[]).map((input) => input.value);
}

const button = (name: string) => screen.getByRole('button', { name });
const group = (name: string) => screen.getByRole('group', { name });

afterEach(cleanup);

describe('RepeatableRows', () => {
  it('adds a row and focuses its first field', async () => {
    renderRows();
    await fireEvent.click(button('Add a source'));
    expect(group('Source 1')).toBeTruthy();
    expect(document.activeElement).toBe(within(group('Source 1')).getByLabelText('Label'));
    expect(button('Add another source')).toBeTruthy();
  });

  it('shows the empty state and the first add label with no rows', () => {
    renderRows();
    expect(screen.getByText('No sources yet.')).toBeTruthy();
    expect(button('Add a source')).toBeTruthy();
  });

  it('removes a row, focuses the previous one and announces it', async () => {
    renderRows();
    await addRows(3);
    await fireEvent.click(button('Remove source 2'));
    expect(document.activeElement).toBe(group('Source 1'));
    expect(screen.getByRole('status').textContent).toBe('Source 2 removed. 2 sources left.');
  });

  it('focuses the new first row when the first of three is removed', async () => {
    renderRows();
    await addRows(3);
    await fireEvent.click(button('Remove source 1'));
    expect(document.activeElement).toBe(group('Source 1'));
    expect(screen.getAllByRole('group', { name: /^Source \d$/ })).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('Source 1 removed. 2 sources left.');
  });

  it('announces the singular when one row is left', async () => {
    renderRows();
    await addRows(2);
    await fireEvent.click(button('Remove source 2'));
    expect(screen.getByRole('status').textContent).toBe('Source 2 removed. 1 source left.');
  });

  it('focuses the add button when the last row goes', async () => {
    renderRows();
    await addRows(1);
    await fireEvent.click(button('Remove source 1'));
    expect(document.activeElement).toBe(button('Add a source'));
    expect(screen.getByText('No sources yet.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Source 1 removed. 0 sources left.');
  });

  it('moves a row up and keeps focus on it', async () => {
    renderRows({ reorder: true });
    await addRows(2, ['first', 'second']);
    await fireEvent.click(button('Move source 2 up'));
    expect(labelsInOrder()).toEqual(['second', 'first']);
    expect(document.activeElement).toBe(group('Source 1'));
    expect(screen.queryByRole('button', { name: 'Move source 1 up' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Source 2 moved up.');
  });

  it('moves a row down, keeps focus on it and announces it', async () => {
    renderRows({ reorder: true });
    await addRows(2, ['first', 'second']);
    await fireEvent.click(button('Move source 1 down'));
    expect(labelsInOrder()).toEqual(['second', 'first']);
    expect(document.activeElement).toBe(group('Source 2'));
    expect(screen.getByRole('status').textContent).toBe('Source 1 moved down.');
  });

  it('offers no move up on the first row and no move down on the last', async () => {
    renderRows({ reorder: true });
    await addRows(3);
    expect(screen.queryByRole('button', { name: 'Move source 1 up' })).toBeNull();
    expect(button('Move source 1 down')).toBeTruthy();
    expect(button('Move source 2 up')).toBeTruthy();
    expect(button('Move source 2 down')).toBeTruthy();
    expect(button('Move source 3 up')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move source 3 down' })).toBeNull();
  });

  it('offers no move buttons unless reordering is on', async () => {
    renderRows();
    await addRows(2);
    expect(screen.queryAllByRole('button', { name: /^Move/ })).toHaveLength(0);
    expect(button('Remove source 1')).toBeTruthy();
  });

  it('keeps typed values with their rows after a move and after a removal', async () => {
    renderRows({ reorder: true });
    await addRows(3, ['a', 'b', 'c']);
    await fireEvent.click(button('Move source 1 down'));
    expect(labelsInOrder()).toEqual(['b', 'a', 'c']);
    await fireEvent.click(button('Remove source 1'));
    expect(labelsInOrder()).toEqual(['a', 'c']);
  });

  it('keeps the same row objects in the bound list after a move', async () => {
    const registry = renderRows({ reorder: true });
    await addRows(2, ['first', 'second']);
    const before = [...registry.rows!] as [Row, Row];
    await fireEvent.click(button('Move source 1 down'));
    expect(registry.rows!.map((row) => row.key)).toEqual([before[1].key, before[0].key]);
    expect(registry.rows![0]).toBe(before[1]);
    expect(registry.rows![1]).toBe(before[0]);
    expect(registry.rows!.map((row) => row.label)).toEqual(['second', 'first']);
  });

  it('renders the hint and references it from the outer fieldset', () => {
    renderRows({ hint: 'Add at least one.' });
    expect(screen.getByText('Add at least one.').id).toBe('sources-hint');
    expect(group('Sources').getAttribute('aria-describedby')).toBe('sources-hint');
  });

  it('describes nothing without a hint', () => {
    renderRows();
    expect(group('Sources').hasAttribute('aria-describedby')).toBe(false);
  });

  it('makes every button a plain button', async () => {
    renderRows({ reorder: true });
    await addRows(3);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(5);
    for (const each of buttons) {
      expect(each.getAttribute('type')).toBe('button');
    }
  });
});
