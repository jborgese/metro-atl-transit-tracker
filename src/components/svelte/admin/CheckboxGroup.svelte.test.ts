import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CheckboxHarness from './CheckboxHarness.svelte';

type Registry = { selected?: string[] };

function renderGroup(props: { initial?: string[]; hint?: string; error?: string } = {}): Registry {
  const registry: Registry = {};
  render(CheckboxHarness, { props: { ...props, registry } });
  return registry;
}

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(cleanup);

describe('CheckboxGroup', () => {
  it('renders a fieldset with the legend and one labelled checkbox per option', () => {
    renderGroup();
    expect(screen.getByRole('group', { name: 'Counties' })).toBeTruthy();
    expect(box('Fulton').id).toBe('counties-0');
    expect(box('DeKalb').id).toBe('counties-1');
    expect(box('Fulton').type).toBe('checkbox');
  });

  it('describes the group by its hint then its error, with a visible prefix', () => {
    renderGroup({ hint: 'Pick all that apply.', error: 'Choose a county' });
    const fieldset = screen.getByRole('group', { name: 'Counties' });
    expect(fieldset.getAttribute('aria-describedby')).toBe('counties-hint counties-error');
    expect(document.getElementById('counties-hint')!.textContent).toBe('Pick all that apply.');
    expect(document.getElementById('counties-error')!.textContent).toBe('Error: Choose a county');
    expect(document.querySelector('#counties-error .visually-hidden')).toBeNull();
    expect(fieldset.hasAttribute('aria-invalid')).toBe(false);
  });

  it('describes nothing without a hint or error', () => {
    renderGroup();
    expect(screen.getByRole('group').hasAttribute('aria-describedby')).toBe(false);
  });

  it('ticks and unticks into the bound list, and keeps unknown values', async () => {
    const registry = renderGroup({ initial: ['13999'] });
    expect(box('13999 (not in the list)').checked).toBe(true);
    expect(box('13999 (not in the list)').id).toBe('counties-2');
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13999', '13121']);
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13999']);
    expect(box('Fulton').checked).toBe(false);
  });

  it('keeps an unticked unknown value listed so it can be ticked again', async () => {
    const registry = renderGroup({ initial: ['13999', '13121'] });
    await fireEvent.click(box('13999 (not in the list)'));
    expect(registry.selected).toEqual(['13121']);
    expect(box('13999 (not in the list)').checked).toBe(false);
    await fireEvent.click(box('13999 (not in the list)'));
    expect(registry.selected).toEqual(['13121', '13999']);
    expect(box('13999 (not in the list)').checked).toBe(true);
  });

  it('does not list a value that is neither an option nor present at creation', () => {
    renderGroup({ initial: ['13121'] });
    expect(screen.queryByText(/not in the list/)).toBeNull();
  });

  it('removes every occurrence of a repeated value on untick', async () => {
    const registry = renderGroup({ initial: ['13121', '13089', '13121'] });
    expect(box('Fulton').checked).toBe(true);
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13089']);
  });
});
