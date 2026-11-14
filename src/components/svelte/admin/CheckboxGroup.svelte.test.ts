import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CheckboxHarness from './CheckboxHarness.svelte';

type Registry = { selected?: string[] };

type Option = { value: string; label: string };

function renderGroup(
  props: { initial?: string[]; hint?: string; error?: string; options?: Option[] } = {},
): Registry {
  const registry: Registry = {};
  render(CheckboxHarness, { props: { ...props, registry } });
  return registry;
}

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(cleanup);

describe('CheckboxGroup', () => {
  it('renders a fieldset with the legend and one labeled checkbox per option', () => {
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

  it('checks and unchecks into the bound list, and keeps unknown values', async () => {
    const registry = renderGroup({ initial: ['13999'] });
    expect(box('13999 (not in the list)').checked).toBe(true);
    expect(box('13999 (not in the list)').id).toBe('counties-2');
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13999', '13121']);
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13999']);
    expect(box('Fulton').checked).toBe(false);
  });

  it('keeps an unchecked unknown value listed so it can be checked again', async () => {
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

  it('renders two options that share a value', () => {
    renderGroup({
      initial: ['13121'],
      options: [
        { value: '13121', label: 'Fulton' },
        { value: '13121', label: 'Fulton again' },
      ],
    });
    expect(box('Fulton').checked).toBe(true);
    expect(box('Fulton again').checked).toBe(true);
    expect(box('Fulton again').id).toBe('counties-1');
  });

  it('renders a remembered unknown value that later becomes an option', async () => {
    const registry: Registry = {};
    const { rerender } = render(CheckboxHarness, { props: { initial: ['13999'], registry } });
    expect(box('13999 (not in the list)').checked).toBe(true);
    await rerender({
      options: [
        { value: '13121', label: 'Fulton' },
        { value: '13999', label: 'Rockdale' },
      ],
    });
    expect(box('Rockdale').checked).toBe(true);
    expect(box('13999 (not in the list)').checked).toBe(true);
    expect(box('13999 (not in the list)').id).toBe('counties-2');
  });

  it('removes every occurrence of a repeated value on uncheck', async () => {
    const registry = renderGroup({ initial: ['13121', '13089', '13121'] });
    expect(box('Fulton').checked).toBe(true);
    await fireEvent.click(box('Fulton'));
    expect(registry.selected).toEqual(['13089']);
  });
});
