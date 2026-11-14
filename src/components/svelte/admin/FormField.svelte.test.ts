import { cleanup, render, screen } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldHarness from './FieldHarness.svelte';

type FieldProps = ComponentProps<typeof FieldHarness>;

function renderField(props: FieldProps) {
  return render(FieldHarness, { props });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FormField', () => {
  it('labels a required field and wires its hint and error', () => {
    renderField({
      id: 'project-title',
      label: 'Title',
      required: true,
      hint: 'Shown on the card.',
      error: 'Enter a title',
    });
    const input = screen.getByLabelText('Title (required)');
    expect(input.getAttribute('aria-describedby')).toBe('project-title-hint project-title-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('project-title-error')!.textContent).toBe(
      'Error: Enter a title',
    );
  });

  it('is not invalid without an error', () => {
    renderField({ id: 'project-title', label: 'Title' });
    expect(screen.getByLabelText('Title').hasAttribute('aria-invalid')).toBe(false);
  });

  it('describes nothing when there is neither hint nor error', () => {
    renderField({ id: 'project-title', label: 'Title' });
    expect(screen.getByLabelText('Title').hasAttribute('aria-describedby')).toBe(false);
  });

  it('describes the hint alone', () => {
    renderField({ id: 'project-title', label: 'Title', hint: 'Shown on the card.' });
    expect(screen.getByLabelText('Title').getAttribute('aria-describedby')).toBe(
      'project-title-hint',
    );
    expect(screen.getByText('Shown on the card.').id).toBe('project-title-hint');
  });

  it('describes the error alone', () => {
    renderField({ id: 'project-title', label: 'Title', error: 'Enter a title' });
    expect(screen.getByLabelText('Title').getAttribute('aria-describedby')).toBe(
      'project-title-error',
    );
  });

  it.each([
    ['abc', 'You have 37 characters remaining'],
    ['  abc  ', 'You have 37 characters remaining'],
    ['x'.repeat(39), 'You have 1 character remaining'],
    ['x'.repeat(41), 'You have 1 character too many'],
    ['x'.repeat(42), 'You have 2 characters too many'],
  ])('counts %j against a limit of 40', (value, text) => {
    renderField({ id: 'action-link-label', label: 'Link button label', limit: 40, value });
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it('shows no counter without a limit', () => {
    renderField({ id: 'project-title', label: 'Title', value: 'abc' });
    expect(screen.queryByText(/characters? (remaining|too many)/)).toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('keeps the counter out of the description', () => {
    renderField({ id: 'project-title', label: 'Title', limit: 40, value: 'abc' });
    expect(screen.getByLabelText('Title').hasAttribute('aria-describedby')).toBe(false);
  });

  describe('live counter', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    const live = () => document.querySelector('[aria-live="polite"]')!;

    it('updates the announced copy one second after the value last changed', async () => {
      const { rerender } = renderField({ id: 'a', label: 'A', limit: 40, value: 'abc' });
      expect(live().textContent).toBe('You have 37 characters remaining');
      await rerender({ id: 'a', label: 'A', limit: 40, value: 'abcd' });
      await vi.advanceTimersByTimeAsync(999);
      expect(live().textContent).toBe('You have 37 characters remaining');
      await vi.advanceTimersByTimeAsync(1);
      await tick();
      expect(live().textContent).toBe('You have 36 characters remaining');
    });

    it('restarts the wait when the value changes again', async () => {
      const { rerender } = renderField({ id: 'a', label: 'A', limit: 40, value: 'abc' });
      await rerender({ id: 'a', label: 'A', limit: 40, value: 'abcd' });
      await vi.advanceTimersByTimeAsync(600);
      await rerender({ id: 'a', label: 'A', limit: 40, value: 'abcde' });
      await vi.advanceTimersByTimeAsync(600);
      expect(live().textContent).toBe('You have 37 characters remaining');
      await vi.advanceTimersByTimeAsync(400);
      await tick();
      expect(live().textContent).toBe('You have 35 characters remaining');
    });

    it('clears its timer on destroy', async () => {
      const { rerender, unmount } = renderField({ id: 'a', label: 'A', limit: 40, value: 'abc' });
      await rerender({ id: 'a', label: 'A', limit: 40, value: 'abcd' });
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
