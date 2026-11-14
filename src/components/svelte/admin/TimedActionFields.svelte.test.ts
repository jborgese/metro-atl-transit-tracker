import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimedActionDraft } from '#lib/content/formModel/types.ts';
import TimedActionFieldsHarness from './TimedActionFieldsHarness.svelte';

type HarnessProps = ComponentProps<typeof TimedActionFieldsHarness>;

const goals = [
  { id: 'g1', goal: 'Regional goal' },
  { id: 'g2', goal: 'Second goal', is_archived: true },
  { id: 'g3', goal: 'x'.repeat(100) },
];

function renderFields(props: Partial<HarnessProps> = {}) {
  return render(TimedActionFieldsHarness, { props: { goals, ...props } });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('TimedActionFields labels', () => {
  it.each([
    'Goal (required)',
    'Description (required)',
    'Last day (required)',
    'Link button label',
    'Link web address',
    'Location button label',
    'Address',
  ])('has a control labelled %s', (label) => {
    renderFields();
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('says which fields are required', () => {
    renderFields();
    expect(screen.getByText('Fields marked (required) must be filled in.')).toBeTruthy();
  });

  it('never validates natively', () => {
    renderFields();
    const form = document.querySelector('form')!;
    expect(form.noValidate).toBe(true);
    expect(form.querySelector('[required], [maxlength], [placeholder]')).toBeNull();
    const submitted = fireEvent.submit(form);
    return submitted.then((notPrevented) => expect(notPrevented).toBe(false));
  });
});

describe('TimedActionFields goal select', () => {
  it('lists the placeholder, then active goals cut to 80 characters, and no archived goal', () => {
    renderFields();
    expect(optionTexts(screen.getByLabelText('Goal (required)'))).toEqual([
      'Choose a goal',
      'Regional goal (g1)',
      `${'x'.repeat(80)} (g3)`,
    ]);
  });

  it('lists an archived goal when it is the draft goal', () => {
    renderFields({ initial: { goal_id: 'g2' } });
    const select = screen.getByLabelText('Goal (required)') as HTMLSelectElement;
    expect(optionTexts(select)).toContain('Second goal (g2) (archived)');
    expect(select.value).toBe('g2');
  });

  it('shows a stored goal that matches nothing and keeps the value', async () => {
    const changes: TimedActionDraft[] = [];
    renderFields({ initial: { goal_id: 'gone' }, onchange: (draft) => changes.push(draft) });
    await tick();
    const select = screen.getByLabelText('Goal (required)') as HTMLSelectElement;
    expect(optionTexts(select)).toContain('gone (not found)');
    expect(select.value).toBe('gone');
    expect(changes.at(-1)?.goal_id).toBe('gone');
  });

  it.each([
    ['g2', 'Second goal (g2) (archived)'],
    ['gone', 'gone (not found)'],
  ])('keeps the loaded goal %s pickable after another goal is chosen', async (stored, text) => {
    const changes: TimedActionDraft[] = [];
    renderFields({ initial: { goal_id: stored }, onchange: (draft) => changes.push(draft) });
    const select = screen.getByLabelText('Goal (required)') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'g1' } });
    expect(select.value).toBe('g1');
    expect(optionTexts(select)).toContain(text);
    await fireEvent.change(select, { target: { value: stored } });
    expect(select.value).toBe(stored);
    expect(changes.at(-1)?.goal_id).toBe(stored);
  });

  it('selects the placeholder for a blank goal', () => {
    renderFields();
    expect((screen.getByLabelText('Goal (required)') as HTMLSelectElement).value).toBe('');
  });
});

describe('TimedActionFields limits and hints', () => {
  it('shows counters for the limited fields', () => {
    renderFields();
    const counters = [...document.querySelectorAll('.counter')].map((node) => node.textContent);
    expect(counters).toEqual([
      'You have 300 characters remaining',
      'You have 40 characters remaining',
      'You have 40 characters remaining',
      'You have 200 characters remaining',
    ]);
  });

  it('bounds the date to today plus 366 days and says so', () => {
    renderFields({ today: '2026-11-14' });
    const date = screen.getByLabelText('Last day (required)') as HTMLInputElement;
    expect(date.type).toBe('date');
    expect(date.min).toBe('2026-11-14');
    expect(date.max).toBe('2027-11-15');
    expect(
      screen.getByText(
        'The banner shows through the end of this day, Atlanta time. From 2026-11-14 to 2027-11-15.',
      ),
    ).toBeTruthy();
  });

  it('still shows a stored date outside the window', () => {
    renderFields({ initial: { expires_on: '2020-01-01' } });
    expect((screen.getByLabelText('Last day (required)') as HTMLInputElement).value).toBe(
      '2020-01-01',
    );
  });

  it('gives the other hints', () => {
    renderFields();
    expect(screen.getByText('Shown on the banner.')).toBeTruthy();
    expect(screen.getByText('Opens in Google Maps.')).toBeTruthy();
  });
});

describe('TimedActionFields editing', () => {
  it('writes each control into the draft', async () => {
    const changes: TimedActionDraft[] = [];
    renderFields({ onchange: (draft) => changes.push(draft) });
    await fireEvent.change(screen.getByLabelText('Goal (required)'), { target: { value: 'g1' } });
    await fireEvent.input(screen.getByLabelText('Description (required)'), {
      target: { value: 'Hello' },
    });
    await fireEvent.input(screen.getByLabelText('Last day (required)'), {
      target: { value: '2026-12-05' },
    });
    await fireEvent.input(screen.getByLabelText('Link button label'), { target: { value: 'L' } });
    await fireEvent.input(screen.getByLabelText('Link web address'), {
      target: { value: 'https://example.org' },
    });
    await fireEvent.input(screen.getByLabelText('Location button label'), {
      target: { value: 'M' },
    });
    await fireEvent.input(screen.getByLabelText('Address'), { target: { value: '1 Main St' } });
    const last = changes.at(-1)!;
    expect(last.goal_id).toBe('g1');
    expect(last.description).toBe('Hello');
    expect(last.expires_on).toBe('2026-12-05');
    expect(last.link).toEqual({ label: 'L', url: 'https://example.org' });
    expect(last.location).toEqual({ label: 'M', address: '1 Main St' });
  });
});

describe('TimedActionFields errors', () => {
  it.each([
    ['goal_id', 'Goal (required)'],
    ['description', 'Description (required)'],
    ['expires_on', 'Last day (required)'],
    ['link.label', 'Link button label'],
    ['link.url', 'Link web address'],
    ['location.label', 'Location button label'],
    ['location.address', 'Address'],
  ])('shows the issue at %s on %s', (path, label) => {
    renderFields({
      issues: [
        { path, message: `Problem at ${path}` },
        { path: 'other', message: 'Elsewhere' },
      ],
    });
    const control = screen.getByLabelText(label);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    const errorId = `${control.id}-error`;
    expect(control.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(document.getElementById(errorId)!.textContent).toBe(`Error: Problem at ${path}`);
    expect(screen.queryByText(/Elsewhere/)).toBeNull();
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
  });

  it('shows the web address message from the brief', () => {
    renderFields({
      issues: [
        {
          path: 'link.url',
          message: 'Link web address: enter a full web address starting with https://',
        },
      ],
    });
    const control = screen.getByLabelText('Link web address');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByText(/Link web address: enter a full web address starting with https:\/\/$/),
    ).toBeTruthy();
  });

  it('has no invalid control without issues', () => {
    renderFields();
    expect(document.querySelector('[aria-invalid]')).toBeNull();
  });
});

describe('TimedActionFields groups', () => {
  it.each(['Link (optional)', 'Location (optional)'])(
    'describes the %s group by its hint',
    (name) => {
      renderFields();
      const group = screen.getByRole('group', { name });
      expect(group.tagName).toBe('FIELDSET');
      expect(group.querySelector('legend')!.textContent).toBe(name);
      const hint = document.getElementById(group.getAttribute('aria-describedby')!);
      expect(hint!.textContent).toBe('Fill in both or leave both empty.');
      expect(group.contains(hint)).toBe(true);
    },
  );
});

describe('TimedActionFields readonly', () => {
  it('disables every control while read-only', () => {
    renderFields({ readonly: true });
    for (const label of [
      'Goal (required)',
      'Description (required)',
      'Last day (required)',
      'Link button label',
      'Link web address',
      'Location button label',
      'Address',
    ]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).matches(':disabled')).toBe(true);
    }
  });

  it('leaves the controls enabled otherwise', () => {
    renderFields();
    expect(
      (screen.getByLabelText('Description (required)') as HTMLElement).matches(':disabled'),
    ).toBe(false);
  });
});
