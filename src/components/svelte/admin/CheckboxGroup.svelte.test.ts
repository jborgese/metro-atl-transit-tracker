import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CheckboxHarness from './CheckboxHarness.svelte';

type Registry = { selected?: string[] };

type Option = { value: string; label: string };

function renderGroup(
  props: {
    initial?: string[];
    hint?: string;
    error?: string;
    options?: Option[];
    archivedOptions?: Option[];
    archivedLabel?: string;
  } = {},
): Registry {
  const registry: Registry = {};
  render(CheckboxHarness, { props: { ...props, registry } });
  return registry;
}

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(cleanup);

describe('CheckboxGroup archived options', () => {
  const archivedOptions = [
    { value: 'old-1', label: 'Old plan' },
    { value: 'old-2', label: 'Older plan' },
  ];
  const disclosure = () => document.querySelector('details') as HTMLDetailsElement;

  it('has no disclosure when there are no archived options', () => {
    renderGroup();
    expect(document.querySelector('details')).toBeNull();
  });

  it('keeps archived options apart in a closed disclosure that counts them', () => {
    renderGroup({ archivedOptions, archivedLabel: 'Archived projects' });
    expect(disclosure().open).toBe(false);
    expect(disclosure().querySelector('summary')!.textContent).toBe('Archived projects (2)');
    expect(disclosure().contains(box('Old plan (archived)'))).toBe(true);
    expect(disclosure().contains(box('Older plan (archived)'))).toBe(true);
    expect(disclosure().contains(box('Fulton'))).toBe(false);
    expect(disclosure().contains(box('DeKalb'))).toBe(false);
  });

  it('shows the archived name alone and keeps the archived note for screen readers', () => {
    renderGroup({ archivedOptions, archivedLabel: 'Archived projects' });
    const label = document.querySelector(`label[for="${box('Old plan (archived)').id}"]`)!;
    expect(label.querySelector('.visually-hidden')!.textContent).toBe('(archived)');
    expect(label.firstChild!.textContent!.trim()).toBe('Old plan');
  });

  it('says how many archived options are selected while closed', async () => {
    renderGroup({ initial: ['old-2'], archivedOptions, archivedLabel: 'Archived projects' });
    const summary = disclosure().querySelector('summary')!;
    expect(disclosure().open).toBe(false);
    expect(summary.textContent).toBe('Archived projects (2, 1 selected)');
    expect(box('Older plan (archived)').checked).toBe(true);
    await fireEvent.click(box('Older plan (archived)'));
    expect(summary.textContent).toBe('Archived projects (2)');
  });

  it('checks and unchecks archived options into the same bound list', async () => {
    const registry = renderGroup({ initial: ['13121'], archivedOptions });
    await fireEvent.click(box('Old plan (archived)'));
    expect(registry.selected).toEqual(['13121', 'old-1']);
    await fireEvent.click(box('Old plan (archived)'));
    expect(registry.selected).toEqual(['13121']);
  });

  it('gives every checkbox a unique id and does not treat an archived value as unknown', () => {
    renderGroup({ initial: ['old-1', '13999'], archivedOptions });
    const ids = [...document.querySelectorAll('input[type="checkbox"]')].map((input) => input.id);
    expect(ids).toEqual(['counties-0', 'counties-1', 'counties-2', 'counties-3', 'counties-4']);
    expect(screen.queryByLabelText('old-1 (not in the list)')).toBeNull();
    expect(disclosure().contains(box('13999 (not in the list)'))).toBe(false);
    expect(box('13999 (not in the list)').checked).toBe(true);
  });
});

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
